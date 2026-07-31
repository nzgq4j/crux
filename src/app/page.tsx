import Link from 'next/link'
import { listRecent, type ContentSummary } from '@/lib/content/queries'

export const revalidate = 300

const TYPE_LABEL: Record<string, string> = {
  report: 'Research report',
  white_paper: 'White paper',
  brief: 'Research brief',
  article: 'Article',
  case_study: 'Case study',
  data_story: 'Data story',
  collection: 'Collection',
}

export default async function HomePage() {
  let recent: ContentSummary[] = []
  let unavailable = false

  try {
    recent = await listRecent(9)
  } catch {
    // The page renders an honest degraded state rather than a stack trace
    // (Block 32 error states, rules/frontend.md 14).
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
      </section>

      {unavailable ? (
        <DegradedState />
      ) : recent.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {lead && (
            <section aria-labelledby="lead-heading" className="border-b border-[--color-rule] py-14">
              <h2 id="lead-heading" className="sr-only">
                Featured research
              </h2>
              <article>
                <TypeLabel type={lead.content_type_key} />
                <h3 className="mt-3 max-w-[26ch] font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height] tracking-[--text-h1--letter-spacing]">
                  <Link href={`/research/${lead.canonical_slug}`} className="text-[--color-ink] no-underline hover:underline">
                    {lead.title}
                  </Link>
                </h3>
                {lead.standfirst && (
                  <p className="mt-4 max-w-[--container-reading] text-[--text-lede] leading-[--text-lede--line-height] text-[--color-ink-muted]">
                    {lead.standfirst}
                  </p>
                )}
                <Meta item={lead} />
              </article>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="latest-heading" className="py-14">
              <h2
                id="latest-heading"
                className="mb-8 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
              >
                Latest analysis
              </h2>
              <ul className="grid list-none grid-cols-1 gap-x-10 gap-y-10 p-0 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((item) => (
                  <li key={item.public_id} className="border-t border-[--color-rule] pt-5">
                    <article>
                      <TypeLabel type={item.content_type_key} />
                      <h3 className="mt-2 font-[--font-display] text-[--text-h3] font-semibold leading-[--text-h3--line-height]">
                        <Link
                          href={`/research/${item.canonical_slug}`}
                          className="text-[--color-ink] no-underline hover:underline"
                        >
                          {item.title}
                        </Link>
                      </h3>
                      {item.standfirst && (
                        <p className="mt-2 text-[--text-caption] leading-[--text-caption--line-height] text-[--color-ink-muted]">
                          {item.standfirst}
                        </p>
                      )}
                      <Meta item={item} />
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TypeLabel({ type }: { type: string }) {
  return (
    <span className="text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-accent]">
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

function Meta({ item }: { item: ContentSummary }) {
  return (
    <p className="mt-3 text-[--text-caption] text-[--color-ink-faint]">
      {item.published_at && (
        <>
          <time dateTime={new Date(item.published_at).toISOString()}>
            {new Date(item.published_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
          <span aria-hidden="true"> · </span>
        </>
      )}
      {item.reading_minutes} min read
    </p>
  )
}

function EmptyState() {
  return (
    <section className="py-20">
      <h2 className="font-[--font-display] text-[--text-h2] font-semibold">No published research yet</h2>
      <p className="mt-3 max-w-[--container-reading] text-[--color-ink-muted]">
        The platform is running and the database is reachable, but nothing has been
        published. Run <code className="font-[--font-mono] text-[0.95em]">npm run db:seed</code> to
        load demonstration content.
      </p>
    </section>
  )
}

function DegradedState() {
  return (
    <section className="py-20" role="status">
      <h2 className="font-[--font-display] text-[--text-h2] font-semibold">
        Research listings are temporarily unavailable
      </h2>
      <p className="mt-3 max-w-[--container-reading] text-[--color-ink-muted]">
        We could not reach the content store. The rest of the site is still available,
        and this page will recover automatically once the connection is restored.
      </p>
      <p className="mt-4">
        <Link href="/search" className="text-[--color-accent]">
          Try search instead
        </Link>
      </p>
    </section>
  )
}
