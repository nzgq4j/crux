import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { authConfigured } from '@/lib/auth/session'
import { SignInForm } from './SignInForm'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const configured = authConfigured()

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title="Sign in" />
      <div className="py-10">
        {configured ? (
          <SignInForm {...(next ? { next } : {})} />
        ) : (
          <div className="max-w-[--container-reading]">
            <p className="mb-4 leading-[--text-body--line-height]">
              Sign-in is not available in this environment. Authentication is issued by
              Supabase Auth, which is not configured here.
            </p>
            <p className="text-[--text-caption] text-[--color-ink-muted]">
              The role model, permissions and policies behind it exist and are tested;
              what is absent is the identity provider, not the authorization.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
