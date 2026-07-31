/** Shared content types, used by both the direct-SQL and PostgREST backends. */

export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 12

export function bound(n: number | undefined, fallback: number, max: number): number {
  if (n === undefined || !Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), 1), max)
}

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
  /** Part of the document's name, distinct from standfirst (Batch A, S1). */
  subtitle: string | null
  /**
   * The date the document itself states, with the precision it stated it at
   * (Batch A, S3). Distinct from published_at, which is when the platform published.
   * Render only to `stated_date_precision`, or a day the document never gave is
   * fabricated.
   */
  stated_date: string | null
  stated_date_precision: 'day' | 'month' | 'year' | null
  /** Author-applied marking, rendered verbatim. Never an access-control input. */
  distribution_marking: string | null
  distribution_marking_repeats: boolean | null
  executive_summary: string | null
  methodology: string | null
  limitations: string | null
  revised_at: string | null
  lifecycle_state: string
  withdrawal_reason: string | null
  withdrawn_at: string | null
  correction_reason: string | null
  correction_scope: string | null
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

export interface Term {
  slug: string
  name: string
  description: string | null
  vocabulary: string
  content_count: number
}

export interface Expert {
  slug: string
  display_name: string
  job_title: string | null
  biography: string | null
  disclosures: string | null
  organisation: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface SearchHit extends ContentSummary {
  rank: number
}

export interface ListFilters {
  contentTypes?: string[]
  termSlug?: string
  authorSlug?: string
  page?: number
  pageSize?: number
  sort?: 'newest' | 'oldest'
}

export interface VersionHistoryEntry {
  public_version_id: string
  version_number: number
  status: string
  published_at: string | null
  correction_reason: string | null
}
