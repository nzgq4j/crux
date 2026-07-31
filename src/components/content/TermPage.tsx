import { notFound } from 'next/navigation'
import { getTerm } from '@/lib/content/queries'
import { PageHeader } from '@/components/ui/states'
import { ContentListing } from '@/components/content/ContentListing'

/** A single taxonomy term surface, shared by industries, capabilities and topics. */
export async function TermPage({
  slug,
  eyebrow,
  basePath,
  page,
}: {
  slug: string
  eyebrow: string
  basePath: string
  page: number
}) {
  const term = await getTerm(slug)
  if (!term) notFound()

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow={eyebrow}
        title={term.name}
        {...(term.description ? { lede: term.description } : {})}
      />
      <ContentListing
        filters={{ termSlug: slug, page, pageSize: 12 }}
        basePath={`${basePath}/${slug}`}
        emptyTitle={`Nothing published under ${term.name} yet`}
      />
    </div>
  )
}

export async function termMetadata(slug: string, suffix: string) {
  const term = await getTerm(slug)
  if (!term) return { title: 'Not found' }
  return {
    title: `${term.name} — ${suffix}`,
    description: term.description ?? `Research on ${term.name}.`,
  }
}
