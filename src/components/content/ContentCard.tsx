import Link from 'next/link'
import type { ContentSummary } from '@/lib/content/queries'

export const TYPE_LABEL: Record<string, string> = {
  report: 'Research report',
  white_paper: 'White paper',
  brief: 'Research brief',
  article: 'Article',
  case_study: 'Case study',
  data_story: 'Data story',
  collection: 'Collection',
  page: 'Page',
}

/** Content types whose canonical route lives under /research rather than /articles. */
const RESEARCH_TYPES = new Set(['report', 'white_paper', 'brief', 'case_study', 'data_story'])

export function contentHref(item: Pick<ContentSummary, 'content_type_key' | 'canonical_slug'>): string {
  if (item.content_type_key === 'collection') return `/collections/${item.canonical_slug}`
  if (RESEARCH_TYPES.has(item.content_type_key)) return `/research/${item.canonical_slug}`
  return `/articles/${item.canonical_slug}`
}

export function TypeLabel({ type }: { type: string }) {
  return (
    <span className="text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-accent]">
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

export function PublishedMeta({
  publishedAt,
  readingMinutes,
}: {
  publishedAt: string | null
  readingMinutes?: number
}) {
  return (
    <p className="mt-3 text-[--text-caption] text-[--color-ink-faint]">
      {publishedAt && (
        <>
          <time dateTime={new Date(publishedAt).toISOString()}>
            {new Date(publishedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
          {readingMinutes ? <span aria-hidden="true"> · </span> : null}
        </>
      )}
      {readingMinutes ? `${readingMinutes} min read` : null}
    </p>
  )
}

/**
 * A single content item in a listing.
 *
 * `size` changes typographic scale only — the markup and semantics are identical, so
 * a lead story and a grid item are the same component and cannot drift apart.
 */
export function ContentCard({
  item,
  size = 'default',
}: {
  item: ContentSummary
  size?: 'lead' | 'default' | 'compact'
}) {
  const headingClass =
    size === 'lead'
      ? 'text-[--text-h1] leading-[--text-h1--line-height] tracking-[--text-h1--letter-spacing] max-w-[26ch]'
      : size === 'compact'
        ? 'text-[1.05rem] leading-snug'
        : 'text-[--text-h3] leading-[--text-h3--line-height]'

  return (
    <article>
      <TypeLabel type={item.content_type_key} />
      <h3 className={`mt-2 font-[--font-display] font-semibold ${headingClass}`}>
        <Link href={contentHref(item)} className="text-[--color-ink] no-underline hover:underline">
          {item.title}
        </Link>
      </h3>
      {item.standfirst && size !== 'compact' && (
        <p
          className={`mt-2 text-[--color-ink-muted] ${
            size === 'lead'
              ? 'max-w-[--container-reading] text-[--text-lede] leading-[--text-lede--line-height]'
              : 'text-[--text-caption] leading-[--text-caption--line-height]'
          }`}
        >
          {item.standfirst}
        </p>
      )}
      <PublishedMeta publishedAt={item.published_at} readingMinutes={item.reading_minutes} />
    </article>
  )
}

export function ContentGrid({ items }: { items: ContentSummary[] }) {
  return (
    <ul className="grid list-none grid-cols-1 gap-x-10 gap-y-10 p-0 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.public_id} className="border-t border-[--color-rule] pt-5">
          <ContentCard item={item} />
        </li>
      ))}
    </ul>
  )
}
