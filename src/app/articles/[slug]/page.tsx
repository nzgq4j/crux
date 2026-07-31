import type { Metadata } from 'next'
import { ArticleView } from '@/components/content/ArticleView'
import { Tombstone } from '@/components/content/Tombstone'
import { loadContent, contentMetadata } from '@/lib/content/page-helpers'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return contentMetadata(slug)
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const loaded = await loadContent(slug, ['article'])

  if (loaded.content.lifecycle_state === 'withdrawn') {
    return <Tombstone content={loaded.content} contributors={loaded.contributors} />
  }

  return <ArticleView {...loaded} />
}
