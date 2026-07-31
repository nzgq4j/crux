import { describe, it, expect, afterAll, vi } from 'vitest'
import { asSuperuser, closeTestPool } from '../helpers/db'

/**
 * The server-side authorization resolver (Block 06).
 *
 * `src/lib/auth/permissions` reads identity from the session helper and permissions
 * from the database. The session half needs a real auth server, which the local
 * cluster does not have — so the identity is stubbed at the module boundary and the
 * *authorization* half runs against the real `identity` tables.
 *
 * That split is deliberate and is the whole point of the design: a token establishes
 * who the caller is, and the database decides what they may do. Only the first half
 * needs Supabase. The second half — the half that grants or refuses — is exercised
 * here for real, with real roles, real grants and real RLS.
 */

const session = vi.hoisted(() => ({
  current: null as { id: string; email: string | null; emailVerifiedAt: string | null } | null,
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => session.current,
  isVerified: (u: { emailVerifiedAt: string | null } | null) => Boolean(u?.emailVerifiedAt),
  authConfigured: () => true,
  createRequestClient: async () => {
    throw new Error('createRequestClient must not be reached in these tests')
  },
}))

// React's `cache` memoises per request; under vitest there is no request, so it
// memoises for the life of the module. Import fresh per test to keep them independent.
async function auth() {
  vi.resetModules()
  return import('@/lib/auth/permissions')
}

/** A committed user with the given roles, cleaned up afterwards. */
const created: string[] = []
async function userWithRoles(label: string, roles: string[], verified = true): Promise<string> {
  return asSuperuser(async (c) => {
    const email = `auth-${label}-${process.pid}@fixture.crux.test`
    const existing = await c.query<{ id: string }>('SELECT id FROM auth.users WHERE email=$1', [email])
    let id = existing.rows[0]?.id
    if (!id) {
      const created2 = await c.query<{ id: string }>(
        'INSERT INTO auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id',
        [email],
      )
      id = created2.rows[0]!.id
    }
    for (const role of roles) {
      await c.query(
        'INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, role],
      )
    }
    created.push(id)
    void verified
    return id
  })
}

afterAll(async () => {
  await asSuperuser(async (c) => {
    if (created.length > 0) {
      await c.query('DELETE FROM identity.user_roles WHERE user_id = ANY($1::uuid[])', [created])
      await c.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [created])
    }
  })
  await closeTestPool()
})

