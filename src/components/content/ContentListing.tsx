import { listContent, type ListFilters } from '@/lib/content/queries'
import { ContentGrid } from './ContentCard'
import { EmptyState, DegradedState, Pagination } from '@/components/ui/states'

/**
 * A paginated listing, with all four states handled in one place
 * (rules/frontend.md 14): loading is the route's loading.tsx, and empty, success
 * and failure are here.
 *
 * Every listing surface renders through this, so none of them can quietly forget
 * an empty state or an unbounded query.
 */
export async function ContentListing({
  filters,
  basePath,
  searchParams = {},
  emptyTitle = 'Nothing published here yet',
  emptyBody,
}: {
  filters: ListFilters
  basePath: string
  searchParams?: Record<string, string | undefined>
  emptyTitle?: string
  emptyBody?: React.ReactNode
}) {
  let result
  try {
    result = await listContent(filters)
  } catch {
    return <DegradedState />
  }

  if (result.items.length === 0) {
    return (
      <EmptyState title={emptyTitle}>
        {emptyBody ?? (
          <p>
            No published content matches this view. Try{' '}
            <a href="/insights" className="text-[--color-accent]">
              all insights
            </a>
            .
          </p>
        )}
      </EmptyState>
    )
  }

  return (
    <>
      <p className="py-6 text-[--text-caption] text-[--color-ink-faint]" role="status">
        {result.total} {result.total === 1 ? 'item' : 'items'}
        {result.pageCount > 1 && ` · page ${result.page} of ${result.pageCount}`}
      </p>
      <ContentGrid items={result.items} />
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath={basePath}
        searchParams={searchParams}
      />
    </>
  )
}
