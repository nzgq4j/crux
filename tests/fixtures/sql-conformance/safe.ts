/**
 * Fixtures that MUST NOT be reported by the SQL interpolation check.
 *
 * Each mirrors a construction the reviewed backend actually uses. If the checker
 * starts reporting one of these it has become the always-red control it replaced,
 * and tests/conformance/sql-interpolation.test.ts fails.
 *
 * Every user-supplied value here reaches the database as a bind parameter. The only
 * things interpolated are statement structure and placeholder indices.
 */

import { SHARED_ORDER_CLAUSE } from './constants'

/** Immutable column list. No interpolation of its own. */
const SUMMARY_COLUMNS = `i.public_id, i.canonical_slug, v.title, v.published_at`

/** Immutable FROM/JOIN/WHERE spine. */
const PUBLISHED_FROM = `
  FROM cms.content_items i
  JOIN cms.content_versions v ON v.id = i.current_version_id
 WHERE i.lifecycle_state = 'published'`

/** A constant built from another constant. Safety is transitive. */
const COUNT_QUERY = `SELECT count(*)::text AS total ${PUBLISHED_FROM}`

export function total(): string {
  return COUNT_QUERY
}

/** Structure only: two module constants. */
export function listAll(): string {
  return `SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM}`
}

/** Sort direction from an explicit two-value allowlist. It can be nothing else. */
export function sorted(sort: 'newest' | 'oldest'): string {
  const order = sort === 'oldest' ? 'ASC' : 'DESC'
  return `SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM} ORDER BY v.published_at ${order}`
}

/**
 * A WHERE clause assembled from fixed fragments. The caller's values go into the
 * params array; the fragments carry only placeholder indices.
 */
export function filtered(termSlug?: string, authorSlug?: string): [string, unknown[]] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (termSlug) {
    params.push(termSlug)
    conditions.push(`t.slug = $${params.length}`)
  }
  if (authorSlug) {
    params.push(authorSlug)
    conditions.push(`p.slug = $${params.length}`)
  }

  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : ''
  return [`SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM}${where}`, params]
}

/** A SQL constant imported from another module in the reviewed tree. */
export function withSharedOrder(): string {
  return `SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM} ${SHARED_ORDER_CLAUSE}`
}

/** Pagination bound as parameters rather than interpolated. */
export function paginated(pageSize: number, offset: number): [string, unknown[]] {
  const params: unknown[] = [pageSize, offset]
  return [
    `SELECT ${SUMMARY_COLUMNS} ${PUBLISHED_FROM}
       ORDER BY v.published_at DESC
       LIMIT $1 OFFSET $2`,
    params,
  ]
}

/**
 * A PostgREST query string, not SQL. The identifier contains the letters SELECT but
 * not at a word boundary, and the query key is lowercase — neither is a statement.
 */
const SUMMARY_SELECT = 'public_id,canonical_slug,title,published_at'

export function restPath(slug: string): string {
  return `published_content?select=${SUMMARY_SELECT}&canonical_slug=eq.${encodeURIComponent(slug)}`
}
