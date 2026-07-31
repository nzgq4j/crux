import { describe, it, expect, afterAll } from 'vitest'
import {
  listContent,
  listRelated,
  listExperts,
  searchContent,
} from '@/lib/content/pg-backend'
import { closeTestPool } from '../helpers/db'

/**
 * Placeholder numbering in the paginated read paths.
 *
 * `LIMIT` and `OFFSET` are bound rather than interpolated (ADR 0003). The index of
 * each placeholder depends on how many filter parameters were pushed before it, so an
 * off-by-one is invisible to the type checker and to the conformance check — it
 * surfaces only when PostgreSQL parses the statement.
 *
 * These assertions are deliberately about execution rather than content: the point is
 * that the statement is valid and the parameter count agrees, which must hold whether
 * or not the database carries seed data.
 */

afterAll(async () => {
  await closeTestPool()
})

describe('paginated queries bind their pagination', () => {
  it('lists content with no filters — LIMIT $1 OFFSET $2', async () => {
    const result = await listContent({ page: 1, pageSize: 5 })
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.pageSize).toBe(5)
    expect(result.page).toBe(1)
  })

  it('lists content with one filter — placeholders shift by one', async () => {
    const result = await listContent({ page: 1, pageSize: 5, termSlug: 'no-such-term' })
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.items).toHaveLength(0)
  })

  it('lists content with two filters — placeholders shift by two', async () => {
    const result = await listContent({
      page: 1,
      pageSize: 5,
      termSlug: 'no-such-term',
      authorSlug: 'no-such-author',
    })
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('lists content on a later page — a non-zero offset still binds', async () => {
    const result = await listContent({ page: 3, pageSize: 5 })
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.page).toBe(3)
  })

  it('lists related content — LIMIT $2 after the item id', async () => {
    const rows = await listRelated('00000000-0000-0000-0000-000000000000', 4)
    expect(Array.isArray(rows)).toBe(true)
  })

  it('lists experts — LIMIT $1 from an imported constant', async () => {
    const rows = await listExperts()
    expect(Array.isArray(rows)).toBe(true)
  })

  it('searches — LIMIT $2 OFFSET $3 after the query term', async () => {
    const result = await searchContent('research', 1, 5)
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.pageSize).toBe(5)
  })

  it('searches on a later page', async () => {
    const result = await searchContent('research', 2, 5)
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.page).toBe(2)
  })
})
