import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import {
  asServiceRole,
  PrivilegedAccessError,
  closePool,
  type PrivilegedAccessRequest,
} from '@/lib/db/client'
import { asSuperuser, closeTestPool } from '../helpers/db'

/**
 * The privileged, RLS-bypassing path (Workstream 3).
 *
 * The defect these cover: `asServiceRole` previously required only a free-text reason
 * of eight characters. A caller could obtain a `service_role` session — which bypasses
 * every row-level policy in the database — with no actor, no permission check, and no
 * record that it happened. The reason string was never stored anywhere.
 *
 * These tests use real roles and permissions seeded into identity.user_roles, so the
 * decision under test is the database's, not a stub's.
 */

const REQUEST_ID = 'test-request-0001'

/** A permission that exists in the seeded role model, and a role that holds it. */
let permittedActor: string
let unprivilegedActor: string
let permission: string

async function auditRowsFor(requestId: string) {
  return asSuperuser(async (c) => {
    const r = await c.query(
      `SELECT actor_id, action, resource_type, resource_id, decision, request_id, detail
         FROM audit.events WHERE request_id = $1 ORDER BY id`,
      [requestId],
    )
    return r.rows
  })
}

function request(overrides: Partial<PrivilegedAccessRequest> = {}): PrivilegedAccessRequest {
  return {
    actorId: permittedActor,
    permission,
    operation: 'test.privileged_operation',
    resourceType: 'content_item',
    resourceId: '11111111-1111-1111-1111-111111111111',
    requestId: REQUEST_ID,
    reason: 'exercising the privileged path in tests',
    ...overrides,
  }
}

beforeAll(async () => {
  await asSuperuser(async (c) => {
    // A permission that genuinely exists, and the role that holds it.
    const perm = await c.query<{ permission_key: string; role_key: string }>(
      `SELECT rp.permission_key, rp.role_key
         FROM identity.role_permissions rp
        ORDER BY rp.permission_key
        LIMIT 1`,
    )
    permission = perm.rows[0]!.permission_key
    const roleKey = perm.rows[0]!.role_key

    // Same shape as seedFixture(): keyed on a fixture email, id assigned by the
    // database. Idempotent so the file can run repeatedly.
    const ensureUser = async (email: string): Promise<string> => {
      const existing = await c.query<{ id: string }>('SELECT id FROM auth.users WHERE email=$1', [
        email,
      ])
      if (existing.rows[0]) return existing.rows[0].id
      const created = await c.query<{ id: string }>(
        'INSERT INTO auth.users(email, email_confirmed_at) VALUES ($1, now()) RETURNING id',
        [email],
      )
      return created.rows[0]!.id
    }

    permittedActor = await ensureUser('privileged-permitted@fixture.crux.test')
    unprivilegedActor = await ensureUser('privileged-denied@fixture.crux.test')

    await c.query(
      `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
      [permittedActor, roleKey],
    )
  })
})

afterEach(async () => {
  await asSuperuser(async (c) => {
    // audit.events is append-only by trigger, so clear it as the table owner with the
    // trigger disabled. Test hygiene only; the append-only guarantee is asserted by
    // tests/db/immutability.test.ts and is not weakened here.
    await c.query('ALTER TABLE audit.events DISABLE TRIGGER USER')
    await c.query('DELETE FROM audit.events WHERE request_id LIKE $1', ['test-request-%'])
    await c.query('ALTER TABLE audit.events ENABLE TRIGGER USER')
  })
})

afterAll(async () => {
  await asSuperuser(async (c) => {
    await c.query('DELETE FROM identity.user_roles WHERE user_id = ANY($1::uuid[])', [
      [permittedActor, unprivilegedActor],
    ])
    await c.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
      [permittedActor, unprivilegedActor],
    ])
  })
  await closePool()
  await closeTestPool()
})

describe('the request is rejected before any connection is opened', () => {
  it.each([
    ['actorId', { actorId: '' }],
    ['permission', { permission: '' }],
    ['operation', { operation: '' }],
    ['requestId', { requestId: '' }],
    ['reason', { reason: '' }],
  ])('refuses a missing %s', async (_field, override) => {
    let ran = false
    await expect(
      asServiceRole(request(override as Partial<PrivilegedAccessRequest>), async () => {
        ran = true
      }),
    ).rejects.toThrow(PrivilegedAccessError)
    expect(ran, 'the callback must never run').toBe(false)
  })

  it('refuses an anonymous actor', async () => {
    // The previous interface accepted ctx.userId === null and proceeded.
    await expect(
      asServiceRole(request({ actorId: '' }), async () => 'x'),
    ).rejects.toThrow(/actor identity/)
  })

  it('refuses an actor id that is not a user id', async () => {
    await expect(
      asServiceRole(request({ actorId: 'anonymous' }), async () => 'x'),
    ).rejects.toThrow(/Anonymous callers hold no permissions/)
  })

  it('refuses a reason that states nothing', async () => {
    await expect(asServiceRole(request({ reason: 'because' }), async () => 'x')).rejects.toThrow(
      /reason describing why RLS cannot express/,
    )
  })

  it('refuses a resourceType with no resourceId', async () => {
    await expect(
      asServiceRole(request({ resourceType: 'content_item', resourceId: '' }), async () => 'x'),
    ).rejects.toThrow(/must also name the resourceId/)
  })

  it('writes no audit row for a malformed request', async () => {
    await expect(asServiceRole(request({ permission: '' }), async () => 'x')).rejects.toThrow()
    expect(await auditRowsFor(REQUEST_ID)).toHaveLength(0)
  })

  it('reports invalid_request as the failure code', async () => {
    try {
      await asServiceRole(request({ operation: '' }), async () => 'x')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as PrivilegedAccessError).code).toBe('invalid_request')
    }
  })
})

describe('a denied permission', () => {
  it('refuses an actor who does not hold the permission', async () => {
    await expect(
      asServiceRole(request({ actorId: unprivilegedActor }), async () => 'x'),
    ).rejects.toThrow(PrivilegedAccessError)
  })

  it('never runs the callback', async () => {
    let ran = false
    await expect(
      asServiceRole(request({ actorId: unprivilegedActor }), async () => {
        ran = true
      }),
    ).rejects.toThrow()
    expect(ran, 'the caller must not receive a privileged session').toBe(false)
  })

  it('reports permission_denied as the failure code', async () => {
    try {
      await asServiceRole(request({ actorId: unprivilegedActor }), async () => 'x')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as PrivilegedAccessError).code).toBe('permission_denied')
    }
  })

  it('records the refusal, and the record survives the rollback', async () => {
    await expect(
      asServiceRole(request({ actorId: unprivilegedActor }), async () => 'x'),
    ).rejects.toThrow()

    const rows = await auditRowsFor(REQUEST_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.decision).toBe('denied')
    expect(rows[0]!.actor_id).toBe(unprivilegedActor)
    expect(rows[0]!.action).toBe('test.privileged_operation')
  })

  it('refuses an actor that holds a different permission', async () => {
    await expect(
      asServiceRole(request({ permission: 'no.such.permission' }), async () => 'x'),
    ).rejects.toThrow(/does not hold/)
  })
})

describe('a successful privileged operation', () => {
  it('runs the callback and returns its value', async () => {
    const result = await asServiceRole(request(), async (s) => {
      const rows = await s.query<{ n: number }>('SELECT 1::int AS n')
      return rows[0]!.n
    })
    expect(result).toBe(1)
  })

  it('writes exactly one permitted audit row, with the operation detail', async () => {
    await asServiceRole(request(), async () => 'ok')

    const rows = await auditRowsFor(REQUEST_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.decision).toBe('performed')
    expect(rows[0]!.actor_id).toBe(permittedActor)
    expect(rows[0]!.resource_type).toBe('content_item')
    expect(rows[0]!.request_id).toBe(REQUEST_ID)
    expect(rows[0]!.detail).toMatchObject({ permission, reason: expect.any(String) })
  })

  it('actually bypasses RLS, which is the point of the path', async () => {
    // A draft version is invisible to anon (tests/rls/draft-isolation.test.ts proves
    // that). service_role must see it, or the path is not doing its job.
    const count = await asServiceRole(request(), async (s) => {
      const rows = await s.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM cms.content_versions WHERE status = 'draft'`,
      )
      return Number(rows[0]!.c)
    })
    expect(count).toBeGreaterThan(0)
  })
})

