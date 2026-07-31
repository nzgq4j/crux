import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/states'
import { getCurrentUser, authConfigured } from '@/lib/auth/session'
import { changePassword } from '@/lib/auth/actions'
import { AuthForm } from '../../register/AuthForm'

export const metadata: Metadata = {
  title: 'Change your password',
  robots: { index: false, follow: false },
}

/**
 * Password change.
 *
 * The current password is required before the new one is accepted, and every other
 * session is invalidated on success (rules/security.md 11). Both facts are stated to
 * the user, because a password change that silently leaves other sessions alive is
 * worse than one that says it does not.
 */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  if (authConfigured() && !user) redirect('/sign-in?next=/account/password')

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title="Change your password" />
      <div className="py-10">
        {authConfigured() ? (
          <>
            <p className="mb-6 max-w-[--container-reading] leading-[--text-body--line-height]">
              Changing your password signs out every other device. This one stays signed in.
            </p>
            <AuthForm
              action={changePassword}
              submitLabel="Change password"
              pendingLabel="Changing…"
              fields={[
                {
                  name: 'currentPassword',
                  label: 'Current password',
                  type: 'password',
                  autoComplete: 'current-password',
                },
                {
                  name: 'newPassword',
                  label: 'New password',
                  type: 'password',
                  autoComplete: 'new-password',
                  hint: 'At least 12 characters.',
                },
              ]}
            />
          </>
        ) : (
          <p className="max-w-[--container-reading] leading-[--text-body--line-height]">
            Password management is not available in this environment.
          </p>
        )}
      </div>
    </div>
  )
}
