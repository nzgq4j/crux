import type { Metadata } from 'next'
import { searchContent } from '@/lib/content/queries'
import { ContentGrid } from '@/components/content/ContentCard'
import { PageHeader, EmptyState, DegradedState, Pagination } from '@/components/ui/states'
import { pageParam, firstParam } from '@/lib/content/page-helpers'

// Search reflects the query, so it is never statically cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search published research, analysis and commentary.',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = firstParam(sp['q']) ?? ''
  const page = pageParam(sp['page'])

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader eyebrow="Search" title="Search the research" />

      {/* A plain GET form: search works with JavaScript disabled, and the query
          and page are preserved in the URL so a result is linkable. */}
      <form method="get" action="/search" role="search" className="border-b border-[--color-rule] py-6">
        <label htmlFor="q" className="block text-[--text-caption] font-semibold text-[--color-ink-muted]">
          Search terms
        </label>
        <div className="mt-2 flex max-w-2xl gap-3">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="e.g. resilience, grid investment, model risk"
            className="min-w-0 flex-1 border border-[--color-rule-strong] bg-[--color-surface] px-3 py-2 text-[--text-body] text-[--color-ink]"
          />
          <button
            type="submit"
            className="border border-[--color-accent] bg-[--color-accent] px-5 py-2 font-semibold text-white"
          >
            Search
          </button>
        </div>
      </form>

      <Results q={q} page={page} />
    </div>
  )
}

async function Results({ q, page }: { q: string; page: number }) {
  if (q.trim().length === 0) {
    return (
      <EmptyState title="Enter a search term">
        <p>
          Search covers titles, summaries and the full text of every published item.
          You can also browse by{' '}
          <a href="/industries" className="text-[--color-accent]">
            industry
          </a>{' '}
          or{' '}
          <a href="/capabilities" className="text-[--color-accent]">
            capability
          </a>
          .
        </p>
      </EmptyState>
    )
  }

  let result
  try {
    result = await searchContent(q, page)
  } catch {
    return <DegradedState title="Search is temporarily unavailable" />
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title={`No results for “${q}”`}>
        <p>
          Try a broader term, check the spelling, or browse{' '}
          <a href="/insights" className="text-[--color-accent]">
            all insights
          </a>
          .
        </p>
      </EmptyState>
    )
  }

  return (
    <>
      {/* Announced to assistive technology when the result set changes. */}
      <p className="py-6 text-[--text-caption] text-[--color-ink-faint]" role="status" aria-live="polite">
        {result.total} {result.total === 1 ? 'result' : 'results'} for “{q}”
        {result.pageCount > 1 && ` · page ${result.page} of ${result.pageCount}`}
      </p>
      <ContentGrid items={result.items} />
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/search"
        searchParams={{ q }}
      />
    </>
  )
}