describe('anonymous callers hold nothing', () => {
  it('resolves no permissions and no roles', async () => {
    session.current = null
    const { currentPermissions, currentRoles, hasPermission } = await auth()
    expect([...(await currentPermissions())]).toEqual([])
    expect(await currentRoles()).toEqual([])
    expect(await hasPermission('content.publish')).toBe(false)
  })

  it('requireUser refuses with an unauthenticated code', async () => {
    session.current = null
    const { requireUser, AuthorizationError } = await auth()
    await expect(requireUser()).rejects.toThrow(AuthorizationError)
    await expect(requireUser()).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})

describe('an unverified account holds nothing', () => {
  it('resolves no permissions even when roles are assigned', async () => {
    const id = await userWithRoles('unverified', ['publisher'])
    session.current = { id, email: 'x@fixture.crux.test', emailVerifiedAt: null }
    const { currentPermissions, hasPermission } = await auth()

    expect([...(await currentPermissions())], 'an unverified account must hold no permissions')
      .toEqual([])
    expect(await hasPermission('content.publish')).toBe(false)
  })

  it('requireUser refuses with an unverified code', async () => {
    const id = await userWithRoles('unverified2', ['publisher'])
    session.current = { id, email: 'x@fixture.crux.test', emailVerifiedAt: null }
    const { requireUser } = await auth()
    await expect(requireUser()).rejects.toMatchObject({ code: 'unverified' })
  })

  it('requirePermission refuses before it reaches the permission check', async () => {
    const id = await userWithRoles('unverified3', ['publisher'])
    session.current = { id, email: 'x@fixture.crux.test', emailVerifiedAt: null }
    const { requirePermission } = await auth()
    await expect(requirePermission('content.publish')).rejects.toMatchObject({ code: 'unverified' })
  })
})

describe('a verified account resolves exactly its granted permissions', () => {
  it.each([
    ['author', 'content.create', 'content.publish'],
    ['publisher', 'content.publish', 'content.approve'],
    ['managing_editor', 'content.approve', 'content.publish'],
    ['reviewer', 'content.review', 'content.publish'],
  ])('%s holds %s and not %s', async (role, held, notHeld) => {
    const id = await userWithRoles(`role-${role}`, [role])
    session.current = { id, email: `${role}@fixture.crux.test`, emailVerifiedAt: new Date().toISOString() }
    const { hasPermission } = await auth()

    expect(await hasPermission(held), `${role} should hold ${held}`).toBe(true)
    expect(await hasPermission(notHeld), `${role} must not hold ${notHeld}`).toBe(false)
  })

  it('resolves the union of several roles', async () => {
    const id = await userWithRoles('multi', ['author', 'reviewer'])
    session.current = { id, email: 'multi@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { currentPermissions } = await auth()
    const held = await currentPermissions()
    expect(held.has('content.create')).toBe(true)
    expect(held.has('content.review')).toBe(true)
    expect(held.has('content.publish')).toBe(false)
  })

  it('holds nothing when no role is assigned', async () => {
    const id = await userWithRoles('roleless', [])
    session.current = { id, email: 'roleless@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { currentPermissions, currentRoles } = await auth()
    expect([...(await currentPermissions())]).toEqual([])
    expect(await currentRoles()).toEqual([])
  })

  it('matches what the database itself would answer', async () => {
    // The server resolver and private.has_permission must never disagree: one governs
    // route handlers, the other governs RLS policies.
    const id = await userWithRoles('agreement', ['publisher'])
    session.current = { id, email: 'a@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { currentPermissions } = await auth()
    const fromResolver = [...(await currentPermissions())].sort()

    const fromDatabase = await asSuperuser(async (c) => {
      const r = await c.query<{ permission_key: string }>(
        `SELECT DISTINCT rp.permission_key
           FROM identity.user_roles ur
           JOIN identity.role_permissions rp ON rp.role_key = ur.role_key
          WHERE ur.user_id = $1 ORDER BY 1`,
        [id],
      )
      return r.rows.map((x) => x.permission_key).sort()
    })
    expect(fromResolver).toEqual(fromDatabase)
  })
})

describe('requirePermission', () => {
  it('returns the user when the permission is held', async () => {
    const id = await userWithRoles('allowed', ['publisher'])
    session.current = { id, email: 'p@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { requirePermission } = await auth()
    await expect(requirePermission('content.publish')).resolves.toMatchObject({ id })
  })

  it('refuses with a forbidden code naming the permission', async () => {
    const id = await userWithRoles('forbidden', ['author'])
    session.current = { id, email: 'f@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { requirePermission } = await auth()
    await expect(requirePermission('content.publish')).rejects.toMatchObject({
      code: 'forbidden',
      permission: 'content.publish',
    })
  })

  it('refuses a permission that does not exist', async () => {
    const id = await userWithRoles('nonexistent', ['publisher'])
    session.current = { id, email: 'n@fixture.crux.test', emailVerifiedAt: new Date().toISOString() }
    const { requirePermission } = await auth()
    await expect(requirePermission('content.invent_a_permission')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('the resolver takes nothing from the caller', () => {
  it('ignores a role asserted alongside the identity', async () => {
    // A JWT claim, a header or a cookie could carry this. None of it is read: the
    // resolver queries identity.user_roles for the subject and nothing else.
    const id = await userWithRoles('claimant', ['author'])
    session.current = {
      id,
      email: 'c@fixture.crux.test',
      emailVerifiedAt: new Date().toISOString(),
      // @ts-expect-error -- deliberately shaped like a smuggled claim
      role: 'platform_administrator',
      permissions: ['content.publish'],
    }
    const { hasPermission } = await auth()
    expect(await hasPermission('content.publish'), 'a claimed permission must be ignored').toBe(false)
    expect(await hasPermission('content.create')).toBe(true)
  })
})
