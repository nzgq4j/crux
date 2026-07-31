import Link from 'next/link'

/**
 * Explicit states for every asynchronous surface (rules/frontend.md 14).
 * A blank screen is not a state.
 */

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string
  title: string
  lede?: string
}) {
  return (
    <header className="border-b border-[--color-rule] py-12">
      {eyebrow && (
        <p className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-accent]">
          {eyebrow}
        </p>
      )}
      <h1 className="max-w-[24ch] font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height] tracking-[--text-h1--letter-spacing]">
        {title}
      </h1>
      {lede && (
        <p className="mt-4 max-w-[--container-reading] text-[--text-lede] leading-[--text-lede--line-height] text-[--color-ink-muted]">
          {lede}
        </p>
      )}
    </header>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <section className="py-16">
      <h2 className="font-[--font-display] text-[--text-h3] font-semibold">{title}</h2>
      <div className="mt-3 max-w-[--container-reading] text-[--color-ink-muted]">{children}</div>
    </section>
  )
}

/**
 * A degraded surface. `role="status"` announces it, and the copy states what
 * happened and what the reader can do instead — never a stack trace
 * (rules/backend.md 16).
 */
export function DegradedState({
  title = 'This section is temporarily unavailable',
  children,
}: {
  title?: string
  children?: React.ReactNode
}) {
  return (
    <section className="py-16" role="status">
      <h2 className="font-[--font-display] text-[--text-h3] font-semibold">{title}</h2>
      <div className="mt-3 max-w-[--container-reading] text-[--color-ink-muted]">
        {children ?? (
          <p>
            We could not reach the content store. The rest of the site is still
            available and this page recovers automatically once the connection returns.
          </p>
        )}
      </div>
      <p className="mt-4">
        <Link href="/search" className="text-[--color-accent]">
          Try search instead
        </Link>
      </p>
    </section>
  )
}

/** Skeleton rows for a listing. Presentational only, hidden from assistive tech. */
export function ListingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-10 py-14 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-t border-[--color-rule] pt-5">
          <div className="h-3 w-24 bg-[--color-surface-sunken]" />
          <div className="mt-3 h-5 w-full bg-[--color-surface-sunken]" />
          <div className="mt-2 h-5 w-3/4 bg-[--color-surface-sunken]" />
          <div className="mt-3 h-3 w-32 bg-[--color-surface-sunken]" />
        </div>
      ))}
    </div>
  )
}

export function Pagination({
  page,
  pageCount,
  basePath,
  searchParams = {},
}: {
  page: number
  pageCount: number
  basePath: string
  searchParams?: Record<string, string | undefined>
}) {
  if (pageCount <= 1) return null

  const href = (p: number) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) params.set(k, v)
    }
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-between border-t border-[--color-rule] pt-6">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-[--color-accent] no-underline hover:underline">
          ← Previous
        </Link>
      ) : (
        <span className="text-[--color-ink-faint]">← Previous</span>
      )}
      <span className="text-[--text-caption] text-[--color-ink-muted]" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="text-[--color-accent] no-underline hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-[--color-ink-faint]">Next →</span>
      )}
    </nav>
  )
}
