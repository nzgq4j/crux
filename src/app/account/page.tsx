import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { getCurrentUser, isVerified, authConfigured } from '@/lib/auth/session'
import { currentRoles, currentPermissions } from '@/lib/auth/permissions'
import { signOut } from '@/lib/auth/actions'

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

/**
 * The signed-in user's own account.
 *
 * Middleware redirects an anonymous visitor here to sign-in, but this page does not
 * rely on that: it reads identity itself and renders the signed-out case rather than
 * assuming a user exists (rules/frontend.md 21).
 *
 * Roles and permissions are shown because a user who cannot see what they hold cannot
 * tell whether an absent control is a bug or a boundary. They are displayed only —
 * every decision is taken server-side against the database.
 */
export default async function AccountPage() {
  const user = await getCurrentUser()

  if (!authConfigured() || !user) {
    return (
      <div className="mx-auto max-w-[--container-wide] px-6">
        <PageHeader eyebrow="Account" title="You are not signed in" />
        <div className="max-w-[--container-reading] py-10">
          <p className="leading-[--text-body--line-height]">
            {authConfigured()
              ? 'Sign in to see your account.'
              : 'Authentication is not configured in this environment.'}
          </p>
        </div>
      </div>
    )
  }

  const verified = isVerified(user)
  const [roles, permissions] = verified
    ? await Promise.all([currentRoles(), currentPermissions()])
    : [[], new Set<string>()]

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title={user.email ?? 'Your account'} />
      <div className="max-w-[--container-reading] py-10">
        {!verified ? (
          <div role="status" className="mb-8 border-l-4 border-[--color-rule-strong] px-4 py-3">
            <p>
              Your email address is not confirmed. Confirm it to use editorial features —
              until then you can read published content only.
            </p>
          </div>
        ) : null}

        <h2 className="mb-3 text-[--text-h3]">Roles</h2>
        {roles.length > 0 ? (
          <ul className="mb-8 list-disc pl-5">
            {roles.map((role) => (
              <li key={role}>{role.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        ) : (
          <p className="mb-8 text-[--color-ink-muted]">No roles are assigned to this account.</p>
        )}

        <h2 className="mb-3 text-[--text-h3]">Permissions</h2>
        {permissions.size > 0 ? (
          <ul className="mb-8 columns-2 list-disc pl-5">
            {[...permissions].sort().map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        ) : (
          <p className="mb-8 text-[--color-ink-muted]">
            This account holds no permissions.
          </p>
        )}

        <form action={signOut}>
          <button type="submit" className="border border-[--color-ink] px-5 py-2 font-medium">
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
