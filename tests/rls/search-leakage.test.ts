import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, asSuperuser, seedFixture, expectDenied, closeTestPool, type Fixture } from '../helpers/db'

/**
 * Block 15 / §45.1.8 — search never returns unauthorized content.
 *
 * Two independent layers protect this, and both are tested:
 *
 *   1. Ingestion  — the database refuses to index a version that is not published,
 *                   so a draft never enters the index in the first place.
 *   2. Retrieval  — search rows inherit their source version's visibility through
 *                   RLS, so a document that becomes non-public (withdrawal) stops
 *                   being retrievable even though the row still exists.
 *
 * Layer 2 is asserted on COUNTS rather than on a page of results: a post-filter
 * applied after the query would pass a page test while still leaking the total.
 */

let f: Fixture

beforeAll(async () => {
  f = await seedFixture()
})

afterAll(async () => {
  await closeTestPool()
})

describe('layer 1: drafts never enter the index', () => {
  it('indexing a draft version is refused by the database', async () => {
    const err = await expectDenied(
      () =>
        asSuperuser(async (c) => {
          await c.query('BEGIN')
          try {
            return await c.query(
              `INSERT INTO search.documents (version_id, content_item_id, content_type_key, title, body_text)
               SELECT v.id, v.content_item_id, 'report', v.title, 'CONFIDENTIAL DRAFT CONTENT'
                 FROM cms.content_versions v WHERE v.id = $1`,
              [f.draftVersionId],
            )
          } finally {
            await c.query('ROLLBACK').catch(() => undefined)
          }
        }),
      'indexing a draft version',
    )
    expect(err.message).toMatch(/published/i)
  })

  it('no draft content is present in the index at all', async () => {
    const rows = await asSuperuser(async (c) =>
      (
        await c.query<{ n: string }>(
          `SELECT count(*)::text AS n
             FROM search.documents d
             JOIN cms.content_versions v ON v.id = d.version_id
            WHERE v.status <> 'published'`,
        )
      ).rows,
    )
    expect(Number(rows[0]!.n)).toBe(0)
  })
})

describe('layer 2: retrieval inherits source visibility', () => {
  it('withdrawing an item removes its document from anonymous retrieval, including the count', async () => {
    await asSuperuser(async (c) => {
      await c.query('BEGIN')
      try {
        // Index the published fixture.
        await c.query(
          `INSERT INTO search.documents (version_id, content_item_id, content_type_key, title, body_text, published_at)
           SELECT v.id, v.content_item_id, 'report', v.title, 'indexed body', v.published_at
             FROM cms.content_versions v WHERE v.id = $1
           ON CONFLICT DO NOTHING`,
          [f.publishedVersionId],
        )

        const countFor = async (role: 'anon' | 'service_role') => {
          await c.query(`SET LOCAL ROLE ${role}`)
          await c.query('SELECT set_config($1,$2,true)', ['request.jwt.claims', ''])
          const r = await c.query<{ n: string }>(
            'SELECT count(*)::text AS n FROM search.documents WHERE version_id = $1',
            [f.publishedVersionId],
          )
          // RESET returns to the session user; SET ROLE postgres would be refused
          // from a non-member role.
          await c.query('RESET ROLE')
          return Number(r.rows[0]!.n)
        }

        // Visible while published.
        expect(await countFor('anon')).toBe(1)

        // Withdraw the item; the row still exists but must stop being retrievable.
        await c.query(
          `UPDATE cms.content_items
              SET lifecycle_state='withdrawn', withdrawn_at=now(), withdrawal_reason='test'
            WHERE id=$1`,
          [f.publishedItemId],
        )

        expect(await countFor('anon')).toBe(0)
        expect(await countFor('service_role')).toBe(1) // the row is still there
      } finally {
        await c.query('ROLLBACK').catch(() => undefined)
      }
    })
  })

  it('ranking controls are not readable by an ordinary user', async () => {
    const rows = await as({ role: 'authenticated', userId: f.users.registered_user }, async (c) => {
      try {
        return (await c.query('SELECT id FROM search.boosts')).rows
      } catch {
        return []
      }
    })
    expect(rows).toHaveLength(0)
  })

  it('suppression is layered on top of visibility, never instead of it', async () => {
    // Asserted structurally: the policy predicate must reference can_read_version,
    // so a suppression can only ever narrow what a visibility check already allowed.
    const { rows } = await asSuperuser(async (c) =>
      c.query<{ qual: string }>(
        `SELECT qual FROM pg_policies WHERE schemaname='search' AND tablename='documents' AND policyname='documents_read'`,
      ),
    )
    expect(rows[0]!.qual).toMatch(/can_read_version/)
  })
})
