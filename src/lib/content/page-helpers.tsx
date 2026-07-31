import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  getBySlug,
  getModules,
  getContributors,
  getItemTerms,
  listRelated,
  getVersionHistory,
} from '@/lib/content/queries'

/**
 * Shared loading for every single-item reading route.
 *
 * `/research/[slug]` and `/articles/[slug]` differ only in which content types they
 * accept, so the fetch, the tombstone handling and the metadata live here once
 * rather than being duplicated and drifting apart.
 */

export interface LoadedContent {
  content: NonNullable<Awaited<ReturnType<typeof getBySlug>>>
  modules: Awaited<ReturnType<typeof getModules>>
  contributors: Awaited<ReturnType<typeof getContributors>>
  terms: Awaited<ReturnType<typeof getItemTerms>>
  related: Awaited<ReturnType<typeof listRelated>>
  history: Awaited<ReturnType<typeof getVersionHistory>>
}

/**
 * Load an item, or trigger a 404.
 *
 * A withdrawn item is NOT a 404: it keeps its identifier and citation record and
 * serves a tombstone (rules/content-modeling.md 11). The caller decides how to
 * present that, so this returns it rather than swallowing it.
 */
export async function loadContent(slug: string, allowedTypes?: string[]): Promise<LoadedContent> {
  const content = await getBySlug(slug)

  // A restricted item and a non-existent one are indistinguishable here, because
  // getBySlug returns null for both (rules/backend.md 18).
  if (!content) notFound()
  if (allowedTypes && !allowedTypes.includes(content.content_type_key)) notFound()

  const [modules, contributors, terms, related, history] = await Promise.all([
    getModules(content.version_id),
    getContributors(content.version_id),
    getItemTerms(content.item_id),
    listRelated(content.item_id),
    getVersionHistory(content.item_id),
  ])

  return { content, modules, contributors, terms, related, history }
}

export async function contentMetadata(slug: string): Promise<Metadata> {
  const content = await getBySlug(slug)
  if (!content) return { title: 'Not found' }

  const withdrawn = content.lifecycle_state === 'withdrawn'

  return {
    title: content.title,
    description: content.standfirst ?? content.executive_summary ?? undefined,
    alternates: { canonical: `/${content.content_type_key === 'article' ? 'articles' : 'research'}/${content.canonical_slug}` },
    // A withdrawn item stays resolvable for citation but must not be promoted.
    robots: withdrawn ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: content.title,
      description: content.standfirst ?? undefined,
      ...(content.published_at ? { publishedTime: content.published_at } : {}),
    },
  }
}

/** Page number from a `?page=` search param, bounded and never NaN. */
export function pageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && raw.length > 0 ? raw : undefined
}
