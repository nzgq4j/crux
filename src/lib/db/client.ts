import 'server-only'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { serverEnv } from '@/lib/env'

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
 * Privileged access that BYPASSES RLS.
 *
 * Use only where RLS cannot express the operation, only after an explicit permission
 * check, and always with an audit write. Every call site is enumerable by
 * `grep -rn "asServiceRole" src/` — the static check required by Block 27.
 */
export function asServiceRole<T>(
  ctx: RequestContext,
  reason: string,
  fn: (s: Session) => Promise<T>,
): Promise<T> {
  if (!reason || reason.trim().length < 8) {
    throw new Error('asServiceRole requires a stated reason for the privileged access.')
  }
  return withRole('service_role', ctx, fn)
}
