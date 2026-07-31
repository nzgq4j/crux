import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/states'
import { authConfigured } from '@/lib/auth/session'
import { register } from '@/lib/auth/actions'
import { AuthForm } from './AuthForm'

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
}

/**
 * Registration.
 *
 * The response is identical whether or not the address is already registered
 * (rules/security.md 25), which is why the page promises a confirmation email rather
 * than an account: the second would be a claim this page cannot honestly make.
 */
export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title="Create an account" />
      <div className="py-10">
        {authConfigured() ? (
          <>
            <AuthForm
              action={register}
              submitLabel="Create account"
              pendingLabel="Creating…"
              fields={[
                { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
                {
                  name: 'password',
                  label: 'Password',
                  type: 'password',
                  autoComplete: 'new-password',
                  hint: 'At least 12 characters. Length matters more than punctuation; a passphrase is fine.',
                },
              ]}
            />
            <p className="mt-6">
              <Link href="/sign-in" className="underline underline-offset-4">
                Already have an account? Sign in
              </Link>
            </p>
          </>
        ) : (
          <p className="max-w-[--container-reading] leading-[--text-body--line-height]">
            Accounts are not available in this environment. Authentication is issued by
            Supabase Auth, which is not configured here.
          </p>
        )}
      </div>
    </div>
  )
}
