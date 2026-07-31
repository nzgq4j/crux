import 'server-only'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { serverEnv } from '@/lib/env/server'

/**
 * Database access (Block 03, Block 04).
 *
 * Three access modes, mirroring the three Supabase clients:
 *
 *   `asAnon`          — the `anon` role, no JWT. RLS applies.
 *   `asUser`          — the `authenticated` role with request.jwt.claims set. RLS applies.
 *   `asServiceRole`   — the `service_role`, which BYPASSES RLS.
 *
 * The GUC/role mechanism is exactly what Supabase's PostgREST layer does, so the same
 * policies govern local development, the test suite, and production. See
 * docs/assumptions.md for why the local path talks to PostgreSQL directly.
 *
 * `asServiceRole` is the privileged path. Every caller must perform an explicit
 * permission check first and write an audit row — see rules/security.md rule 2.
 */

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: serverEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export interface RequestContext {
  /** Authenticated user id, or null for an anonymous request. */
  userId: string | null
  /** Correlates database audit rows with application logs (Block 19). */
  requestId?: string
}

type Runner = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: readonly unknown[],
) => Promise<T[]>

export interface Session {
  query: Runner
  one: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<T | null>
  client: PoolClient
}

async function withRole<T>(
  role: 'anon' | 'authenticated' | 'service_role',
  ctx: RequestContext,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    // set_config with is_local = true scopes these to the transaction, so a pooled
    // connection can never leak one request's identity into the next.
    await client.query('SELECT set_config($1, $2, true)', ['role', role])
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      ctx.userId ? JSON.stringify({ sub: ctx.userId, role }) : '',
    ])
    if (ctx.requestId) {
      await client.query('SELECT set_config($1, $2, true)', ['request.id', ctx.requestId])
    }

    const query: Runner = async (sql, params) => {
      const result = await client.query(sql, params ? [...params] : undefined)
      return result.rows as never
    }

    const session: Session = {
      query,
      one: async (sql, params) => {
        const rows = await query(sql, params)
        return (rows[0] ?? null) as never
      },
      client,
    }

    const out = await fn(session)
    await client.query('COMMIT')
    return out
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/** Anonymous access. RLS applies with no JWT. */
export function asAnon<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  return withRole('anon', { userId: null }, fn)
}

/** Authenticated access. RLS applies with the user's claims. */
export function asUser<T>(ctx: RequestContext, fn: (s: Session) => Promise<T>): Promise<T> {
  return withRole('authenticated', ctx, fn)
}

/**
 * A request for privileged, RLS-bypassing access (Workstream 3).
 *
 * Every field is required except the resource pair, which is required whenever the
 * operation has a subject. The previous interface asked only for a free-text reason,
 * which meant a caller could obtain a `service_role` session — bypassing every policy
 * in the database — by typing eight characters, with no actor, no permission, and no
 * record that it happened.
 */
export interface PrivilegedAccessRequest {
  /** The human or system actor whose authority is being exercised. Must be a user id. */
  actorId: string
  /** The permission the actor must hold, from the platform's own role model. */
  permission: string
  /** Stable identifier for the operation, e.g. `content.force_withdraw`. */
  operation: string
  /** The kind of thing being acted on, where the operation has a subject. */
  resourceType?: string
  /** The specific thing being acted on. Required when resourceType is given. */
  resourceId?: string
  /** Correlates this decision with application logs (Block 19). */
  requestId: string
  /** Why RLS cannot express this operation. Recorded in the audit row. */
  reason: string
}

export type PrivilegedAccessFailure =
  | 'invalid_request'
  | 'permission_denied'
  | 'audit_write_failed'

