import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, isVerified } from '@/lib/auth/session'
import { hasPermission, currentRoles } from '@/lib/auth/permissions'

export const metadata: Metadata = {
  title: { default: 'Editorial', template: '%s · Editorial · Crux' },
  robots: { index: false, follow: false },
}

/**
 * The administrative shell (Block 09, minimal slice).
 *
 * Middleware already redirects an anonymous visitor away from `/admin`. This layout
 * checks again, because middleware decides what is worth rendering and never what is
 * allowed (rules/frontend.md 21). It also checks something middleware cannot: the edge
 * runtime has no database, so `admin.access` can only be tested here.
 *
 * The check is repeated a third time in every query and every action. That is not
 * belt-and-braces for its own sake — a layout guard protects the page, and a page can
 * be bypassed by calling a server action directly.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?next=/admin')

  // An unverified account holds no permissions at all, so this is refused below. Said
  // explicitly because "signed in" and "may act" are different questions.
  if (!isVerified(user) || !(await hasPermission('admin.access'))) {
    return (
      <div className="mx-auto max-w-[--container-wide] px-6 py-16">
        <h1 className="text-[length:--text-heading-1] font-[--font-weight-bold]">
          Editorial access required
        </h1>
        <p className="mt-4 max-w-[--container-reading] leading-[--text-body--line-height]">
          {isVerified(user)
            ? 'Your account does not hold editorial access. If you believe it should, ask an administrator to grant it.'
            : 'Confirm your email address before using the editorial surface.'}
        </p>
        <p className="mt-6">
          <Link href="/account" className="underline underline-offset-4">
            Back to your account
          </Link>
        </p>
      </div>
    )
  }

  const roles = await currentRoles()

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[--color-border] py-6">
        <nav aria-label="Editorial">
          <ul className="flex gap-6">
            <li>
              <Link href="/admin" className="underline underline-offset-4">
                Editorial queue
              </Link>
            </li>
            <li>
              <Link href="/" className="underline underline-offset-4">
                Public site
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-[length:--text-small] text-[--color-text-muted]">
          {user.email}
          {roles.length > 0 ? ` · ${roles.join(', ')}` : ' · no editorial role'}
        </p>
      </header>
      <main id="main">{children}</main>
    </div>
  )
}
