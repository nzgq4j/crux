import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, ANON, seedFixture, expectNoRows, closeTestPool, type Fixture } from '../helpers/db'

/**
 * Block 07 requirement 5 — draft isolation.
 *
 * The load-bearing rule of the whole platform: there must be NO policy path by which
 * an anonymous visitor or a merely registered user reads a draft. These are denial
 * tests; every one of them must fail closed.
 */

let f: Fixture

beforeAll(async () => {
  f = await seedFixture()
})
afterAll(async () => {
  await closeTestPool()
})

describe('draft isolation', () => {
  it('anon cannot read a draft version', async () => {
    await expectNoRows(
      ANON,
      'SELECT id, title FROM cms.content_versions WHERE id = $1',
      [f.draftVersionId],
      'anon reading a draft version',
    )
  })

  it('a registered user with no editorial permission cannot read a draft version', async () => {
    await expectNoRows(
      { role: 'authenticated', userId: f.users.registered_user },
      'SELECT id, title FROM cms.content_versions WHERE id = $1',
      [f.draftVersionId],
      'registered_user reading a draft version',
    )
  })

  it('anon cannot read draft module payloads', async () => {
    await expectNoRows(
      ANON,
      'SELECT payload FROM cms.content_version_modules WHERE version_id = $1',
      [f.draftVersionId],
      'anon reading draft module bodies',
    )
  })

  it('a registered user cannot read draft module payloads', async () => {
    await expectNoRows(
      { role: 'authenticated', userId: f.users.registered_user },
      'SELECT payload FROM cms.content_version_modules WHERE version_id = $1',
      [f.draftVersionId],
      'registered_user reading draft module bodies',
    )
  })

  it('anon cannot read a draft content item', async () => {
    await expectNoRows(
      ANON,
      "SELECT id FROM cms.content_items WHERE id = $1 AND lifecycle_state = 'draft'",
      [f.draftItemId],
      'anon reading a draft content item',
    )
  })

  it('draft titles do not leak through an unfiltered listing', async () => {
    // Counts and listings must reflect only what the caller may read — a draft must
    // not be inferable from a total, not merely absent from a page.
    const rows = await as(ANON, async (c) =>
      (await c.query<{ title: string }>('SELECT title FROM cms.content_versions')).rows,
    )
    const titles = rows.map((r) => r.title)
    expect(titles).not.toContain('Unannounced Acquisition Analysis')
  })

  it('draft body text does not leak through a full-table scan', async () => {
    const rows = await as(ANON, async (c) =>
      (await c.query<{ payload: Record<string, unknown> }>('SELECT payload FROM cms.content_version_modules')).rows,
    )
    const blob = JSON.stringify(rows)
    expect(blob).not.toContain('CONFIDENTIAL DRAFT CONTENT')
  })

  it('an editor CAN read the draft — the policy grants, not merely denies', async () => {
    const rows = await as({ role: 'authenticated', userId: f.users.editor }, async (c) =>
      (await c.query('SELECT id FROM cms.content_versions WHERE id = $1', [f.draftVersionId])).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('published content IS readable by anon', async () => {
    const rows = await as(ANON, async (c) =>
      (await c.query('SELECT id FROM cms.content_versions WHERE id = $1', [f.publishedVersionId])).rows,
    )
    expect(rows).toHaveLength(1)
  })
})
