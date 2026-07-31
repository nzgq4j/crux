import Link from 'next/link'
import type { ContentDetail, Contributor } from '@/lib/content/queries'

/**
 * A withdrawn item (rules/content-modeling.md 11).
 *
 * Withdrawal is not deletion. The item keeps its permanent identifier and its
 * citation record so that anyone who cited it can still resolve what they cited —
 * they simply must be told it was withdrawn, and why. Serving a 404 here would
 * silently break every existing citation, which is the outcome the rule exists to
 * prevent.
 */
export function Tombstone({
  content,
  contributors,
}: {
  content: ContentDetail
  contributors: Contributor[]
}) {
  const authors = contributors.filter((c) => c.role === 'author')
  const year = content.published_at ? new Date(content.published_at).getFullYear() : 'n.d.'
  const names =
    authors.length > 0 ? authors.map((a) => a.display_name).join(', ') : 'Crucible Insight'

  return (
    <div className="mx-auto max-w-[--container-reading] px-6 py-16">
      <p className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-danger]">
        Withdrawn
      </p>

      <h1 className="font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height]">
        {content.title}
      </h1>

      <div
        role="note"
        className="mt-8 border-l-4 border-[--color-danger] bg-[--color-surface-sunken] px-6 py-5"
      >
        <h2 className="text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
          Why this was withdrawn
        </h2>
        <p className="mt-2 text-[--text-body] leading-[--text-body--line-height]">
          {content.withdrawal_reason ?? 'No reason was recorded.'}
        </p>
        {content.withdrawn_at && (
          <p className="mt-2 text-[--text-caption] text-[--color-ink-faint]">
            Withdrawn{' '}
            <time dateTime={new Date(content.withdrawn_at).toISOString()}>
              {new Date(content.withdrawn_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </p>
        )}
      </div>

      <p className="mt-8 text-[--color-ink-muted]">
        The content of this item is no longer published. Its identifier and citation
        record are retained so that existing citations continue to resolve.
      </p>

      <section aria-labelledby="citation-label" className="mt-8 border-t border-[--color-rule] pt-6">
        <h2
          id="citation-label"
          className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
        >
          Citation record
        </h2>
        <p className="border border-[--color-rule] bg-[--color-surface] px-4 py-3 font-[--font-mono] text-[0.8rem] leading-relaxed text-[--color-ink-muted]">
          {names} ({year}). <em>{content.title}</em>. Crucible Insight. {content.public_id} ·
          version {content.version_public_id}. Withdrawn.
        </p>
      </section>

      <p className="mt-8">
        <Link href="/research" className="text-[--color-accent]">
          Browse current research
        </Link>
      </p>
    </div>
  )
}
