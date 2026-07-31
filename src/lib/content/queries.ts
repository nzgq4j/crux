import 'server-only'
import * as rest from './rest-backend'
import * as pg from './pg-backend'
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

export type {
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
}
export { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './types'

/**
 * Backend selection (docs/assumptions.md A-002).
 *
 * Two transports, one security model. The direct-SQL backend opens a PostgreSQL
 * connection and sets the role and JWT claims per transaction; the PostgREST backend
 * authenticates as `anon` with the publishable key. Both are governed by the same RLS
 * policies, so which one runs changes performance characteristics, not who can read
 * what.
 *
 * PostgREST wins when configured, because a deployment holding only the publishable
 * key cannot open a direct connection.
 */
const useRest = rest.restConfigured()

export function activeBackend(): 'postgrest' | 'postgres' {
  return useRest ? 'postgrest' : 'postgres'
}

export function listContent(filters: ListFilters = {}): Promise<Page<ContentSummary>> {
  return useRest ? rest.listContent(filters) : pg.listContent(filters)
}

export function listRecent(limit = 12, contentType?: string): Promise<ContentSummary[]> {
  return useRest ? rest.listRecent(limit, contentType) : pg.listRecent(limit, contentType)
}

export function listRelated(itemId: string, limit = 4): Promise<ContentSummary[]> {
  return useRest ? rest.listRelated(itemId, limit) : pg.listRelated(itemId, limit)
}

export function getBySlug(slug: string): Promise<ContentDetail | null> {
  return useRest ? rest.getBySlug(slug) : pg.getBySlug(slug)
}

export function getModules(versionId: string): Promise<ContentModule[]> {
  return useRest ? rest.getModules(versionId) : pg.getModules(versionId)
}

export function getContributors(versionId: string): Promise<Contributor[]> {
  return useRest ? rest.getContributors(versionId) : pg.getContributors(versionId)
}

export function getItemTerms(itemId: string): Promise<Term[]> {
  return useRest ? rest.getItemTerms(itemId) : pg.getItemTerms(itemId)
}

export function getVersionHistory(itemId: string): Promise<VersionHistoryEntry[]> {
  return useRest ? rest.getVersionHistory() : pg.getVersionHistory(itemId)
}

export function listTerms(vocabulary: string): Promise<Term[]> {
  return useRest ? rest.listTerms(vocabulary) : pg.listTerms(vocabulary)
}

export function getTerm(slug: string): Promise<Term | null> {
  return useRest ? rest.getTerm(slug) : pg.getTerm(slug)
}

export function listExperts(): Promise<Expert[]> {
  return useRest ? rest.listExperts() : pg.listExperts()
}

export function getExpert(slug: string): Promise<Expert | null> {
  return useRest ? rest.getExpert(slug) : pg.getExpert(slug)
}

export function searchContent(query: string, page = 1, pageSize = 12): Promise<Page<SearchHit>> {
  return useRest ? rest.searchContent(query, page, pageSize) : pg.searchContent(query, page, pageSize)
}
