import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { ContentListing } from '@/components/content/ContentListing'
import { pageParam, firstParam } from '@/lib/content/page-helpers'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Insights',
  description: 'All published research, analysis and commentary from Crucible Insight.',
  alternates: { canonical: '/insights' },
}

const TYPE_FILTERS = [
  { key: undefined, label: 'All' },
  { key: 'report', label: 'Reports' },
  { key: 'white_paper', label: 'White papers' },
  { key: 'brief', label: 'Briefs' },
  { key: 'article', label: 'Articles' },
  { key: 'case_study', label: 'Case studies' },
  { key: 'data_story', label: 'Data' },
]

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const page = pageParam(sp['page'])
  const type = firstParam(sp['type'])

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Insights"
        title="Everything we have published"
        lede="Research, analysis and commentary. Filter by format, or browse by industry, capability or topic."
      />

      <nav aria-label="Filter by format" className="border-b border-[--color-rule] py-4">
        <ul className="flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[--text-caption]">
          {TYPE_FILTERS.map((f) => {
            const active = f.key === type
            return (
              <li key={f.label}>
                <a
                  href={f.key ? `/insights?type=${f.key}` : '/insights'}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'font-semibold text-[--color-accent] no-underline'
                      : 'text-[--color-ink-muted] no-underline hover:text-[--color-accent] hover:underline'
                  }
                >
                  {f.label}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      <ContentListing
        filters={{ page, pageSize: 12, ...(type ? { contentTypes: [type] } : {}) }}
        basePath="/insights"
        searchParams={{ ...(type ? { type } : {}) }}
      />
    </div>
  )
}
