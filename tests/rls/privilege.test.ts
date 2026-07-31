import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { as, ANON, seedFixture, expectDenied, expectNoRows, closeTestPool, type Fixture } from '../helpers/db'

/**
 * Blocks 06, 07, 27 — privilege boundaries.
 *
 * Self-elevation must be structurally impossible, audit rows immutable, and external
 * identities unwritable through the API. Each is asserted as a denial.
 */

let f: Fixture

beforeAll(async () => {
  f = await seedFixture()
})
afterAll(async () => {
  await closeTestPool()
})

describe('self-elevation is impossible', () => {
  it('a registered user cannot grant themselves platform_administrator', async () => {
    const err = await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.registered_user }, (c) =>
          c.query('INSERT INTO identity.user_roles(user_id, role_key) VALUES ($1, $2)', [
            f.users.registered_user,
            'platform_administrator',
          ]),
        ),
      'registered_user self-granting platform_administrator',
    )
    expect(err.message).toMatch(/self role assignment|policy|permission|denied/i)
  })

  it('even a user administrator cannot assign a role to themselves', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.user_administrator }, (c) =>
          c.query('INSERT INTO identity.user_roles(user_id, role_key) VALUES ($1, $2)', [
            f.users.user_administrator,
            'publisher',
          ]),
        ),
      'user_administrator self-assigning publisher',
    )
  })

  it('a registered user cannot assign a role to somebody else either', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.registered_user }, (c) =>
          c.query('INSERT INTO identity.user_roles(user_id, role_key) VALUES ($1, $2)', [
            f.users.author,
            'publisher',
          ]),
        ),
      'registered_user assigning a role to another account',
    )
  })
})

describe('audit.events is append-only', () => {
  it('no role may UPDATE an audit row', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.platform_administrator }, async (c) => {
          await c.query(
            "INSERT INTO audit.events(action,resource_type,decision) VALUES ('probe','test','performed')",
          )
          return c.query("UPDATE audit.events SET action = 'tampered'")
        }),
      'platform_administrator updating an audit row',
    )
  })

  it('no role may DELETE an audit row', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.platform_administrator }, async (c) => {
          await c.query(
            "INSERT INTO audit.events(action,resource_type,decision) VALUES ('probe2','test','performed')",
          )
          return c.query('DELETE FROM audit.events')
        }),
      'platform_administrator deleting an audit row',
    )
  })

  it('even the RLS-bypassing service_role cannot mutate audit rows', async () => {
    // Two independent controls: the policy set AND a table trigger. A BYPASSRLS role
    // defeats the first but not the second.
    await expectDenied(
      () => as({ role: 'service_role', userId: null }, (c) => c.query("UPDATE audit.events SET action='x'")),
      'service_role updating an audit row',
    )
  })

  it('a user without admin.read_audit cannot read the audit log', async () => {
    await expectNoRows(
      { role: 'authenticated', userId: f.users.author },
      'SELECT id FROM audit.events LIMIT 5',
      [],
      'author reading the audit log',
    )
  })
})

describe('external identities are not writable through the API', () => {
  it('a user cannot insert an external identity for themselves', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.registered_user }, (c) =>
          c.query(
            `INSERT INTO accounts.external_identities(provider, provider_subject, user_id, verified_email)
             VALUES ('google','forged-subject-123',$1,'attacker@example.com')`,
            [f.users.registered_user],
          ),
        ),
      'user inserting their own external identity',
    )
  })

  it('a user cannot hijack another account by claiming its provider subject', async () => {
    await expectDenied(
      () =>
        as({ role: 'authenticated', userId: f.users.registered_user }, (c) =>
          c.query(
            `INSERT INTO accounts.external_identities(provider, provider_subject, user_id, verified_email)
             VALUES ('google','victim-subject',$1,'victim@example.com')`,
            [f.users.author],
          ),
        ),
      'user linking an identity to a different account',
    )
  })

  it('one provider subject maps to at most one account, by constraint', async () => {
    // Enforced by a UNIQUE constraint, not by application logic (Block 28 req 6).
    const { rows } = await as({ role: 'service_role', userId: null }, async (c) =>
      c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_constraint
          WHERE conrelid = 'accounts.external_identities'::regclass AND contype = 'u'`,
      ),
    )
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1)
  })
})

describe('profile ownership', () => {
  it('a user cannot read another user profile', async () => {
    await expectNoRows(
      { role: 'authenticated', userId: f.users.registered_user },
      'SELECT user_id FROM accounts.profiles WHERE user_id = $1',
      [f.users.author],
      'registered_user reading another user profile',
    )
  })

  it('anon cannot read any profile', async () => {
    await expectNoRows(ANON, 'SELECT user_id FROM accounts.profiles', [], 'anon reading profiles')
  })

  it('a user CAN read their own profile', async () => {
    const rows = await as({ role: 'authenticated', userId: f.users.registered_user }, async (c) =>
      (await c.query('SELECT user_id FROM accounts.profiles WHERE user_id = $1', [f.users.registered_user])).rows,
    )
    expect(rows).toHaveLength(1)
  })
})
