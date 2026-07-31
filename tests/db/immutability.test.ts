import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { asSuperuser, seedFixture, expectDenied, closeTestPool, type Fixture } from '../helpers/db'

/**
 * Block 05 / §45.1.3 — published versions are immutable.
 *
 * Asserted against the superuser connection deliberately: if the invariant only held
 * for unprivileged roles it would be an access control, not an invariant. These run
 * as the cluster owner and must still fail.
 */

let f: Fixture

beforeAll(async () => {
  f = await seedFixture()
})
afterAll(async () => {
  await closeTestPool()
})

async function inRollback<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  return asSuperuser(async (c) => {
    await c.query('BEGIN')
    try {
      return await fn(c)
    } finally {
      await c.query('ROLLBACK').catch(() => undefined)
    }
  })
}

describe('published version immutability', () => {
  it('the title of a published version cannot be changed', async () => {
    await expectDenied(
      () => inRollback((c) => c.query('UPDATE cms.content_versions SET title=$1 WHERE id=$2', ['Tampered', f.publishedVersionId])),
      'changing a published title',
    )
  })

  it('the publication timestamp cannot be changed', async () => {
    await expectDenied(
      () => inRollback((c) => c.query('UPDATE cms.content_versions SET published_at=now() WHERE id=$1', [f.publishedVersionId])),
      'changing a published timestamp',
    )
  })

  it('a published version cannot be deleted', async () => {
    await expectDenied(
      () => inRollback((c) => c.query('DELETE FROM cms.content_versions WHERE id=$1', [f.publishedVersionId])),
      'deleting a published version',
    )
  })

  it('a published version cannot revert to draft', async () => {
    await expectDenied(
      () => inRollback((c) => c.query("UPDATE cms.content_versions SET status='draft' WHERE id=$1", [f.publishedVersionId])),
      'reverting a published version to draft',
    )
  })

  it('modules of a published version cannot be edited', async () => {
    await expectDenied(
      () =>
        inRollback((c) =>
          c.query(`UPDATE cms.content_version_modules SET payload='{"text":"rewritten"}'::jsonb WHERE version_id=$1`, [
            f.publishedVersionId,
          ]),
        ),
      'editing a published module',
    )
  })

  it('modules cannot be added to a published version', async () => {
    await expectDenied(
      () =>
        inRollback((c) =>
          c.query(
            `INSERT INTO cms.content_version_modules(version_id, module_key, position, fragment_id, payload)
             VALUES ($1,'prose',99,'sec-injected','{"text":"injected"}'::jsonb)`,
            [f.publishedVersionId],
          ),
        ),
      'inserting a module into a published version',
    )
  })

  it('modules of a published version cannot be deleted', async () => {
    await expectDenied(
      () => inRollback((c) => c.query('DELETE FROM cms.content_version_modules WHERE version_id=$1', [f.publishedVersionId])),
      'deleting a published module',
    )
  })

  it('contributors cannot be added to a published version', async () => {
    await expectDenied(
      () =>
        inRollback((c) =>
          c.query(
            `INSERT INTO cms.content_contributors(version_id, person_id, role) VALUES ($1,$2,'author')`,
            [f.publishedVersionId, f.personId],
          ),
        ),
      'adding a contributor to a published version',
    )
  })

  it('supersession IS permitted — the invariant freezes content, not lifecycle', async () => {
    const status = await inRollback(async (c) => {
      await c.query("UPDATE cms.content_versions SET status='superseded' WHERE id=$1", [f.publishedVersionId])
      const { rows } = await c.query<{ status: string }>('SELECT status FROM cms.content_versions WHERE id=$1', [
        f.publishedVersionId,
      ])
      return rows[0]!.status
    })
    expect(status).toBe('superseded')
  })

  it('a draft version remains freely editable', async () => {
    const title = await inRollback(async (c) => {
      await c.query('UPDATE cms.content_versions SET title=$1 WHERE id=$2', ['Revised draft', f.draftVersionId])
      const { rows } = await c.query<{ title: string }>('SELECT title FROM cms.content_versions WHERE id=$1', [
        f.draftVersionId,
      ])
      return rows[0]!.title
    })
    expect(title).toBe('Revised draft')
  })
})

describe('structural guarantees', () => {
  it('RLS is enabled on every table in every exposed schema', async () => {
    // The enumeration meta-test (Block 22): fails when a future migration adds a
    // table without RLS, rather than waiting for a leak to be noticed.
    const rows = await asSuperuser(async (c) =>
      (
        await c.query<{ t: string }>(`
          SELECT n.nspname || '.' || c.relname AS t
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind = 'r'
             AND n.nspname IN ('cms','taxonomy','identity','accounts','workflow',
                               'knowledge','audit','assets','subscriptions','search','analytics')
             AND NOT c.relrowsecurity
           ORDER BY 1`)
      ).rows,
    )
    expect(rows.map((r) => r.t)).toEqual([])
  })

  it('every table in an exposed schema has at least one policy', async () => {
    const rows = await asSuperuser(async (c) =>
      (
        await c.query<{ t: string }>(`
          SELECT n.nspname || '.' || c.relname AS t
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind = 'r'
             AND n.nspname IN ('cms','taxonomy','identity','accounts','workflow',
                               'knowledge','audit','assets','subscriptions','search','analytics')
             AND NOT EXISTS (
               SELECT 1 FROM pg_policies p
                WHERE p.schemaname = n.nspname AND p.tablename = c.relname)
           ORDER BY 1`)
      ).rows,
    )
    expect(rows.map((r) => r.t)).toEqual([])
  })

  it('every workflow transition is performable by some role', async () => {
    // Guards the drift that produced migration 20260731001400: a transition whose
    // required permission exists but is granted to nobody is a silent deadlock.
    const rows = await asSuperuser(async (c) =>
      (await c.query<{ transition: string; problem: string }>('SELECT * FROM private.assert_transitions_reachable()')).rows,
    )
    expect(rows).toEqual([])
  })

  it('no two content permissions are near-duplicates of each other', async () => {
    // e.g. content.edit alongside content.edit_any, or submit_review alongside
    // submit_for_review — a reader cannot tell which one a policy checks.
    const keys = await asSuperuser(async (c) =>
      (await c.query<{ key: string }>("SELECT key FROM identity.permissions WHERE resource='content' ORDER BY key")).rows.map(
        (r) => r.key,
      ),
    )
    const collisions = keys.filter((a) => keys.some((b) => b !== a && (b.startsWith(a + '_') || b.startsWith(a))))
    expect(collisions).toEqual([])
  })

  it('every SECURITY DEFINER function pins its search_path', async () => {
    const rows = await asSuperuser(async (c) =>
      (
        await c.query<{ f: string }>(`
          SELECT n.nspname || '.' || p.proname AS f
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE p.prosecdef
             AND n.nspname IN ('private','public','auth')
             AND NOT EXISTS (
               SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
                WHERE cfg LIKE 'search_path=%')
           ORDER BY 1`)
      ).rows,
    )
    expect(rows.map((r) => r.f)).toEqual([])
  })
})