describe('rollback behaviour', () => {
  it('rolls the operation back when the callback throws', async () => {
    const marker = 'rollback-probe-' + REQUEST_ID
    await expect(
      asServiceRole(request(), async (s) => {
        await s.query(
          `INSERT INTO audit.events (actor_id, action, resource_type, decision, request_id)
           VALUES ($1, $2, 'probe', 'performed', $3)`,
          [permittedActor, marker, REQUEST_ID],
        )
        throw new Error('operation failed after writing')
      }),
    ).rejects.toThrow('operation failed after writing')

    // Neither the probe row nor an audit row for the attempt survives.
    expect(await auditRowsFor(REQUEST_ID)).toHaveLength(0)
  })

  it('rolls the operation back when the audit write fails', async () => {
    // Force the audit insert to fail by removing the column it targets for the
    // duration of the call. The operation must not survive.
    const probeId = '22222222-2222-2222-2222-222222222222'
    await asSuperuser(async (c) => {
      await c.query(`CREATE TABLE IF NOT EXISTS public.rollback_probe (id uuid primary key)`)
      // service_role has BYPASSRLS but still needs a grant on a table created here.
      await c.query(`GRANT INSERT, SELECT ON public.rollback_probe TO service_role`)
    })

    await asSuperuser((c) =>
      c.query(`ALTER TABLE audit.events RENAME COLUMN decision TO decision_renamed`),
    )
    try {
      await expect(
        asServiceRole(request(), async (s) => {
          await s.query('INSERT INTO public.rollback_probe (id) VALUES ($1)', [probeId])
          return 'work done'
        }),
      ).rejects.toThrow(PrivilegedAccessError)
    } finally {
      await asSuperuser((c) =>
        c.query(`ALTER TABLE audit.events RENAME COLUMN decision_renamed TO decision`),
      )
    }

    const survived = await asSuperuser(async (c) => {
      const r = await c.query('SELECT count(*)::int AS c FROM public.rollback_probe WHERE id = $1', [
        probeId,
      ])
      return r.rows[0].c as number
    })
    expect(survived, 'the operation must not survive a failed audit write').toBe(0)

    await asSuperuser((c) => c.query('DROP TABLE IF EXISTS public.rollback_probe'))
  })

  it('reports audit_write_failed as the failure code', async () => {
    await asSuperuser((c) =>
      c.query(`ALTER TABLE audit.events RENAME COLUMN decision TO decision_renamed`),
    )
    try {
      await asServiceRole(request(), async () => 'x')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as PrivilegedAccessError).code).toBe('audit_write_failed')
    } finally {
      await asSuperuser((c) =>
        c.query(`ALTER TABLE audit.events RENAME COLUMN decision_renamed TO decision`),
      )
    }
  })
})
