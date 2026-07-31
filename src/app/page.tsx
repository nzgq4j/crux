import Link from 'next/link'
import { listRecent, type ContentSummary } from '@/lib/content/queries'
import { ContentCard, ContentGrid } from '@/components/content/ContentCard'
import { EmptyState, DegradedState } from '@/components/ui/states'

export const revalidate = 300

export default async function HomePage() {
  let recent: ContentSummary[] = []
  let unavailable = false

  try {
    recent = await listRecent(10)
  } catch {
    unavailable = true
  }

  const [lead, ...rest] = recent

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <section className="border-b border-[--color-rule] py-16">
        <p className="mb-4 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-accent]">
          Crucible Insight
        </p>
        <h1 className="max-w-[22ch] font-[--font-display] text-[--text-display] font-semibold leading-[--text-display--line-height] tracking-[--text-display--letter-spacing]">
          Research you can check.
        </h1>
        <p className="mt-6 max-w-[--container-reading] text-[--text-lede] leading-[--text-lede--line-height] text-[--color-ink-muted]">
          Every finding we publish is a structured claim with a stated type, linked to
          the source or analysis that produced it. Published versions are immutable,
          corrections are visible, and every report is citable at the exact version you
          read.
        </p>
        <p className="mt-6">
          <Link href="/about" className="text-[--color-accent]">
            How we publish
          </Link>
        </p>
      </section>

      {unavailable ? (
        <DegradedState title="Research listings are temporarily unavailable" />
      ) : recent.length === 0 ? (
        <EmptyState title="No published research yet">
          <p>
            The platform is running and the database is reachable, but nothing has been
            published. Run <code className="font-[--font-mono]">npm run db:seed</code> to
            load demonstration content.
          </p>
        </EmptyState>
      ) : (
        <>
          {lead && (
            <section aria-labelledby="lead-heading" className="border-b border-[--color-rule] py-14">
              <h2 id="lead-heading" className="sr-only">
                Featured research
              </h2>
              <ContentCard item={lead} size="lead" />
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="latest-heading" className="py-14">
              <div className="mb-8 flex items-baseline justify-between gap-6">
                <h2
                  id="latest-heading"
                  className="text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
                >
                  Latest analysis
                </h2>
                <Link href="/insights" className="text-[--text-caption] text-[--color-accent]">
                  All insights →
                </Link>
              </div>
              <ContentGrid items={rest} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
