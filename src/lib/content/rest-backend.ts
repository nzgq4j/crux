import 'server-only'
import type {
  ContentSummary,
  ContentDetail,
  ContentModule,
  Contributor,
  Term,
  Expert,
  Page,
  ListFilters,
  SearchHit,
  VersionHistoryEntry,
} from './types'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, bound } from './types'
import { publicEnv } from '@/lib/env/public'

/**
 * PostgREST backend (Block 03 boundary).
 *
 * Used where the app cannot open a direct PostgreSQL connection — notably a
 * serverless deployment holding only the publishable key.
 *
 * The security model is unchanged. The publishable key authenticates as the `anon`
 * role, and every view it reads is `security_invoker`, so the same RLS policies that
 * govern the direct-SQL path govern this one. The key is safe to ship precisely
 * because it grants nothing that RLS does not already permit an anonymous reader.
 */

const BASE = publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? ''
const KEY = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export function restConfigured(): boolean {
  return BASE.length > 0 && KEY.length > 0
}

interface RestResult<T> {
  rows: T[]
  total: number
}

async function rest<T>(
  path: string,
  { count = false, revalidate = 300 }: { count?: boolean; revalidate?: number } = {},
): Promise<RestResult<T>> {
  const headers: Record<string, string> = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Accept: 'application/json',
  }
  if (count) headers['Prefer'] = 'count=exact'

  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers,
    next: { revalidate },
  })

  if (!res.ok) {
    // Sanitised: the provider's raw payload never reaches a client
    // (rules/backend.md 16). Status and path are enough to diagnose.
    throw new Error(`content store returned ${res.status} for ${path.split('?')[0]}`)
  }

  const rows = (await res.json()) as T[]

  // PostgREST reports the unpaginated total in Content-Range as "0-11/247".
  const range = res.headers.get('content-range')
  const total = range?.includes('/') ? Number(range.split('/')[1]) : rows.length

  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

const SUMMARY_SELECT =
  'public_id,canonical_slug,content_type_key,title,standfirst,published_at,version_public_id,reading_minutes'

function publishedOnly(): string {
  // The view exposes published, superseded and withdrawn; a listing shows only
  // currently-published work. Withdrawn items stay reachable at their own URL.
  return 'lifecycle_state=eq.published'
}

