import Link from 'next/link'
import { listQueue, stateCounts } from '@/lib/admin/queries'
import { EmptyState } from '@/components/ui/states'

export const dynamic = 'force-dynamic'

/**
 * The editorial queue.
 *
 * One row per version in the workflow, grouped by state. This is the whole of the
 * minimal administrative surface's list view: enough to find a version and open it,
 * and nothing more. Block 09 proper adds the other eighteen surfaces.
 *
 * State is conveyed as a word, never as a colour alone (rules/accessibility.md 26).
 */
export default async function AdminQueuePage() {
  const [rows, counts] = await Promise.all([listQueue(), stateCounts()])
  const live = counts.filter((c) => c.count > 0)

  return (
    <>
      <div className="py-10">
        <h1 className="text-[length:--text-heading-1] font-[--font-weight-bold]">
          Editorial queue
        </h1>
        <p className="mt-2 max-w-[--container-reading] text-[--color-text-muted] leading-[--text-body--line-height]">
          Every version currently in the workflow. What you can see is decided by the
          database, not by this page.
        </p>

        {live.length > 0 && (
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
            {live.map((c) => (
              <div key={c.state} className="flex gap-2">
                <dt className="text-[--color-text-muted]">{c.name}</dt>
                <dd className="font-[--font-weight-bold]">{c.count}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing in the workflow">
          No version has entered the editorial workflow yet. A version enters it when it
          is created through the editor.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto pb-16" tabIndex={0} aria-label="Editorial queue, scrollable">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Versions in the editorial workflow, ordered by state then by how long they
              have been in it
            </caption>
            <thead>
              <tr className="border-b border-[--color-border]">
                <th scope="col" className="py-3 pr-6 font-[--font-weight-bold]">Title</th>
                <th scope="col" className="py-3 pr-6 font-[--font-weight-bold]">Type</th>
                <th scope="col" className="py-3 pr-6 font-[--font-weight-bold]">State</th>
                <th scope="col" className="py-3 pr-6 font-[--font-weight-bold]">Round</th>
                <th scope="col" className="py-3 pr-6 font-[--font-weight-bold]">Version</th>
                <th scope="col" className="py-3 font-[--font-weight-bold]">Since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.versionId} className="border-b border-[--color-border]">
                  <td className="py-3 pr-6">
                    <Link
                      href={`/admin/content/${r.versionId}`}
                      className="underline underline-offset-4"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-6 text-[--color-text-muted]">{r.contentType}</td>
                  <td className="py-3 pr-6">
                    {r.stateName}
                    {r.isPublic && (
                      <span className="ml-2 text-[length:--text-small] text-[--color-text-muted]">
                        (public)
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-6 tabular-nums">{r.reviewRound}</td>
                  <td className="py-3 pr-6 tabular-nums">v{r.versionNumber}</td>
                  <td className="py-3 text-[--color-text-muted]">
                    <time dateTime={r.enteredAt}>{r.enteredAt.slice(0, 10)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
