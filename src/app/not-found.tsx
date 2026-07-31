import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[--container-reading] px-6 py-24">
      <p className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
        404
      </p>
      <h1 className="font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height]">
        We could not find that page
      </h1>
      <p className="mt-4 text-[--color-ink-muted]">
        The address may be mistyped, or the item may never have been published. Content
        that was published and later withdrawn keeps its address and shows a withdrawal
        notice instead of disappearing, so this is not that.
      </p>
      <ul className="mt-8 list-none space-y-2 p-0">
        <li>
          <Link href="/insights" className="text-[--color-accent]">
            Browse all insights
          </Link>
        </li>
        <li>
          <Link href="/research" className="text-[--color-accent]">
            Browse research
          </Link>
        </li>
        <li>
          <Link href="/search" className="text-[--color-accent]">
            Search
          </Link>
        </li>
      </ul>
    </div>
  )
}
