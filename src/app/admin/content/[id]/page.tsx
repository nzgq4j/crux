import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getVersion,
  getVersionModules,
  listTransitions,
  listReviews,
} from '@/lib/admin/queries'
import { hasPermission } from '@/lib/auth/permissions'
import { TransitionForm, ReviewForm, ApprovalForm } from './EditorialActions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const version = await getVersion(id)
  return { title: version ? version.title : 'Version', robots: { index: false, follow: false } }
}

/**
 * One version, and what may be done with it.
 *
 * The forms are rendered according to what the user holds, but that is presentation.
 * Every action re-verifies, and `workflow.perform_transition` re-verifies again inside
 * the transaction (rules/frontend.md 21).
 */
export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const version = await getVersion(id)
  if (!version) notFound()

  const [modules, transitions, reviews, mayReview, mayApprove] = await Promise.all([
    getVersionModules(id),
    listTransitions(id),
    listReviews(id),
    hasPermission('content.review'),
    hasPermission('content.approve'),
  ])

  return (
    <div className="pb-20">
      <div className="py-10">
        <p className="text-[length:--text-small] text-[--color-text-muted]">
          <Link href="/admin" className="underline underline-offset-4">
            Editorial queue
          </Link>
        </p>
        <h1 className="mt-2 text-[length:--text-heading-1] font-[--font-weight-bold]">
          {version.title}
        </h1>
        <p className="mt-2 text-[--color-text-muted]">
          {version.contentType} · v{version.versionNumber} · {version.stateName} · review round{' '}
          {version.reviewRound}
        </p>
      </div>

      <section aria-labelledby="properties" className="max-w-[--container-reading]">
        <h2 id="properties" className="text-[length:--text-heading-2] font-[--font-weight-bold]">
          Properties
        </h2>
        <dl className="mt-4 space-y-3">
          <Property label="Public identifier" value={version.publicId} />
          <Property label="Slug" value={version.slug} />
          <Property label="Evidence standard" value={version.minimumEvidenceStandard} />
          <Property
            label="Methodology"
            value={
              version.methodology
                ? 'present'
                : version.requiresMethodology
                  ? 'absent — required by this content type'
                  : 'absent — not required'
            }
          />
          <Property
            label="Limitations"
            value={
              version.limitations
                ? 'present'
                : version.requiresLimitations
                  ? 'absent — required by this content type'
                  : 'absent — not required'
            }
          />
          <Property label="Published" value={version.publishedAt ?? 'not published'} />
        </dl>
      </section>

      <section aria-labelledby="modules" className="mt-12">
        <h2 id="modules" className="text-[length:--text-heading-2] font-[--font-weight-bold]">
          Structure
        </h2>
        <p className="mt-2 text-[--color-text-muted]">
          {modules.length} module{modules.length === 1 ? '' : 's'}
        </p>
        <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label="Module list, scrollable">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Modules of this version, in order</caption>
            <thead>
              <tr className="border-b border-[--color-border]">
                <th scope="col" className="py-2 pr-6 font-[--font-weight-bold]">#</th>
                <th scope="col" className="py-2 pr-6 font-[--font-weight-bold]">Type</th>
                <th scope="col" className="py-2 pr-6 font-[--font-weight-bold]">Fragment</th>
                <th scope="col" className="py-2 font-[--font-weight-bold]">Preview</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id} className="border-b border-[--color-border] align-top">
                  <td className="py-2 pr-6 tabular-nums">{m.position}</td>
                  <td className="py-2 pr-6">{m.moduleKey}</td>
                  <td className="py-2 pr-6 font-mono text-[length:--text-small]">{m.fragmentId}</td>
                  <td className="py-2">{preview(m.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="transitions" className="mt-12 max-w-[--container-reading]">
        <h2 id="transitions" className="text-[length:--text-heading-2] font-[--font-weight-bold]">
          Move this version
        </h2>
        <div className="mt-4">
          <TransitionForm versionId={version.versionId} options={transitions} />
        </div>
      </section>

      {reviews.length > 0 && (
        <section aria-labelledby="reviews" className="mt-12 max-w-[--container-reading]">
          <h2 id="reviews" className="text-[length:--text-heading-2] font-[--font-weight-bold]">
            Reviews
          </h2>
          <ul className="mt-4 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-[--color-border] pt-3">
                <p>
                  Round {r.round} · {r.verdict.replace(/_/g, ' ')}
                  {r.submittedAt && ` · ${r.submittedAt.slice(0, 10)}`}
                </p>
                {r.notes && <p className="mt-1 text-[--color-text-muted]">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mayReview && (
        <section aria-labelledby="record-review" className="mt-12 max-w-[--container-reading]">
          <h2 id="record-review" className="text-[length:--text-heading-2] font-[--font-weight-bold]">
            Record a review
          </h2>
          <div className="mt-4">
            <ReviewForm versionId={version.versionId} />
          </div>
        </section>
      )}

      {mayApprove && (
        <section aria-labelledby="record-approval" className="mt-12 max-w-[--container-reading]">
          <h2
            id="record-approval"
            className="text-[length:--text-heading-2] font-[--font-weight-bold]"
          >
            Record an approval decision
          </h2>
          <div className="mt-4">
            <ApprovalForm versionId={version.versionId} itemId={version.itemId} />
          </div>
        </section>
      )}
    </div>
  )
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-4">
      <dt className="w-56 shrink-0 text-[--color-text-muted]">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** A short, safe preview of a module payload. Never rendered as HTML. */
function preview(payload: Record<string, unknown>): string {
  const candidate =
    (payload.heading as string) ??
    (payload.text as string) ??
    (payload.caption as string) ??
    (payload.label as string) ??
    (Array.isArray(payload.items) ? String(payload.items[0]) : undefined)
  if (!candidate) return '—'
  return candidate.length > 120 ? `${candidate.slice(0, 120)}…` : candidate
}
