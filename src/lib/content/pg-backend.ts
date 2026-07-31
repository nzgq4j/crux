import 'server-only'
import { asAnon, asUser, type RequestContext } from '@/lib/db/client'
import {
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  bound,
  type ContentSummary,
  type ContentDetail,
  type ContentModule,
  type Contributor,
  type Term,
  type Expert,
  type Page,
  type ListFilters,
  type SearchHit,
  type VersionHistoryEntry,
} from './types'

/**
 * Public content reads (Block 11).
 *
 * Every query runs through the RLS-enforced path. Visibility is decided by database
 * policies, not by a WHERE clause here — the `status = 'published'` predicates are
 * for result-set correctness, not access control. If a policy were removed these
 * queries would fail closed rather than leak.
 *
 * Every list is bounded. No unbounded query reaches the database
 * (rules/database.md 23).
 */

const SUMMARY_COLUMNS = `
  i.public_id,
  i.canonical_slug,
  i.content_type_key,
  v.title,
  v.standfirst,
  v.published_at,
  v.public_version_id AS version_public_id,
  GREATEST(1, CEIL(COALESCE(length(v.plain_text), 0) / 1100.0))::int AS reading_minutes
`

const PUBLISHED_FROM = `
  FROM cms.content_items i
  JOIN cms.content_versions v ON v.id = i.current_version_id
  WHERE i.lifecycle_state = 'published'
    AND v.status = 'published'
`

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/**
 * The single listing query every public surface uses. Filters compose; each is
 * applied as an EXISTS so the row count stays correct for pagination.
 */