export async function listContent(filters: ListFilters = {}): Promise<Page<ContentSummary>> {
  const page = bound(filters.page, 1, 10_000)
  const pageSize = bound(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const from = (page - 1) * pageSize
  const order = filters.sort === 'oldest' ? 'asc' : 'desc'

  const params = [
    `select=${SUMMARY_SELECT}`,
    publishedOnly(),
    `order=published_at.${order}.nullslast`,
    `offset=${from}`,
    `limit=${pageSize}`,
  ]

  if (filters.contentTypes?.length) {
    params.push(`content_type_key=in.(${filters.contentTypes.join(',')})`)
  }

  // Term and author filters need an id set first: PostgREST cannot express these
  // as a single joined predicate across schemas.
  if (filters.termSlug) {
    const ids = await itemIdsForTerm(filters.termSlug)
    if (ids.length === 0) return emptyPage(page, pageSize)
    params.push(`item_id=in.(${ids.join(',')})`)
  }
  if (filters.authorSlug) {
    const ids = await itemIdsForAuthor(filters.authorSlug)
    if (ids.length === 0) return emptyPage(page, pageSize)
    params.push(`item_id=in.(${ids.join(',')})`)
  }

  const { rows, total } = await rest<ContentSummary>(`published_content?${params.join('&')}`, {
    count: true,
  })

  return { items: rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

function emptyPage(page: number, pageSize: number): Page<ContentSummary> {
  return { items: [], total: 0, page, pageSize, pageCount: 1 }
}

async function itemIdsForTerm(slug: string): Promise<string[]> {
  const { rows } = await rest<{ content_item_id: string }>(
    `content_taxonomy?select=content_item_id&slug=eq.${encodeURIComponent(slug)}&limit=500`,
  )
  return rows.map((r) => r.content_item_id)
}

async function itemIdsForAuthor(slug: string): Promise<string[]> {
  const { rows: versions } = await rest<{ version_id: string }>(
    `published_contributors?select=version_id&slug=eq.${encodeURIComponent(slug)}&role=eq.author&limit=500`,
  )
  if (versions.length === 0) return []
  const { rows } = await rest<{ item_id: string }>(
    `published_content?select=item_id&version_id=in.(${versions.map((v) => v.version_id).join(',')})&limit=500`,
  )
  return rows.map((r) => r.item_id)
}

export async function listRecent(limit = 12, contentType?: string): Promise<ContentSummary[]> {
  const result = await listContent({
    pageSize: limit,
    ...(contentType ? { contentTypes: [contentType] } : {}),
  })
  return result.items
}

export async function getBySlug(slug: string): Promise<ContentDetail | null> {
  const { rows } = await rest<ContentDetail>(
    `published_content?select=*&canonical_slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return rows[0] ?? null
}

export async function getModules(versionId: string): Promise<ContentModule[]> {
  const { rows } = await rest<ContentModule>(
    `published_modules?select=fragment_id,module_key,position,payload&version_id=eq.${versionId}&order=position.asc&limit=500`,
  )
  return rows
}

export async function getContributors(versionId: string): Promise<Contributor[]> {
  const { rows } = await rest<Contributor>(
    `published_contributors?select=display_name,slug,role,affiliation&version_id=eq.${versionId}&order=position.asc&limit=100`,
  )
  return rows
}

export async function getItemTerms(itemId: string): Promise<Term[]> {
  const { rows } = await rest<Omit<Term, 'content_count'>>(
    `content_taxonomy?select=slug,name,description,vocabulary&content_item_id=eq.${itemId}&limit=100`,
  )
  return rows.map((r) => ({ ...r, content_count: 0 }))
}

export async function listRelated(itemId: string, limit = 4): Promise<ContentSummary[]> {
  const { rows: mine } = await rest<{ slug: string }>(
    `content_taxonomy?select=slug&content_item_id=eq.${itemId}&limit=20`,
  )
  if (mine.length === 0) return []

  const { rows: siblings } = await rest<{ content_item_id: string }>(
    `content_taxonomy?select=content_item_id&slug=in.(${mine.map((m) => m.slug).join(',')})&limit=200`,
  )
  const ids = [...new Set(siblings.map((s) => s.content_item_id))].filter((id) => id !== itemId)
  if (ids.length === 0) return []

  const { rows } = await rest<ContentSummary>(
    `published_content?select=${SUMMARY_SELECT}&${publishedOnly()}&item_id=in.(${ids.slice(0, 50).join(',')})&order=published_at.desc.nullslast&limit=${bound(limit, 4, 12)}`,
  )
  return rows
}

/**
 * Revision history.
 *
 * Not exposed over REST in this deployment: the view would have to publish
 * non-current versions, which needs its own policy review first. The reading surface
 * degrades to omitting the revision list rather than failing — and the citation block
 * still addresses the exact version, which is the part that matters.
 *
 * The parameter is accepted and ignored so both backends share one signature.
 */
export async function getVersionHistory(_itemId?: string): Promise<VersionHistoryEntry[]> {
  return []
}

export async function listTerms(vocabulary: string): Promise<Term[]> {
  const { rows } = await rest<Term>(
    `term_index?select=slug,name,description,vocabulary,content_count&vocabulary=eq.${encodeURIComponent(vocabulary)}&order=name.asc&limit=200`,
  )
  return rows
}

export async function getTerm(slug: string): Promise<Term | null> {
  const { rows } = await rest<Term>(
    `term_index?select=slug,name,description,vocabulary,content_count&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return rows[0] ?? null
}

export async function listExperts(): Promise<Expert[]> {
  const { rows } = await rest<Expert>(
    `expert_index?select=slug,display_name,job_title,biography,disclosures,organisation&order=display_name.asc&limit=${MAX_PAGE_SIZE}`,
  )
  return rows
}

export async function getExpert(slug: string): Promise<Expert | null> {
  const { rows } = await rest<Expert>(
    `expert_index?select=slug,display_name,job_title,biography,disclosures,organisation&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return rows[0] ?? null
}

export async function listCollectionMembers(itemId: string): Promise<ContentSummary[]> {
  const { rows } = await rest<ContentSummary>(
    `collection_members?select=public_id,canonical_slug,content_type_key,title,standfirst,published_at,version_public_id,reading_minutes&from_item_id=eq.${itemId}&order=position.asc&limit=100`,
  )
  return rows
}

export async function searchContent(
  query: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Page<SearchHit>> {
  const q = query.trim()
  const p = bound(page, 1, 1000)
  const size = bound(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  if (q.length === 0) return { items: [], total: 0, page: p, pageSize: size, pageCount: 1 }

  // PostgREST `or` with ilike across the indexed text columns. Escaping matters:
  // a comma or parenthesis in the query would otherwise alter the filter grammar.
  const safe = q.replace(/[(),*]/g, ' ').trim()
  if (safe.length === 0) return { items: [], total: 0, page: p, pageSize: size, pageCount: 1 }
  const pattern = `*${safe}*`

  const { rows, total } = await rest<ContentSummary>(
    `published_content?select=${SUMMARY_SELECT}&${publishedOnly()}` +
      `&or=(title.ilike.${encodeURIComponent(pattern)},standfirst.ilike.${encodeURIComponent(pattern)},plain_text.ilike.${encodeURIComponent(pattern)})` +
      `&order=published_at.desc.nullslast&offset=${(p - 1) * size}&limit=${size}`,
    { count: true, revalidate: 0 },
  )

  return {
    items: rows.map((r) => ({ ...r, rank: 0 })),
    total,
    page: p,
    pageSize: size,
    pageCount: Math.max(1, Math.ceil(total / size)),
  }
}
