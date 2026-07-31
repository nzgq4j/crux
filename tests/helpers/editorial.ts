import type { PoolClient } from 'pg'
import { testPool } from './db'

/**
 * A multi-actor editorial scenario on one connection.
 *
 * `as()` in ./db opens a transaction per actor and rolls it back, which is exactly
 * right for a single-actor denial test and useless for a workflow: the author's
 * submission would be gone before the reviewer looked at it.
 *
 * `scenario()` runs the whole flow inside one transaction, switching the acting
 * identity between steps the way PostgREST does per request, and rolls the lot back at
 * the end. Nothing is committed, so files stay independent.
 */

export interface Actors {
  author: string
  reviewer: string
  editor: string
  publisher: string
  outsider: string
}

export interface Scenario {
  client: PoolClient
  actors: Actors
  /** Switch the acting identity. Mirrors what the request layer sets per request. */
  act: (userId: string | null, role?: 'anon' | 'authenticated') => Promise<void>
  /** Run as the connection's own superuser identity, for out-of-band setup. */
  asOwner: () => Promise<void>
  /** Create an article in draft with one prose module, and assign everyone. */
  createDraft: (slug?: string, contentType?: string) => Promise<{ itemId: string; versionId: string }>
}

const FIXTURE_USERS: Array<[keyof Actors, string, string | null]> = [
  ['author', 'ed-author@fixture.crux.test', 'author'],
  ['reviewer', 'ed-reviewer@fixture.crux.test', 'reviewer'],
  ['editor', 'ed-editor@fixture.crux.test', 'managing_editor'],
  ['publisher', 'ed-publisher@fixture.crux.test', 'publisher'],
  // Holds no content role at all: the unauthorised actor in every denial test.
  ['outsider', 'ed-outsider@fixture.crux.test', null],
]

export async function scenario<T>(fn: (s: Scenario) => Promise<T>): Promise<T> {
  const client = await testPool().connect()
  try {
    await client.query('BEGIN')

    const actors = {} as Actors
    for (const [key, email, roleKey] of FIXTURE_USERS) {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM auth.users WHERE email = $1',
        [email],
      )
      let id = existing.rows[0]?.id
      if (!id) {
        const created = await client.query<{ id: string }>(
          'INSERT INTO auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id',
          [email],
        )
        id = created.rows[0]!.id
      }
      actors[key] = id
      if (roleKey) {
        await client.query(
          'INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [id, roleKey],
        )
      }
    }

    const act = async (userId: string | null, role: 'anon' | 'authenticated' = 'authenticated') => {
      await client.query('RESET ROLE')
      await client.query('SELECT set_config($1,$2,true)', [
        'request.jwt.claims',
        userId ? JSON.stringify({ sub: userId, role }) : '',
      ])
      await client.query(`SET LOCAL ROLE ${role}`)
    }

    // Clears the acting identity as well as the role. Leaving request.jwt.claims set
    // makes the connection look like the previous actor to any SECURITY DEFINER
    // trigger that reads auth.uid() — guard_role_assignment refuses a role write on
    // exactly that basis — so setup done "as owner" would fail for the wrong reason.
    const asOwner = async () => {
      await client.query('RESET ROLE')
      await client.query(`SELECT set_config('request.jwt.claims','',true)`)
    }

    let slugCounter = 0
    const createDraft = async (slug?: string, contentType = 'article') => {
      slugCounter += 1
      const canonical = slug ?? `editorial-fixture-${slugCounter}`
      await client.query('RESET ROLE')
      const item = await client.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ($1,$2,$3) RETURNING id`,
        [contentType, canonical, actors.author],
      )
      const itemId = item.rows[0]!.id
      const version = await client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,$2,$3) RETURNING id`,
        [itemId, `Fixture ${canonical}`, actors.author],
      )
      const versionId = version.rows[0]!.id
      await client.query(
        `INSERT INTO cms.content_version_modules (version_id, fragment_id, module_key, position, payload)
         VALUES ($1,'intro','prose',1,$2::jsonb)`,
        [versionId, JSON.stringify({ text: 'The body of the fixture article.' })],
      )
      await client.query(
        `INSERT INTO workflow.content_state (version_id, state_key) VALUES ($1,'draft')`,
        [versionId],
      )
      // Everyone who acts on the version must be assigned to it: the content_state
      // write authority is "assigned, or holds content.edit_any".
      for (const [user, role] of [
        [actors.author, 'author'],
        [actors.reviewer, 'reviewer'],
        [actors.editor, 'editor'],
        [actors.publisher, 'editor'],
      ] as const) {
        await client.query(
          `INSERT INTO workflow.assignments (version_id, user_id, assignment_role) VALUES ($1,$2,$3)`,
          [versionId, user, role],
        )
      }
      return { itemId, versionId }
    }

    return await fn({ client, actors, act, asOwner, createDraft })
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.query('RESET ROLE').catch(() => undefined)
    client.release()
  }
}

/** Record an approval out of band. Approval recording is not yet an authorized action. */
export async function recordApproval(
  s: Scenario,
  versionId: string,
  approverId: string,
  round = 1,
): Promise<void> {
  await s.asOwner()
  await s.client.query(
    `INSERT INTO workflow.approvals (version_id, review_round, approver_id, approval_scope)
     VALUES ($1,$2,$3,'final')`,
    [versionId, round, approverId],
  )
}
