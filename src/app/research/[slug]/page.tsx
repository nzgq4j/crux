import type { Metadata } from 'next'
import { ArticleView } from '@/components/content/ArticleView'
import { Tombstone } from '@/components/content/Tombstone'
import { loadContent, contentMetadata } from '@/lib/content/page-helpers'

export const revalidate = 300

const RESEARCH_TYPES = ['report', 'white_paper', 'brief', 'case_study', 'data_story']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return contentMetadata(slug)
}

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const loaded = await loadContent(slug, RESEARCH_TYPES)

  // A withdrawn item retains its identifier and citation record and serves a
  // tombstone rather than the content body (rules/content-modeling.md 11).
  if (loaded.content.lifecycle_state === 'withdrawn') {
    return <Tombstone content={loaded.content} contributors={loaded.contributors} />
  }

  return <ArticleView {...loaded} />
}
