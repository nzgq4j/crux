import { Pool, type PoolClient } from 'pg'

/**
 * Test harness for RLS.
 *
 * `as()` reproduces exactly what Supabase's PostgREST layer does per request: it sets
 * the PostgreSQL role and the `request.jwt.claims` GUC inside a transaction. The
 * policies exercised here are therefore the same policies that run in production.
 *
 * Every helper rolls back, so tests never leave residue for the next file.
 */

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/crux'

let pool: Pool | null = null

export function testPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 8 })
  return pool
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export type Role = 'anon' | 'authenticated' | 'service_role'

export interface Actor {
  role: Role
  userId?: string | null
}

export const ANON: Actor = { role: 'anon', userId: null }

/**
 * Run `fn` as the given actor inside a transaction that is always rolled back.
 */
export async function as<T>(actor: Actor, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await testPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1,$2,true)', ['role', actor.role])
    await client.query('SELECT set_config($1,$2,true)', [
      'request.jwt.claims',
      actor.userId ? JSON.stringify({ sub: actor.userId, role: actor.role }) : '',
    ])
    return await fn(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

/** Run as the cluster superuser, outside RLS. For fixture setup only. */
export async function asSuperuser<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await testPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

/**
 * Assert that an operation is refused. Returns the error so a test can assert on
 * its shape. Fails loudly if the operation unexpectedly succeeded — a denial test
 * that silently passes because nothing ran is worse than no test.
 */
export async function expectDenied(
  fn: () => Promise<unknown>,
  what: string,
): Promise<Error> {
  try {
    await fn()
  } catch (error) {
    return error as Error
  }
  throw new Error(`SECURITY: expected "${what}" to be denied, but it succeeded.`)
}

/**
 * Assert a SELECT returns no rows for this actor. Distinct from expectDenied:
 * RLS filters rows rather than raising, so absence is the denial signal.
 */
export async function expectNoRows(
  actor: Actor,
  sql: string,
  params: unknown[],
  what: string,
): Promise<void> {
  let rows: unknown[]
  try {
    rows = await as(actor, async (c) => (await c.query(sql, params)).rows)
  } catch (error) {
    // A grant-level refusal ("permission denied for table x") is a STRONGER denial
    // than an empty result set, so it satisfies the assertion. Any other error is a
    // real failure and is re-thrown.
    const message = (error as Error).message
    if (/permission denied|insufficient privilege|policy/i.test(message)) return
    throw error
  }
  if (rows.length !== 0) {
    throw new Error(
      `SECURITY: expected "${what}" to return no rows for role ${actor.role}, got ${rows.length}.`,
    )
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface Fixture {
  users: Record<string, string>
  publishedVersionId: string
  publishedItemId: string
  draftVersionId: string
  draftItemId: string
  personId: string
}

const FIXTURE_ROLES = [
  'registered_user',
  'author',
  'reviewer',
  'editor',
  'publisher',
  'user_administrator',
  'platform_administrator',
  'research_member',
] as const

/**
 * Build a deterministic fixture: one user per role of interest, one published item
 * and one draft item. Idempotent — safe to call from every test file.
 */
export async function seedFixture(): Promise<Fixture> {
  return asSuperuser(async (c) => {
    const users: Record<string, string> = {}

    for (const role of FIXTURE_ROLES) {
      const email = `${role}@fixture.crux.test`
      const existing = await c.query<{ id: string }>('SELECT id FROM auth.users WHERE email=$1', [email])
      let id = existing.rows[0]?.id
      if (!id) {
        const created = await c.query<{ id: string }>(
          'INSERT INTO auth.users(email, email_confirmed_at) VALUES ($1, now()) RETURNING id',
          [email],
        )
        id = created.rows[0]!.id
      }
      users[role] = id
      await c.query(
        'INSERT INTO identity.user_roles(user_id, role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, role],
      )
    }

    await c.query(
      `INSERT INTO cms.content_types(key,name,minimum_evidence_standard,requires_methodology)
       VALUES ('report','Research Report','mandatory',true),
              ('article','Article','optional',false)
       ON CONFLICT (key) DO NOTHING`,
    )
    await c.query(
      `INSERT INTO cms.content_modules(key,name,json_schema)
       VALUES ('heading','Heading','{"type":"object"}'::jsonb),
              ('prose','Prose','{"type":"object"}'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    )

    const person = await c.query<{ id: string }>(
      `INSERT INTO identity.people(slug, display_name) VALUES ('fixture-author','Fixture Author')
       ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    )
    const personId = person.rows[0]!.id

    // Published item
    const pubItem = await c.query<{ id: string }>(
      `INSERT INTO cms.content_items(content_type_key, canonical_slug, lifecycle_state)
       VALUES ('report','fixture-published-report','published')
       ON CONFLICT (locale, canonical_slug) DO UPDATE SET lifecycle_state='published'
       RETURNING id`,
    )
    const publishedItemId = pubItem.rows[0]!.id

    let pubVer = await c.query<{ id: string }>(
      `SELECT id FROM cms.content_versions WHERE content_item_id=$1 AND version_number=1`,
      [publishedItemId],
    )
    if (pubVer.rows.length === 0) {
      pubVer = await c.query<{ id: string }>(
        `INSERT INTO cms.content_versions(content_item_id, version_number, title, standfirst, status, published_at)
         VALUES ($1, 1, 'Fixture Published Report', 'A published fixture.', 'draft', now())
         RETURNING id`,
        [publishedItemId],
      )
      const vid = pubVer.rows[0]!.id
      await c.query(
        `INSERT INTO cms.content_version_modules(version_id, module_key, position, fragment_id, payload)
         VALUES ($1,'prose',0,'sec-1','{"text":"Published fixture body."}'::jsonb)`,
        [vid],
      )
      await c.query(`UPDATE cms.content_versions SET status='published' WHERE id=$1`, [vid])
    }
    const publishedVersionId = pubVer.rows[0]!.id
    await c.query(`UPDATE cms.content_items SET current_version_id=$1 WHERE id=$2`, [
      publishedVersionId,
      publishedItemId,
    ])

    // Draft item — must never be readable by anon or a plain registered user.
    const draftItem = await c.query<{ id: string }>(
      `INSERT INTO cms.content_items(content_type_key, canonical_slug, lifecycle_state)
       VALUES ('report','fixture-secret-draft','draft')
       ON CONFLICT (locale, canonical_slug) DO UPDATE SET lifecycle_state='draft'
       RETURNING id`,
    )
    const draftItemId = draftItem.rows[0]!.id

    let draftVer = await c.query<{ id: string }>(
      `SELECT id FROM cms.content_versions WHERE content_item_id=$1 AND version_number=1`,
      [draftItemId],
    )
    if (draftVer.rows.length === 0) {
      draftVer = await c.query<{ id: string }>(
        `INSERT INTO cms.content_versions(content_item_id, version_number, title, status)
         VALUES ($1, 1, 'Unannounced Acquisition Analysis', 'draft')
         RETURNING id`,
        [draftItemId],
      )
      await c.query(
        `INSERT INTO cms.content_version_modules(version_id, module_key, position, fragment_id, payload)
         VALUES ($1,'prose',0,'sec-1','{"text":"CONFIDENTIAL DRAFT CONTENT"}'::jsonb)`,
        [draftVer.rows[0]!.id],
      )
    }
    const draftVersionId = draftVer.rows[0]!.id

    return { users, publishedVersionId, publishedItemId, draftVersionId, draftItemId, personId }
  })
}