export class PrivilegedAccessError extends Error {
  readonly code: PrivilegedAccessFailure
  constructor(code: PrivilegedAccessFailure, message: string) {
    super(message)
    this.name = 'PrivilegedAccessError'
    this.code = code
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validate(request: PrivilegedAccessRequest): void {
  const required: Array<[keyof PrivilegedAccessRequest, string]> = [
    ['actorId', 'an actor identity'],
    ['permission', 'the permission the actor must hold'],
    ['operation', 'an operation identifier'],
    ['requestId', 'a request id'],
    ['reason', 'a reason'],
  ]
  for (const [field, description] of required) {
    const value = request[field]
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new PrivilegedAccessError(
        'invalid_request',
        `Privileged access requires ${description} (${String(field)}).`,
      )
    }
  }
  if (!UUID.test(request.actorId.trim())) {
    throw new PrivilegedAccessError(
      'invalid_request',
      'Privileged access requires actorId to be a user id. Anonymous callers hold no permissions.',
    )
  }
  if (request.reason.trim().length < 8) {
    throw new PrivilegedAccessError(
      'invalid_request',
      'Privileged access requires a reason describing why RLS cannot express the operation.',
    )
  }
  if (request.resourceType !== undefined && !request.resourceId?.trim()) {
    throw new PrivilegedAccessError(
      'invalid_request',
      'Privileged access naming a resourceType must also name the resourceId.',
    )
  }
}

/**
 * The audit write goes through the database function rather than a raw INSERT, so the
 * `decision` check constraint stays the single authority on the vocabulary and the
 * append-only triggers apply uniformly.
 */
const AUDIT_WRITE = 'SELECT private.log_privileged_audit($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)'

/** The audit table's vocabulary: allowed, denied, performed, failed. */
type AuditDecision = 'performed' | 'denied'

function auditParams(request: PrivilegedAccessRequest, decision: AuditDecision): unknown[] {
  return [
    request.actorId.trim(),
    request.operation.trim(),
    request.resourceType?.trim() ?? 'privileged_operation',
    request.resourceId?.trim() ?? null,
    decision,
    request.requestId.trim(),
    JSON.stringify({ reason: request.reason.trim(), permission: request.permission.trim() }),
  ]
}

/**
 * Record a refusal on its own connection, so it survives the rollback of the
 * transaction that refused. A denied attempt is precisely the thing an audit log
 * exists to retain.
 */
async function recordDenial(request: PrivilegedAccessRequest): Promise<void> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['role', 'service_role'])
    await client.query(AUDIT_WRITE, auditParams(request, 'denied'))
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Privileged access that BYPASSES RLS.
 *
 * Use only where RLS cannot express the operation. Every call site is enumerable by
 * `grep -rn "asServiceRole" src/` — the static check required by Block 27 — and the
 * conformance suite refuses any call site outside `src/lib/db/`.
 *
 * The permission check, the privileged work, and the audit write happen inside one
 * transaction. If authorization fails the work never runs; if the audit write fails
 * the work is rolled back. There is no path that performs a privileged operation
 * without leaving a record of it, and no path that hands the caller a privileged
 * session before authorization has succeeded.
 */
export async function asServiceRole<T>(
  request: PrivilegedAccessRequest,
  fn: (s: Session) => Promise<T>,
): Promise<T> {
  // Before any connection is opened: a malformed request never reaches the database.
  validate(request)

  const client = await getPool().connect()
  // Set only where the database actually returned a refusal. A connection or query
  // failure before the check is not a denial and must not be recorded as one.
  let denied = false
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['role', 'service_role'])
    await client.query('SELECT set_config($1, $2, true)', ['request.id', request.requestId.trim()])

    const check = await client.query<{ allowed: boolean }>(
      'SELECT private.actor_has_permission($1::uuid, $2) AS allowed',
      [request.actorId.trim(), request.permission.trim()],
    )

    if (check.rows[0]?.allowed !== true) {
      denied = true
      // Thrown, not rolled back here: the catch below owns the rollback, so there is
      // exactly one path that ends the transaction.
      throw new PrivilegedAccessError(
        'permission_denied',
        `Actor does not hold '${request.permission}' for operation '${request.operation}'.`,
      )
    }

    const query: Runner = async (sql, params) => {
      const result = await client.query(sql, params ? [...params] : undefined)
      return result.rows as never
    }
    const session: Session = {
      query,
      one: async (sql, params) => {
        const rows = await query(sql, params)
        return (rows[0] ?? null) as never
      },
      client,
    }

    const out = await fn(session)

    // Inside the same transaction: if this fails, the operation above is undone.
    try {
      await client.query(AUDIT_WRITE, auditParams(request, 'performed'))
    } catch (cause) {
      throw new PrivilegedAccessError(
        'audit_write_failed',
        `Privileged operation '${request.operation}' was rolled back because its audit row could not be written: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      )
    }

    await client.query('COMMIT')
    return out
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    // The refusal is recorded on a fresh connection, after this one is returned, so
    // it cannot be caught up in the rollback above. A denied attempt is precisely
    // what an audit log exists to retain, and rolling it back would erase it.
    if (denied) {
      await recordDenial(request).catch(() => undefined)
    }
  }
}
