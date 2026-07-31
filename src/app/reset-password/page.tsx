import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/states'
import { authConfigured } from '@/lib/auth/session'
import { requestPasswordReset } from '@/lib/auth/actions'
import { AuthForm } from '../register/AuthForm'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title="Reset your password" />
      <div className="py-10">
        {authConfigured() ? (
          <>
            <AuthForm
              action={requestPasswordReset}
              submitLabel="Send reset link"
              pendingLabel="Sending…"
              fields={[
                { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
              ]}
            />
            <p className="mt-6">
              <Link href="/sign-in" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <p className="max-w-[--container-reading] leading-[--text-body--line-height]">
            Password recovery is not available in this environment.
          </p>
        )}
      </div>
    </div>
  )
}
