import 'server-only'
import { asAnon, asUser, type RequestContext } from '@/lib/db/client'

/**
 * Public content reads (Block 11).
 *
 * Every query here runs through the RLS-enforced path. Visibility is decided by the
 * database policies, not by a WHERE clause added here — the `status = 'published'`
 * predicates below are for correctness of the result set, not for access control.
 * If a policy were removed, these queries would fail closed rather than leak.
 */

export interface ContentSummary {
  public_id: string
  canonical_slug: string
  content_type_key: string
  title: string
  standfirst: string | null
  published_at: string | null
  version_public_id: string
  reading_minutes: number
}

export interface ContentDetail extends ContentSummary {
  version_id: string
  item_id: string
  executive_summary: string | null
  methodology: string | null
  limitations: string | null
  revised_at: string | null
  lifecycle_state: string
  withdrawal_reason: string | null
  correction_reason: string | null
}

export interface ContentModule {
  fragment_id: string
  module_key: string
  position: number
  payload: Record<string, unknown>
}

export interface Contributor {
  display_name: string
  slug: string
  role: string
  affiliation: string | null
}

const SUMMARY_SELECT = `
  SELECT i.public_id,
         i.canonical_slug,
         i.content_type_key,
         v.title,
         v.standfirst,
         v.published_at,
         v.public_version_id      AS version_public_id,
         GREATEST(1, CEIL(COALESCE(length(v.plain_text), 0) / 1100.0))::int AS reading_minutes
    FROM cms.content_items i
    JOIN cms.content_versions v ON v.id = i.current_version_id
   WHERE i.lifecycle_state = 'published'
     AND v.status = 'published'
`

/** Recently published content, newest first. Bounded: no unbounded query. */
export function listRecent(limit = 12, contentType?: string): Promise<ContentSummary[]> {
  const bounded = Math.min(Math.max(limit, 1), 50)
  return asAnon((s) =>
    contentType
      ? s.query<ContentSummary>(
          `${SUMMARY_SELECT} AND i.content_type_key = $1 ORDER BY v.published_at DESC LIMIT $2`,
          [contentType, bounded],
        )
      : s.query<ContentSummary>(`${SUMMARY_SELECT} ORDER BY v.published_at DESC LIMIT $1`, [bounded]),
  )
}

/** Content carrying a given taxonomy term. */
export function listByTerm(termSlug: string, limit = 20): Promise<ContentSummary[]> {
  const bounded = Math.min(Math.max(limit, 1), 50)
  return asAnon((s) =>
    s.query<ContentSummary>(
      `${SUMMARY_SELECT}
         AND EXISTS (
           SELECT 1 FROM taxonomy.content_terms ct
             JOIN taxonomy.terms t ON t.id = ct.term_id
            WHERE ct.content_item_id = i.id AND t.slug = $1
         )
       ORDER BY v.published_at DESC
       LIMIT $2`,
      [termSlug, bounded],
    ),
  )
}

/**
 * A single item at its canonical slug, resolving to the current published version.
 * Returns null when the item does not exist OR when the caller may not read it —
 * the two are indistinguishable by design (rules/backend.md 18).
 */
export function getBySlug(slug: string, ctx?: RequestContext): Promise<ContentDetail | null> {
  const sql = `
    SELECT i.public_id,
           i.canonical_slug,
           i.content_type_key,
           i.id                     AS item_id,
           i.lifecycle_state,
           i.withdrawal_reason,
           v.id                     AS version_id,
           v.title,
           v.standfirst,
           v.executive_summary,
           v.methodology,
           v.limitations,
           v.published_at,
           v.revised_at,
           v.correction_reason,
           v.public_version_id      AS version_public_id,
           GREATEST(1, CEIL(COALESCE(length(v.plain_text), 0) / 1100.0))::int AS reading_minutes
      FROM cms.content_items i
      JOIN cms.content_versions v ON v.id = i.current_version_id
     WHERE i.canonical_slug = $1
     LIMIT 1`

  return ctx
    ? asUser(ctx, (s) => s.one<ContentDetail>(sql, [slug]))
    : asAnon((s) => s.one<ContentDetail>(sql, [slug]))
}

/** The ordered structured body of a version, with stable fragment identifiers. */
export function getModules(versionId: string, ctx?: RequestContext): Promise<ContentModule[]> {
  const sql = `
    SELECT fragment_id, module_key, position, payload
      FROM cms.content_version_modules
     WHERE version_id = $1
     ORDER BY position ASC`
  return ctx ? asUser(ctx, (s) => s.query<ContentModule>(sql, [versionId])) : asAnon((s) => s.query<ContentModule>(sql, [versionId]))
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

/** Full revision history for an item — part of the citation record (Block 17). */
export function getVersionHistory(itemId: string): Promise<
  Array<{ public_version_id: string; version_number: number; status: string; published_at: string | null; correction_reason: string | null }>
> {
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

export function resolveRedirect(path: string): Promise<{ target_path: string; status_code: number } | null> {
  return asAnon((s) =>
    s.one(`SELECT target_path, status_code FROM cms.redirects WHERE source_path = $1`, [path]),
  )
}