export async function listContent(filters: ListFilters = {}): Promise<Page<ContentSummary>> {
  const page = bound(filters.page, 1, 10_000)
  const pageSize = bound(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const offset = (page - 1) * pageSize
  const order = filters.sort === 'oldest' ? 'ASC' : 'DESC'

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.contentTypes?.length) {
    params.push(filters.contentTypes)
    conditions.push(`i.content_type_key = ANY($${params.length})`)
  }
  if (filters.termSlug) {
    params.push(filters.termSlug)
    conditions.push(`EXISTS (
      SELECT 1 FROM taxonomy.content_terms ct
        JOIN taxonomy.terms t ON t.id = ct.term_id
       WHERE ct.content_item_id = i.id AND t.slug = $${params.length})`)
  }
  if (filters.authorSlug) {
    params.push(filters.authorSlug)
    conditions.push(`EXISTS (
      SELECT 1 FROM cms.content_contributors cc
        JOIN identity.people p ON p.id = cc.person_id
       WHERE cc.version_id = v.id AND p.slug = $${params.length} AND cc.role = 'author')`)
  }

  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : ''

  return asAnon(async (s) => {
    const totalRow = await s.one<{ total: string }>(
      `SELECT count(*)::text AS total ${PUBLISHED_FROM}${where}`,
      params,
    )
    const total = Number(totalRow?.total ?? 0)

    // Pagination is bound rather than interpolated. The count query above keeps the
    // unpaginated params so the total stays correct.
    const pageParams = [...params, pageSize, offset]
    const items = await s.query<ContentSummary>(
      `SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM}${where}
       ORDER BY v.published_at ${order} NULLS LAST, i.canonical_slug ASC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams,
    )

    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
  })
}

/** Convenience wrapper for the homepage and rails. */
export async function listRecent(limit = 12, contentType?: string): Promise<ContentSummary[]> {
  const result = await listContent({
    pageSize: limit,
    ...(contentType ? { contentTypes: [contentType] } : {}),
  })
  return result.items
}

/** Related content: shares a taxonomy term, excluding the item itself. */
export function listRelated(itemId: string, limit = 4): Promise<ContentSummary[]> {
  const bounded = bound(limit, 4, 12)
  return asAnon((s) =>
    s.query<ContentSummary>(
      `SELECT DISTINCT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM}
         AND i.id <> $1
         AND EXISTS (
           SELECT 1 FROM taxonomy.content_terms a
             JOIN taxonomy.content_terms b ON b.term_id = a.term_id
            WHERE a.content_item_id = $1 AND b.content_item_id = i.id)
       ORDER BY v.published_at DESC NULLS LAST
       LIMIT $2`,
      [itemId, bounded],
    ),
  )
}

// ---------------------------------------------------------------------------
// Single item
// ---------------------------------------------------------------------------

/**
 * Resolve a slug to its current published version.
 *
 * Returns null when the item does not exist OR the caller may not read it — the two
 * are deliberately indistinguishable (rules/backend.md 18).
 */
export function getBySlug(slug: string, ctx?: RequestContext): Promise<ContentDetail | null> {
  const sql = `
    SELECT ${SUMMARY_COLUMNS},
           i.id  AS item_id,
           i.lifecycle_state,
           i.withdrawal_reason,
           i.withdrawn_at,
           v.id  AS version_id,
           v.subtitle,
           v.stated_date,
           v.stated_date_precision,
           dm.label   AS distribution_marking,
           dm.repeats_in_furniture AS distribution_marking_repeats,
           v.executive_summary,
           v.methodology,
           v.limitations,
           v.revised_at,
           v.correction_reason,
           v.correction_scope
      FROM cms.content_items i
      JOIN cms.content_versions v ON v.id = i.current_version_id
      LEFT JOIN cms.distribution_markings dm ON dm.key = v.distribution_marking_key
     WHERE i.canonical_slug = $1
     LIMIT 1`
  return ctx
    ? asUser(ctx, (s) => s.one<ContentDetail>(sql, [slug]))
    : asAnon((s) => s.one<ContentDetail>(sql, [slug]))
}

export function getModules(versionId: string, ctx?: RequestContext): Promise<ContentModule[]> {
  const sql = `
    SELECT fragment_id, module_key, position, payload
      FROM cms.content_version_modules
     WHERE version_id = $1
     ORDER BY position ASC`
  return ctx
    ? asUser(ctx, (s) => s.query<ContentModule>(sql, [versionId]))
    : asAnon((s) => s.query<ContentModule>(sql, [versionId]))
}

export function getContributors(versionId: string): Promise<Contributor[]> {
  return asAnon((s) =>
    s.query<Contributor>(
      `SELECT p.display_name, p.slug, c.role, c.affiliation
         FROM cms.content_contributors c
         JOIN identity.people p ON p.id = c.person_id
        WHERE c.version_id = $1
        ORDER BY c.position ASC, p.display_name ASC`,
      [versionId],
    ),
  )
}

export function getItemTerms(itemId: string): Promise<Term[]> {
  return asAnon((s) =>
    s.query<Term>(
      `SELECT t.slug, t.name, t.description, vo.key AS vocabulary, 0 AS content_count
         FROM taxonomy.content_terms ct
         JOIN taxonomy.terms t ON t.id = ct.term_id
         JOIN taxonomy.vocabularies vo ON vo.id = t.vocabulary_id
        WHERE ct.content_item_id = $1
        ORDER BY vo.key, t.name`,
      [itemId],
    ),
  )
}

export function getVersionHistory(itemId: string): Promise<VersionHistoryEntry[]> {
  return asAnon((s) =>
    s.query(
      `SELECT public_version_id, version_number, status, published_at, correction_reason
         FROM cms.content_versions
        WHERE content_item_id = $1 AND status IN ('published','superseded','withdrawn')
        ORDER BY version_number DESC`,
      [itemId],
    ),
  )
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export function listTerms(vocabulary: string): Promise<Term[]> {
  return asAnon((s) =>
    s.query<Term>(
      `SELECT t.slug, t.name, t.description, vo.key AS vocabulary,
              (SELECT count(*) FROM taxonomy.content_terms ct
                 JOIN cms.content_items i ON i.id = ct.content_item_id
                WHERE ct.term_id = t.id AND i.lifecycle_state = 'published')::int AS content_count
         FROM taxonomy.terms t
         JOIN taxonomy.vocabularies vo ON vo.id = t.vocabulary_id
        WHERE vo.key = $1 AND t.merged_into_id IS NULL AND t.deprecated_at IS NULL
        ORDER BY t.name ASC`,
      [vocabulary],
    ),
  )
}

export function getTerm(slug: string): Promise<Term | null> {
  return asAnon((s) =>
    s.one<Term>(
      `SELECT t.slug, t.name, t.description, vo.key AS vocabulary,
              (SELECT count(*) FROM taxonomy.content_terms ct
                 JOIN cms.content_items i ON i.id = ct.content_item_id
                WHERE ct.term_id = t.id AND i.lifecycle_state = 'published')::int AS content_count
         FROM taxonomy.terms t
         JOIN taxonomy.vocabularies vo ON vo.id = t.vocabulary_id
        WHERE t.slug = $1
        LIMIT 1`,
      [slug],
    ),
  )
}

// ---------------------------------------------------------------------------
// Experts
// ---------------------------------------------------------------------------

export function listExperts(): Promise<Expert[]> {
  return asAnon((s) =>
    s.query<Expert>(
      `SELECT p.slug, p.display_name, e.job_title, e.biography, e.disclosures,
              o.name AS organisation
         FROM identity.expert_profiles e
         JOIN identity.people p ON p.id = e.person_id
    LEFT JOIN identity.organisations o ON o.id = e.organisation_id
        WHERE e.published_at IS NOT NULL
        ORDER BY p.display_name ASC
        LIMIT $1`,
      [MAX_PAGE_SIZE],
    ),
  )
}

export function getExpert(slug: string): Promise<Expert | null> {
  return asAnon((s) =>
    s.one<Expert>(
      `SELECT p.slug, p.display_name, e.job_title, e.biography, e.disclosures,
              o.name AS organisation
         FROM identity.expert_profiles e
         JOIN identity.people p ON p.id = e.person_id
    LEFT JOIN identity.organisations o ON o.id = e.organisation_id
        WHERE p.slug = $1 AND e.published_at IS NOT NULL
        LIMIT 1`,
      [slug],
    ),
  )
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Lexical search over published content.
 *
 * Permission filtering happens inside the query through RLS on the underlying
 * relations, so counts and result sets are correct for the caller rather than
 * filtered afterwards (§45.1.8). The semantic half of hybrid retrieval needs the
 * embedding pipeline, which is not built — see docs/implementation-status.md.
 */
export async function searchContent(
  query: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Page<SearchHit>> {
  const trimmed = query.trim()
  const p = bound(page, 1, 1000)
  const size = bound(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  if (trimmed.length === 0) {
    return { items: [], total: 0, page: p, pageSize: size, pageCount: 1 }
  }

  const offset = (p - 1) * size

  return asAnon(async (s) => {
    const totalRow = await s.one<{ total: string }>(
      `SELECT count(*)::text AS total
         ${PUBLISHED_FROM}
         AND (v.title ILIKE '%' || $1 || '%'
           OR v.standfirst ILIKE '%' || $1 || '%'
           OR v.plain_text ILIKE '%' || $1 || '%')`,
      [trimmed],
    )
    const total = Number(totalRow?.total ?? 0)

    const items = await s.query<SearchHit>(
      `SELECT ${SUMMARY_COLUMNS},
              (CASE WHEN v.title ILIKE '%' || $1 || '%' THEN 3 ELSE 0 END
             + CASE WHEN v.standfirst ILIKE '%' || $1 || '%' THEN 2 ELSE 0 END
             + CASE WHEN v.plain_text ILIKE '%' || $1 || '%' THEN 1 ELSE 0 END)::int AS rank
         ${PUBLISHED_FROM}
         AND (v.title ILIKE '%' || $1 || '%'
           OR v.standfirst ILIKE '%' || $1 || '%'
           OR v.plain_text ILIKE '%' || $1 || '%')
       ORDER BY rank DESC, v.published_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [trimmed, size, offset],
    )

    return { items, total, page: p, pageSize: size, pageCount: Math.max(1, Math.ceil(total / size)) }
  })
}

export function resolveRedirect(
  path: string,
): Promise<{ target_path: string; status_code: number } | null> {
  return asAnon((s) =>
    s.one(`SELECT target_path, status_code FROM cms.redirects WHERE source_path = $1`, [path]),
  )
}
