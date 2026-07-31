import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getExpert } from '@/lib/content/queries'
import { PageHeader } from '@/components/ui/states'
import { ContentListing } from '@/components/content/ContentListing'
import { pageParam } from '@/lib/content/page-helpers'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const expert = await getExpert(slug)
  if (!expert) return { title: 'Not found' }
  return {
    title: expert.display_name,
    description: expert.biography ?? `Research by ${expert.display_name}.`,
    alternates: { canonical: `/experts/${slug}` },
  }
}

export default async function ExpertPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const expert = await getExpert(slug)
  if (!expert) notFound()

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow={expert.job_title ?? 'Expert'}
        title={expert.display_name}
        {...(expert.biography ? { lede: expert.biography } : {})}
      />

      {(expert.organisation || expert.disclosures) && (
        <dl className="grid gap-x-8 gap-y-3 border-b border-[--color-rule] py-6 text-[--text-caption] sm:grid-cols-[10rem_1fr]">
          {expert.organisation && (
            <>
              <dt className="font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
                Affiliation
              </dt>
              <dd className="text-[--color-ink-muted]">{expert.organisation}</dd>
            </>
          )}
          {expert.disclosures && (
            <>
              <dt className="font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
                Disclosures
              </dt>
              <dd className="text-[--color-ink-muted]">{expert.disclosures}</dd>
            </>
          )}
        </dl>
      )}

      <h2 className="pt-10 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]">
        Published work
      </h2>
      <ContentListing
        filters={{ authorSlug: slug, page: pageParam(sp['page']), pageSize: 12 }}
        basePath={`/experts/${slug}`}
        emptyTitle={`No published work by ${expert.display_name}`}
      />
    </div>
  )
}
