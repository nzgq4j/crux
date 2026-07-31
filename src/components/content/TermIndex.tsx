import Link from 'next/link'
import { listTerms } from '@/lib/content/queries'
import { EmptyState, DegradedState } from '@/components/ui/states'

/**
 * A vocabulary index — the landing surface for industries, capabilities and roles.
 *
 * Content counts come from the same RLS-enforced path as the listings, so a term
 * showing "8 items" means eight items this reader can actually open.
 */
export async function TermIndex({
  vocabulary,
  hrefPrefix,
}: {
  vocabulary: string
  hrefPrefix: string
}) {
  let terms
  try {
    terms = await listTerms(vocabulary)
  } catch {
    return <DegradedState />
  }

  if (terms.length === 0) {
    return <EmptyState title="No terms defined">
      <p>This vocabulary has no terms yet.</p>
    </EmptyState>
  }

  return (
    <ul className="grid list-none grid-cols-1 gap-x-10 gap-y-8 p-0 py-12 md:grid-cols-2 lg:grid-cols-3">
      {terms.map((t) => (
        <li key={t.slug} className="border-t border-[--color-rule] pt-5">
          <h2 className="font-[--font-display] text-[--text-h3] font-semibold leading-snug">
            <Link
              href={`${hrefPrefix}/${t.slug}`}
              className="text-[--color-ink] no-underline hover:underline"
            >
              {t.name}
            </Link>
          </h2>
          {t.description && (
            <p className="mt-2 text-[--text-caption] leading-[--text-caption--line-height] text-[--color-ink-muted]">
              {t.description}
            </p>
          )}
          <p className="mt-3 text-[--text-caption] text-[--color-ink-faint]">
            {t.content_count} {t.content_count === 1 ? 'item' : 'items'}
          </p>
        </li>
      ))}
    </ul>
  )
}
