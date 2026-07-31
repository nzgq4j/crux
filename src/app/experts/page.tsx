import type { Metadata } from 'next'
import Link from 'next/link'
import { listExperts } from '@/lib/content/queries'
import { PageHeader, EmptyState, DegradedState } from '@/components/ui/states'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Experts',
  description: 'The researchers and analysts behind Crucible Insight.',
  alternates: { canonical: '/experts' },
}

export default async function ExpertsPage() {
  let experts
  try {
    experts = await listExperts()
  } catch {
    return (
      <div className="mx-auto max-w-[--container-wide] px-6">
        <PageHeader eyebrow="Experts" title="Our researchers" />
        <DegradedState />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Experts"
        title="Our researchers"
        lede="Every published item names its authors, their affiliation at the time of publication, and their disclosures."
      />

      {experts.length === 0 ? (
        <EmptyState title="No published profiles">
          <p>Expert profiles exist but none has been published.</p>
        </EmptyState>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-x-10 gap-y-9 p-0 py-12 md:grid-cols-2 lg:grid-cols-3">
          {experts.map((e) => (
            <li key={e.slug} className="border-t border-[--color-rule] pt-5">
              <h2 className="font-[--font-display] text-[--text-h3] font-semibold leading-snug">
                <Link
                  href={`/experts/${e.slug}`}
                  className="text-[--color-ink] no-underline hover:underline"
                >
                  {e.display_name}
                </Link>
              </h2>
              {e.job_title && (
                <p className="mt-1 text-[--text-caption] text-[--color-accent]">{e.job_title}</p>
              )}
              {e.biography && (
                <p className="mt-2 text-[--text-caption] leading-[--text-caption--line-height] text-[--color-ink-muted]">
                  {e.biography}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
