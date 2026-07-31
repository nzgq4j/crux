import Link from 'next/link'
import { ModuleRenderer } from './ModuleRenderer'
import { ContentCard, TypeLabel } from './ContentCard'
import type {
  ContentDetail,
  ContentModule,
  Contributor,
  ContentSummary,
  Term,
} from '@/lib/content/queries'

/**
 * The long-form reading experience (Block 11 §11).
 *
 * Server-rendered in full: the body is complete in the initial HTML response and
 * requires no client JavaScript (rules/frontend.md 8). The table of contents is
 * plain anchor links to each module's stable fragment identifier — navigation works
 * with scripting disabled.
 */
export function ArticleView({
  content,
  modules,
  contributors,
  terms,
  related,
  history,
}: {
  content: ContentDetail
  modules: ContentModule[]
  contributors: Contributor[]
  terms: Term[]
  related: ContentSummary[]
  history: Array<{
    public_version_id: string
    version_number: number
    status: string
    published_at: string | null
    correction_reason: string | null
  }>
}) {
  const authors = contributors.filter((c) => c.role === 'author')
  const others = contributors.filter((c) => c.role !== 'author')
  const headings = modules.filter((m) => m.module_key === 'heading')
  const corrected = history.some((h) => h.correction_reason)

  return (
    <article className="mx-auto max-w-[--container-wide] px-6">
      {/* --- Header ------------------------------------------------------- */}
      <header className="border-b border-[--color-rule] py-12">
        <TypeLabel type={content.content_type_key} />
        {/*
          The subtitle sits inside the h1 (Batch A, S1; docs/corpus/05 D1). It is part
          of the document's name, so a sibling heading would either add a phantom level
          to the outline or leave the accessible name incomplete.
        */}
        <h1 className="mt-3 max-w-[24ch] font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height] tracking-[--text-h1--letter-spacing]">
          {content.title}
          {content.subtitle && (
            <span className="mt-2 block text-[--text-h3] font-normal text-[--color-ink-muted]">
              {content.subtitle}
            </span>
          )}
        </h1>

        {content.distribution_marking && (
          /*
            The author's own marking, rendered verbatim (docs/corpus/05 D2). Text, not
            a coloured band — accessibility rule 26 — and deliberately neutral in tone:
            this platform does not enforce it, and copy that implied otherwise would be
            a claim it cannot honour (docs/corpus/10 R3).
          */
          <p className="mt-4 font-[--font-mono] text-[--text-caption] text-[--color-ink-muted]">
            {content.distribution_marking}
          </p>
        )}

        {content.standfirst && (
          <p className="mt-5 max-w-[--container-reading] text-[--text-lede] leading-[--text-lede--line-height] text-[--color-ink-muted]">
            {content.standfirst}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[--text-caption] text-[--color-ink-faint]">
          {authors.length > 0 && (
            <p>
              By{' '}
              {authors.map((a, i) => (
                <span key={a.slug}>
                  {i > 0 && (i === authors.length - 1 ? ' and ' : ', ')}
                  <Link href={`/experts/${a.slug}`} className="text-[--color-ink-muted]">
                    {a.display_name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {/*
            The date the document states, at the precision it stated it (Batch A, S3).
            Falls back to the publication timestamp only when the document gave no date
            of its own. Rendering published_at for an April 2026 assessment printed
            "31 July 2026" on the first page published — docs/corpus/12 §12.6.
          */}
          <StatedDate content={content} />
          <span>{content.reading_minutes} min read</span>
          <span className="font-[--font-mono]">{content.public_id}</span>
        </div>
      </header>

      {corrected && <CorrectionNotice history={history} />}

      <div className="gap-16 py-12 lg:flex">
        {/* --- Table of contents ------------------------------------------ */}
        {headings.length > 1 && (
          <nav
            aria-labelledby="toc-label"
            className="mb-10 shrink-0 lg:sticky lg:top-8 lg:mb-0 lg:h-fit lg:w-56 lg:order-2"
          >
            <h2
              id="toc-label"
              className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
            >
              On this page
            </h2>
            <ol className="list-none space-y-2 p-0 text-[--text-caption]">
              {headings.map((h) => (
                <li key={h.fragment_id}>
                  <a
                    href={`#${h.fragment_id}`}
                    className="text-[--color-ink-muted] no-underline hover:text-[--color-accent] hover:underline"
                  >
                    {typeof h.payload['heading'] === 'string' ? h.payload['heading'] : h.fragment_id}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* --- Body -------------------------------------------------------- */}
        <div className="min-w-0 max-w-[--container-reading] lg:order-1">
          {content.executive_summary && (
            <section
              aria-labelledby="exec-summary-label"
              className="mb-10 border-b border-[--color-rule] pb-8"
            >
              <h2
                id="exec-summary-label"
                className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
              >
                Executive summary
              </h2>
              <p className="text-[--text-body] leading-[--text-body--line-height]">
                {content.executive_summary}
              </p>
            </section>
          )}

          <ModuleRenderer modules={modules} />

          {(content.methodology || content.limitations) && (
            <section aria-labelledby="endmatter-label" className="mt-14 border-t border-[--color-rule] pt-8">
              <h2 id="endmatter-label" className="sr-only">
                Methodology and limitations
              </h2>
              {content.methodology && (
                <div className="mb-6">
                  <h3 className="mb-2 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
                    Methodology
                  </h3>
                  <p className="text-[--text-caption] leading-[1.65] text-[--color-ink-muted]">
                    {content.methodology}
                  </p>
                </div>
              )}
              {content.limitations && (
                <div>
                  <h3 className="mb-2 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
                    Limitations
                  </h3>
                  <p className="text-[--text-caption] leading-[1.65] text-[--color-ink-muted]">
                    {content.limitations}
                  </p>
                </div>
              )}
            </section>
          )}

          {others.length > 0 && (
            <section aria-labelledby="contributors-label" className="mt-10">
              <h2
                id="contributors-label"
                className="mb-2 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
              >
                Contributors
              </h2>
              <ul className="list-none p-0 text-[--text-caption] text-[--color-ink-muted]">
                {others.map((c) => (
                  <li key={`${c.slug}-${c.role}`}>
                    {c.display_name} — {c.role.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CitationBlock content={content} authors={authors} />

          {terms.length > 0 && (
            <section aria-labelledby="topics-label" className="mt-10 border-t border-[--color-rule] pt-6">
              <h2
                id="topics-label"
                className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
              >
                Topics
              </h2>
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {terms.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={termHref(t)}
                      className="inline-block border border-[--color-rule-strong] px-3 py-1 text-[--text-caption] text-[--color-ink-muted] no-underline hover:border-[--color-accent] hover:text-[--color-accent]"
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 1 && (
            <section aria-labelledby="history-label" className="mt-10 border-t border-[--color-rule] pt-6">
              <h2
                id="history-label"
                className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
              >
                Revision history
              </h2>
              <ol className="list-none space-y-2 p-0 text-[--text-caption] text-[--color-ink-muted]">
                {history.map((h) => (
                  <li key={h.public_version_id}>
                    <span className="font-[--font-mono]">v{h.version_number}</span>{' '}
                    {h.published_at &&
                      new Date(h.published_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}{' '}
                    — {h.status}
                    {h.correction_reason && ` · ${h.correction_reason}`}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section
          aria-labelledby="related-label"
          className="border-t border-[--color-rule] py-12"
        >
          <h2
            id="related-label"
            className="mb-8 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
          >
            Related research
          </h2>
          <ul className="grid list-none grid-cols-1 gap-x-10 gap-y-8 p-0 md:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <li key={r.public_id} className="border-t border-[--color-rule] pt-4">
                <ContentCard item={r} size="compact" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function termHref(t: Term): string {
  if (t.vocabulary === 'industry') return `/industries/${t.slug}`
  if (t.vocabulary === 'capability') return `/capabilities/${t.slug}`
  if (t.vocabulary === 'role') return `/roles/${t.slug}`
  return `/topics/${t.slug}`
}

/**
 * The document's own date, never widened beyond the precision it was given at.
 *
 * `dateTime` carries only as much of the ISO 8601 value as the precision supports, so
 * a machine reader is told "April 2026" rather than "1 April 2026".
 */
function StatedDate({ content }: { content: ContentDetail }) {
  if (content.stated_date && content.stated_date_precision) {
    const d = new Date(content.stated_date)
    const precision = content.stated_date_precision
    const iso =
      precision === 'year'
        ? String(d.getUTCFullYear())
        : precision === 'month'
          ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
          : d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-GB', {
      ...(precision === 'day' ? { day: 'numeric' as const } : {}),
      ...(precision === 'year' ? {} : { month: 'long' as const }),
      year: 'numeric',
      timeZone: 'UTC',
    })
    return <time dateTime={iso}>{label}</time>
  }
  if (content.published_at) {
    return (
      <time dateTime={new Date(content.published_at).toISOString()}>
        {new Date(content.published_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </time>
    )
  }
  return null
}

function CorrectionNotice({
  history,
}: {
  history: Array<{ correction_reason: string | null; published_at: string | null }>
}) {
  const correction = history.find((h) => h.correction_reason)
  if (!correction) return null
  return (
    <aside
      role="note"
      aria-labelledby="correction-label"
      className="mt-8 border-l-4 border-[--color-warning] bg-[--color-surface-sunken] px-6 py-4"
    >
      <h2
        id="correction-label"
        className="text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-warning]"
      >
        Correction
      </h2>
      <p className="mt-2 text-[--text-caption] text-[--color-ink-muted]">
        {correction.correction_reason}
      </p>
    </aside>
  )
}

/**
 * The citation record (Block 17).
 *
 * Rendered as text, never an image, and addressed at the specific version so a
 * citation resolves to what the reader actually read. Full multi-format export is
 * Block 17 and is not built — this is the plain-text form only, and says so rather
 * than implying the rest exists.
 */
function CitationBlock({
  content,
  authors,
}: {
  content: ContentDetail
  authors: Contributor[]
}) {
  const year = content.published_at ? new Date(content.published_at).getFullYear() : 'n.d.'
  const names =
    authors.length > 0 ? authors.map((a) => a.display_name).join(', ') : 'Crucible Insight'

  return (
    <section aria-labelledby="citation-label" className="mt-10 border-t border-[--color-rule] pt-6">
      <h2
        id="citation-label"
        className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
      >
        Cite this
      </h2>
      <p className="border border-[--color-rule] bg-[--color-surface] px-4 py-3 font-[--font-mono] text-[0.8rem] leading-relaxed text-[--color-ink-muted]">
        {names} ({year}). <em>{content.title}</em>. Crucible Insight.{' '}
        {content.public_id} · version {content.version_public_id}.
      </p>
    </section>
  )
}
