import 'server-only'
import { cache } from 'react'
import { asUser } from '@/lib/db/client'
import { getCurrentUser, isVerified, type AuthenticatedUser } from './session'

/**
 * Server-side authorization (Block 06).
 *
 * The decision comes from the database's own role model — `identity.user_roles`
 * joined to `identity.role_permissions` — and from nowhere else. No role, permission
 * or entitlement is ever read from a cookie, a header, a JWT claim, or a request
 * body. A token establishes *who* the caller is; the database decides what they may
 * do.
 *
 * This is the server-side counterpart to `private.has_permission`, which RLS policies
 * use. Both read the same two tables, so a policy and a route handler cannot disagree
 * about whether someone holds a permission.
 *
 * Results are memoised per request through React `cache`, never across requests.
 */

export class AuthorizationError extends Error {
  readonly code: 'unauthenticated' | 'unverified' | 'forbidden'
  readonly permission?: string
  constructor(code: AuthorizationError['code'], message: string, permission?: string) {
    super(message)
    this.name = 'AuthorizationError'
    this.code = code
    if (permission !== undefined) this.permission = permission
  }
}

/**
 * Every permission the current user holds.
 *
 * One query per request rather than one per check: a page that renders six
 * permission-gated controls should not ask the database six times.
 *
 * The query runs as the user, so RLS applies to it in the same way it applies to
 * everything else they can read.
 */
export const currentPermissions = cache(async (): Promise<ReadonlySet<string>> => {
  const user = await getCurrentUser()
  if (!user) return new Set()

  // An unverified account holds no permissions at all. Stated here as well as at the
  // guards, so a caller that reaches for the set directly cannot miss it.
  if (!isVerified(user)) return new Set()

  const rows = await asUser({ userId: user.id }, (s) =>
    s.query<{ permission_key: string }>(
      `SELECT DISTINCT rp.permission_key
         FROM identity.user_roles ur
         JOIN identity.role_permissions rp ON rp.role_key = ur.role_key
        WHERE ur.user_id = $1`,
      [user.id],
    ),
  )
  return new Set(rows.map((r) => r.permission_key))
})

/** Does the current user hold this permission? False for anonymous and unverified. */
export async function hasPermission(permission: string): Promise<boolean> {
  return (await currentPermissions()).has(permission)
}

/** Every role the current user holds. For display, never for a decision. */
export const currentRoles = cache(async (): Promise<readonly string[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const rows = await asUser({ userId: user.id }, (s) =>
    s.query<{ role_key: string }>(
      'SELECT role_key FROM identity.user_roles WHERE user_id = $1 ORDER BY role_key',
      [user.id],
    ),
  )
  return rows.map((r) => r.role_key)
})

/**
 * The current user, or a thrown AuthorizationError.
 *
 * For a server action or route handler that must not proceed anonymously. A page that
 * wants to render differently for a signed-out visitor should call `getCurrentUser`
 * and branch, rather than catching this.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new AuthorizationError('unauthenticated', 'Sign in to continue.')
  }
  if (!isVerified(user)) {
    throw new AuthorizationError(
      'unverified',
      'Confirm your email address before using this feature.',
    )
  }
  return user
}

/**
 * The current user, having verified they hold `permission`.
 *
 * Every mutation calls this, regardless of what middleware or the interface already
 * checked. Middleware decides what to render; this decides what may happen
 * (rules/backend.md 5).
 */
export async function requirePermission(permission: string): Promise<AuthenticatedUser> {
  const user = await requireUser()
  if (!(await currentPermissions()).has(permission)) {
    // The message names the permission because the caller is a signed-in colleague
    // who needs to know what to ask for, not an anonymous prober. Existence of the
    // resource is not disclosed by this path — the route decides that separately.
    throw new AuthorizationError(
      'forbidden',
      `This action requires the ${permission} permission.`,
      permission,
    )
  }
  return user
}
