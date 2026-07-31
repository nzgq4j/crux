import type { Metadata } from 'next'
import Link from 'next/link'
import { publicEnv } from '@/lib/env/public'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'Crux — Crucible Insight',
    template: '%s — Crux',
  },
  description:
    'Independent research on technology, industry and public policy. Structured, versioned, and citable.',
  openGraph: {
    type: 'website',
    siteName: 'Crux',
  },
  robots: { index: true, follow: true },
}

const NAV = [
  { href: '/insights', label: 'Insights' },
  { href: '/industries', label: 'Industries' },
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/research', label: 'Research' },
  { href: '/experts', label: 'Experts' },
  { href: '/about', label: 'About' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <header className="border-b border-[--color-rule] bg-[--color-surface]">
          <div className="mx-auto flex max-w-[--container-wide] items-center justify-between gap-6 px-6 py-4">
            <Link
              href="/"
              className="font-[--font-display] text-[1.4rem] font-semibold tracking-tight text-[--color-ink] no-underline"
            >
              Crux
              <span className="sr-only"> — home</span>
            </Link>

            <nav aria-label="Primary">
              <ul className="flex list-none flex-wrap items-center gap-5 p-0 text-[0.95rem]">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-[--color-ink-muted] no-underline hover:text-[--color-accent] hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex items-center gap-4 text-[0.95rem]">
              <Link href="/search" className="text-[--color-ink-muted] no-underline hover:text-[--color-accent]">
                Search
              </Link>
              <Link
                href="/account"
                className="rounded-[--radius-md] border border-[--color-rule-strong] px-3 py-1.5 text-[--color-ink] no-underline hover:border-[--color-accent] hover:text-[--color-accent]"
              >
                Account
              </Link>
            </div>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="mt-24 border-t border-[--color-rule] bg-[--color-surface-sunken]">
          <div className="mx-auto max-w-[--container-wide] px-6 py-12">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <FooterGroup
                title="Research"
                links={[
                  ['/research/reports', 'Reports'],
                  ['/research/white-papers', 'White papers'],
                  ['/research/briefs', 'Briefs'],
                  ['/research/data', 'Data'],
                  ['/research/collections', 'Collections'],
                ]}
              />
              <FooterGroup
                title="Organisation"
                links={[
                  ['/about', 'About'],
                  ['/about/methodology', 'Methodology'],
                  ['/about/editorial-standards', 'Editorial standards'],
                  ['/about/corrections', 'Corrections policy'],
                  ['/contact', 'Contact'],
                ]}
              />
              <FooterGroup
                title="Account"
                links={[
                  ['/newsletters', 'Newsletter centre'],
                  ['/account/saved', 'Saved research'],
                  ['/account/downloads', 'My downloads'],
                  ['/account/privacy', 'Privacy controls'],
                ]}
              />
              <FooterGroup
                title="Legal"
                links={[
                  ['/privacy', 'Privacy'],
                  ['/cookies', 'Cookies'],
                  ['/terms', 'Terms'],
                  ['/accessibility', 'Accessibility'],
                ]}
              />
            </div>
            <p className="mt-10 border-t border-[--color-rule] pt-6 text-[--text-caption] text-[--color-ink-faint]">
              Crucible Insight. Research published here is structured, versioned and
              citable; every quantitative finding is traceable to its source.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 font-[--font-body] text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
        {title}
      </h2>
      <ul className="list-none space-y-2 p-0 text-[0.95rem]">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-[--color-ink-muted] no-underline hover:text-[--color-accent] hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
