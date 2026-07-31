import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { asSuperuser, as, ANON, closeTestPool, expectDenied } from '../helpers/db'

/**
 * The abuse limiter (rules/security.md 22–25).
 *
 * Tested against the real function and the real table rather than a fake, because the
 * properties that matter — that a refused attempt still counts, that the window slides,
 * that no API role can read or clear the state — are properties of the database object,
 * not of the TypeScript wrapper.
 */

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const BUCKET = `test_${process.pid}`

/** An authenticated actor holding nothing. The subject of the denial tests below. */
const AUTHED = { role: 'authenticated', userId: '00000000-0000-0000-0000-000000000001' } as const

interface Decision {
  allowed: boolean
  remaining: number
  retry_after_seconds: number
}

async function check(bucket: string, key: string, limit: number, seconds: number) {
  return asSuperuser(async (c) => {
    const r = await c.query<Decision>(
      'SELECT allowed, remaining, retry_after_seconds FROM private.check_rate_limit($1,$2,$3, make_interval(secs => $4))',
      [bucket, key, limit, seconds],
    )
    return r.rows[0]!
  })
}

beforeAll(async () => {
  await asSuperuser((c) => c.query('DELETE FROM private.rate_limit_events WHERE bucket LIKE $1', ['test_%']))
})

afterAll(async () => {
  await asSuperuser((c) => c.query('DELETE FROM private.rate_limit_events WHERE bucket LIKE $1', ['test_%']))
  await closeTestPool()
})

describe('the limiter counts and refuses', () => {
  it('allows up to the limit and refuses the next attempt', async () => {
    const bucket = `${BUCKET}_basic`
    expect((await check(bucket, KEY_A, 3, 60)).allowed).toBe(true)
    expect((await check(bucket, KEY_A, 3, 60)).allowed).toBe(true)
    const third = await check(bucket, KEY_A, 3, 60)
    expect(third.allowed).toBe(true)
    expect(third.remaining).toBe(0)

    const fourth = await check(bucket, KEY_A, 3, 60)
    expect(fourth.allowed).toBe(false)
    expect(fourth.retry_after_seconds).toBeGreaterThan(0)
  })

  it('counts a refused attempt, so knocking does not hold the gate open', async () => {
    // The failure mode this guards: if refused attempts were not recorded, a caller
    // could keep the window from ever advancing by continuing to try.
    const bucket = `${BUCKET}_refused`
    for (let i = 0; i < 5; i++) await check(bucket, KEY_A, 2, 60)

    const count = await asSuperuser(async (c) => {
      const r = await c.query<{ n: string }>(
        'SELECT count(*) n FROM private.rate_limit_events WHERE bucket = $1 AND subject_key = $2',
        [bucket, KEY_A],
      )
      return Number(r.rows[0]!.n)
    })
    expect(count, 'every attempt is recorded, including the refused ones').toBe(5)
  })

  it('keeps subjects independent', async () => {
    const bucket = `${BUCKET}_subjects`
    await check(bucket, KEY_A, 1, 60)
    expect((await check(bucket, KEY_A, 1, 60)).allowed).toBe(false)
    expect((await check(bucket, KEY_B, 1, 60)).allowed, 'a different subject has its own budget')
      .toBe(true)
  })

  it('keeps buckets independent', async () => {
    await check(`${BUCKET}_one`, KEY_A, 1, 60)
    expect((await check(`${BUCKET}_one`, KEY_A, 1, 60)).allowed).toBe(false)
    expect((await check(`${BUCKET}_two`, KEY_A, 1, 60)).allowed).toBe(true)
  })

  it('slides: an attempt outside the window does not count', async () => {
    const bucket = `${BUCKET}_window`
    await check(bucket, KEY_A, 1, 60)
    // Age the recorded attempt rather than waiting for wall-clock time
    // (rules/testing.md 11: no test depends on timing).
    await asSuperuser((c) =>
      c.query(
        "UPDATE private.rate_limit_events SET occurred_at = now() - interval '2 hours' WHERE bucket = $1",
        [bucket],
      ),
    )
    expect((await check(bucket, KEY_A, 1, 60)).allowed, 'the aged attempt is outside the window')
      .toBe(true)
  })

  it('rejects a malformed subject key rather than storing it', async () => {
    await expect(check(BUCKET, 'too-short', 3, 60)).rejects.toThrow(/64-character digest/)
  })

  it('rejects a nonsensical limit', async () => {
    await expect(check(BUCKET, KEY_A, 0, 60)).rejects.toThrow(/at least 1/)
  })
})

describe('the limiter state is unreachable from the API roles', () => {
  it('an anonymous caller cannot read the attempt log', async () => {
    // Not "returns no rows" — no USAGE on the schema at all, so the relation cannot
    // even be named. A caller who could read this table could enumerate accounts.
    await expectDenied(
      () => as(ANON, (c) => c.query('SELECT * FROM private.rate_limit_events')),
      'anonymous read of the attempt log',
    )
  })

  it('an authenticated caller cannot read the attempt log', async () => {
    await expectDenied(
      () => as(AUTHED, (c) => c.query('SELECT * FROM private.rate_limit_events')),
      'authenticated read of the attempt log',
    )
  })

  it('an authenticated caller cannot clear their own budget', async () => {
    await expectDenied(
      () => as(AUTHED, (c) => c.query('DELETE FROM private.rate_limit_events')),
      'authenticated clearing of the attempt log',
    )
  })

  it('an authenticated caller cannot call the limiter directly', async () => {
    // If a caller could invoke this, they could burn another subject's budget by
    // guessing digests, or simply flood the table.
    await expectDenied(
      () =>
        as(AUTHED, (c) =>
          c.query('SELECT private.check_rate_limit($1, $2, 1, make_interval(secs => 60))', [
            'x',
            KEY_A,
          ]),
        ),
      'direct invocation of the limiter',
    )
  })

  it('the table has row level security enabled', async () => {
    const enabled = await asSuperuser(async (c) => {
      const r = await c.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'private' AND c.relname = 'rate_limit_events'`,
      )
      return r.rows[0]?.relrowsecurity
    })
    expect(enabled, 'rules/database.md 6: RLS at creation').toBe(true)
  })
})

describe('retention', () => {
  it('purges attempts older than the retention interval and keeps recent ones', async () => {
    const bucket = `${BUCKET}_purge`
    await check(bucket, KEY_A, 10, 60)
    await check(bucket, KEY_B, 10, 60)
    await asSuperuser((c) =>
      c.query(
        "UPDATE private.rate_limit_events SET occurred_at = now() - interval '48 hours' WHERE bucket = $1 AND subject_key = $2",
        [bucket, KEY_A],
      ),
    )

    await asSuperuser((c) => c.query("SELECT private.purge_rate_limit_events(interval '24 hours')"))

    const remaining = await asSuperuser(async (c) => {
      const r = await c.query<{ subject_key: string }>(
        'SELECT subject_key FROM private.rate_limit_events WHERE bucket = $1',
        [bucket],
      )
      return r.rows.map((x) => x.subject_key)
    })
    expect(remaining).toEqual([KEY_B])
  })
})
