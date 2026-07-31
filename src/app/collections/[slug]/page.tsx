import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBySlug, getModules } from '@/lib/content/queries'
import { asAnon } from '@/lib/db/client'
import { PageHeader } from '@/components/ui/states'
import { ContentCard, contentHref } from '@/components/content/ContentCard'
import { ModuleRenderer } from '@/components/content/ModuleRenderer'
import type { ContentSummary } from '@/lib/content/queries'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const content = await getBySlug(slug)
  if (!content) return { title: 'Not found' }
  return {
    title: content.title,
    description: content.standfirst ?? undefined,
    alternates: { canonical: `/collections/${slug}` },
  }
}

/**
 * Collection members in EDITORIAL order, not date order
 * (Block 07 §7.8 / rules/content-modeling.md).
 */
function listMembers(itemId: string): Promise<ContentSummary[]> {
  return asAnon((s) =>
    s.query<ContentSummary>(
      `SELECT i.public_id, i.canonical_slug, i.content_type_key,
              v.title, v.standfirst, v.published_at,
              v.public_version_id AS version_public_id,
              GREATEST(1, CEIL(COALESCE(length(v.plain_text),0) / 1100.0))::int AS reading_minutes
         FROM cms.content_relationships r
         JOIN cms.content_items i ON i.id = r.to_item_id
         JOIN cms.content_versions v ON v.id = i.current_version_id
        WHERE r.from_item_id = $1
          AND r.relationship = 'part_of_collection'
          AND i.lifecycle_state = 'published'
          AND v.status = 'published'
        ORDER BY r.position ASC
        LIMIT 100`,
      [itemId],
    ),
  )
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const content = await getBySlug(slug)
  if (!content || content.content_type_key !== 'collection') notFound()

  const [modules, members] = await Promise.all([
    getModules(content.version_id),
    listMembers(content.item_id),
  ])

  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Collection"
        title={content.title}
        {...(content.standfirst ? { lede: content.standfirst } : {})}
      />

      {modules.length > 0 && (
        <div className="max-w-[--container-reading] py-10">
          <ModuleRenderer modules={modules} />
        </div>
      )}

      <section aria-labelledby="members-label" className="py-8">
        <h2
          id="members-label"
          className="mb-8 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
        >
          In this collection
        </h2>
        {members.length === 0 ? (
          <p className="text-[--color-ink-muted]">This collection has no published items yet.</p>
        ) : (
          <ol className="list-none space-y-8 p-0">
            {members.map((m, i) => (
              <li key={m.public_id} className="flex gap-6 border-t border-[--color-rule] pt-5">
                <span
                  aria-hidden="true"
                  className="font-[--font-display] text-[--text-h3] font-semibold text-[--color-rule-strong]"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <ContentCard item={m} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="border-t border-[--color-rule] py-8">
        <Link href="/research/collections" className="text-[--color-accent]">
          All collections
        </Link>
      </p>
    </div>
  )
}

export { contentHref }
