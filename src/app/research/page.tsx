import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { ContentListing } from '@/components/content/ContentListing'
import { pageParam } from '@/lib/content/page-helpers'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Research',
  description: 'Reports, white papers, briefs, case studies and data from Crucible Insight.',
  alternates: { canonical: '/research' },
}

export default async function ResearchIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const page = pageParam(sp['page'])

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Research"
        title="Primary research and analysis"
        lede="Every report carries its methodology, its limitations, and a citation addressed to the exact version you read."
      />
      <ContentListing
        filters={{
          page,
          pageSize: 12,
          contentTypes: ['report', 'white_paper', 'brief', 'case_study', 'data_story'],
        }}
        basePath="/research"
      />
    </div>
  )
}
