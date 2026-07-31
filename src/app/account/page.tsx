import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/states'

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

/**
 * Placeholder. Authentication is Block 06 and is not built — the role model,
 * permissions and RLS policies exist, but there is no sign-in flow yet.
 *
 * This route exists so the header's Account link resolves rather than 404s, and it
 * states plainly that the feature is absent rather than implying it is coming or
 * pretending to be broken.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Account" title="Accounts are not available yet" />
      <div className="max-w-[--container-reading] py-10">
        <p className="mb-5 leading-[--text-body--line-height]">
          Sign-in, saved research, download history and newsletter preferences are not
          implemented. The database layer behind them exists — fourteen roles, granular
          permissions and row-level security policies are in place and tested — but no
          authentication flow has been built on top of it.
        </p>
        <p className="mb-5 leading-[--text-body--line-height]">
          All published research is readable without an account.
        </p>
        <p>
          <Link href="/research" className="text-[--color-accent]">
            Browse the research
          </Link>
        </p>
      </div>
    </div>
  )
}
