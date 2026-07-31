import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { ContentListing } from '@/components/content/ContentListing'
import { pageParam } from '@/lib/content/page-helpers'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Curated, editorially ordered sets of related research.',
  alternates: { canonical: '/research/collections' },
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Collections"
        title="Curated research"
        lede="Multi-part work grouped around a single question, ordered editorially rather than by date."
      />
      <ContentListing
        filters={{ contentTypes: ['collection'], page: pageParam(sp['page']), pageSize: 12 }}
        basePath="/research/collections"
        emptyTitle="No collections published yet"
      />
    </div>
  )
}
