import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
// @ts-expect-error -- plain ESM with no type declarations; it runs in CI without a
// TypeScript build step, and typing it would mean compiling it first.
import * as runner from '../../scripts/lib/migrate.mjs'

/**
 * The migration runner (non-destructive, ledger-backed).
 *
 * The defect these cover: the previous runner replayed every file on every invocation
 * and recorded nothing, so a second run failed on the first `CREATE TABLE`. There was
 * no way to apply only new migrations to a persistent database, which made `db:reset`
 * — which destroys all data — the only supported path.
 *
 * Every test runs against a real throwaway database. Nothing here is stubbed: the
 * ledger, the advisory lock and the transaction boundaries are the things under test,
 * and a fake would prove nothing about any of them.
 */

const ADMIN_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
  : 'postgresql://postgres@localhost:5432/postgres'

let dbName: string
let dbUrl: string
let dir: string

async function admin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: ADMIN_URL })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

async function onTestDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dbUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

/** Write a migration file into the scratch directory. */
function write(id: string, name: string, sql: string): string {
  const filename = `${id}_${name}.sql`
  writeFileSync(join(dir, filename), sql, 'utf8')
  return filename
}

let counter = 0

beforeEach(async () => {
  counter += 1
  dbName = `crux_migrunner_${process.pid}_${counter}`
  dbUrl = ADMIN_URL.replace(/\/postgres(\?|$)/, `/${dbName}$1`)
  await admin((c) => c.query(`DROP DATABASE IF EXISTS "${dbName}"`))
  await admin((c) => c.query(`CREATE DATABASE "${dbName}"`))
  dir = mkdtempSync(join(tmpdir(), 'crux-migrations-'))
})

afterEach(async () => {
  rmSync(dir, { recursive: true, force: true })
  await admin((c) =>
    c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    ),
  )
  await admin((c) => c.query(`DROP DATABASE IF EXISTS "${dbName}"`))
})

afterAll(async () => {
  // Sweep anything a crashed run left behind.
  await admin(async (c) => {
    const { rows } = await c.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'crux_migrunner_%'`,
    )
    for (const r of rows) await c.query(`DROP DATABASE IF EXISTS "${r.datname}"`)
  })
})

// ---------------------------------------------------------------------------------

describe('an empty database receives all migrations', () => {
  it('applies every file and records each one', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')
    write('20260101000003', 'third', 'CREATE TABLE c (id int primary key);')

    const result = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(result.applied).toHaveLength(3)

    const ledger = await onTestDb((c) =>
      c.query(`SELECT id, filename, checksum, applied_at, duration_ms, success
                 FROM private.schema_migrations ORDER BY id`),
    )
    expect(ledger.rows).toHaveLength(3)
    for (const row of ledger.rows) {
      expect(row.success).toBe(true)
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/)
      expect(row.applied_at).toBeInstanceOf(Date)
      expect(typeof row.duration_ms).toBe('number')
      expect(row.duration_ms).toBeGreaterThanOrEqual(0)
      expect(row.filename).toMatch(/^\d{14}_[a-z_]+\.sql$/)
    }

    const tables = await onTestDb((c) =>
      c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`),
    )
    expect(tables.rows.map((r) => r.tablename)).toEqual(['a', 'b', 'c'])
  })
})

describe('rerunning applies nothing and exits successfully', () => {
  it('is a no-op the second time', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')

    const first = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(first.applied).toHaveLength(1)

    // The old runner failed here with 'relation "a" already exists'.
    const second = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(second.applied).toHaveLength(0)
    expect(second.alreadyApplied).toBe(1)

    const third = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(third.applied).toHaveLength(0)
  })

  it('does not rewrite the ledger row on a no-op run', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })
    const before = await onTestDb((c) =>
      c.query('SELECT applied_at FROM private.schema_migrations WHERE id=$1', ['20260101000001']),
    )
    await runner.migrate({ databaseUrl: dbUrl, dir })
    const after = await onTestDb((c) =>
      c.query('SELECT applied_at FROM private.schema_migrations WHERE id=$1', ['20260101000001']),
    )
    expect(after.rows[0].applied_at).toEqual(before.rows[0].applied_at)
  })
})

describe('adding one migration applies only that migration', () => {
  it('leaves the already-applied ones alone', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    const firstAppliedAt = (
      await onTestDb((c) =>
        c.query('SELECT applied_at FROM private.schema_migrations WHERE id=$1', ['20260101000001']),
      )
    ).rows[0].applied_at

    write('20260101000003', 'third', 'CREATE TABLE c (id int primary key);')
    const result = await runner.migrate({ databaseUrl: dbUrl, dir })

    expect(result.applied.map((m: { id: string }) => m.id)).toEqual(['20260101000003'])

    const after = await onTestDb((c) =>
      c.query('SELECT applied_at FROM private.schema_migrations WHERE id=$1', ['20260101000001']),
    )
    expect(after.rows[0].applied_at).toEqual(firstAppliedAt)
  })

  it('applies a migration inserted earlier in the ordering, and says so', async () => {
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    // A back-dated file is still unapplied, so it runs — out of historical order,
    // which is a real hazard but not one the runner can invent a fix for.
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    const result = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(result.applied.map((m: { id: string }) => m.id)).toEqual(['20260101000001'])
  })
})

describe('modifying an applied migration causes a hard failure', () => {
  it('refuses to run when a checksum changed', async () => {
    const filename = write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    writeFileSync(join(dir, filename), 'CREATE TABLE a (id int primary key, extra text);', 'utf8')

    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow(
      runner.MigrationDriftError,
    )
    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow(
      /has been modified since it was applied/,
    )
  })

  it('refuses even when there is also a new migration to apply', async () => {
    const filename = write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    writeFileSync(join(dir, filename), '-- edited\nCREATE TABLE a (id int primary key);', 'utf8')
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')

    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow(
      runner.MigrationDriftError,
    )
    // The new migration must not have been applied behind the drift.
    const tables = await onTestDb((c) =>
      c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`),
    )
    expect(tables.rows.map((r) => r.tablename)).not.toContain('b')
  })

  it('refuses when an applied migration has been deleted', async () => {
    const filename = write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })
    rmSync(join(dir, filename))

    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow(
      /recorded as applied but the file is missing/,
    )
  })

  it('reports drift through status without throwing', async () => {
    const filename = write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })
    writeFileSync(join(dir, filename), 'CREATE TABLE a (id int primary key, x int);', 'utf8')

    const s = await runner.status({ databaseUrl: dbUrl, dir })
    expect(s.drift).toHaveLength(1)
    const v = await runner.verify({ databaseUrl: dbUrl, dir })
    expect(v.ok).toBe(false)
  })
})

describe('a failed migration is not recorded as applied', () => {
  it('rolls back and leaves nothing behind', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    write(
      '20260101000002',
      'broken',
      'CREATE TABLE b (id int primary key);\nTHIS IS NOT VALID SQL;',
    )

    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow(
      /20260101000002_broken\.sql failed/,
    )

    // The first migration stands; the broken one left no table.
    const tables = await onTestDb((c) =>
      c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`),
    )
    expect(tables.rows.map((r) => r.tablename)).toEqual(['a'])

    // Recorded as a failure, and therefore not as applied.
    const ledger = await onTestDb((c) =>
      c.query('SELECT id, success FROM private.schema_migrations ORDER BY id'),
    )
    expect(ledger.rows).toEqual([
      { id: '20260101000001', success: true },
      { id: '20260101000002', success: false },
    ])
  })

  it('does not attempt later migrations', async () => {
    write('20260101000001', 'broken', 'THIS IS NOT VALID SQL;')
    write('20260101000002', 'later', 'CREATE TABLE later (id int primary key);')

    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow()

    const tables = await onTestDb((c) =>
      c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`),
    )
    expect(tables.rows.map((r) => r.tablename)).not.toContain('later')
  })

  it('applies the migration once it is fixed', async () => {
    const filename = write('20260101000001', 'broken', 'THIS IS NOT VALID SQL;')
    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow()

    writeFileSync(join(dir, filename), 'CREATE TABLE fixed (id int primary key);', 'utf8')
    const result = await runner.migrate({ databaseUrl: dbUrl, dir })

    expect(result.applied).toHaveLength(1)
    const ledger = await onTestDb((c) =>
      c.query('SELECT success FROM private.schema_migrations WHERE id=$1', ['20260101000001']),
    )
    expect(ledger.rows[0].success).toBe(true)
  })
})

describe('concurrent migration attempts cannot both execute', () => {
  it('the second waiter is refused while the lock is held', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')

    // Hold the advisory lock on an independent session.
    const holder = new Client({ connectionString: dbUrl })
    await holder.connect()
    await holder.query('CREATE SCHEMA IF NOT EXISTS private')
    await holder.query('SELECT pg_advisory_lock($1)', [runner.ADVISORY_LOCK_KEY.toString()])

    try {
      await expect(
        runner.migrate({ databaseUrl: dbUrl, dir, lockTimeoutMs: 300 }),
      ).rejects.toThrow(runner.MigrationLockError)

      // Nothing was applied while the lock was held elsewhere.
      const tables = await onTestDb((c) =>
        c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`),
      )
      expect(tables.rows.map((r) => r.tablename)).not.toContain('a')
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1)', [runner.ADVISORY_LOCK_KEY.toString()])
      await holder.end()
    }
  })

  it('two runners racing apply each migration exactly once', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')

    const [a, b] = await Promise.all([
      runner.migrate({ databaseUrl: dbUrl, dir, lockTimeoutMs: 15_000 }),
      runner.migrate({ databaseUrl: dbUrl, dir, lockTimeoutMs: 15_000 }),
    ])

    // Whichever went first did the work; the other found nothing to do. Without the
    // lock the loser would replay and fail on 'relation already exists'.
    const total = a.applied.length + b.applied.length
    expect(total).toBe(2)
    expect([a.applied.length, b.applied.length].sort()).toEqual([0, 2])

    const ledger = await onTestDb((c) =>
      c.query('SELECT count(*)::int AS n FROM private.schema_migrations WHERE success'),
    )
    expect(ledger.rows[0].n).toBe(2)
  })

  it('releases the lock after a successful run', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    const c = new Client({ connectionString: dbUrl })
    await c.connect()
    try {
      const { rows } = await c.query('SELECT pg_try_advisory_lock($1) AS locked', [
        runner.ADVISORY_LOCK_KEY.toString(),
      ])
      expect(rows[0].locked).toBe(true)
    } finally {
      await c.end()
    }
  })

  it('releases the lock after a failed run', async () => {
    write('20260101000001', 'broken', 'THIS IS NOT VALID SQL;')
    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow()

    const c = new Client({ connectionString: dbUrl })
    await c.connect()
    try {
      const { rows } = await c.query('SELECT pg_try_advisory_lock($1) AS locked', [
        runner.ADVISORY_LOCK_KEY.toString(),
      ])
      expect(rows[0].locked).toBe(true)
    } finally {
      await c.end()
    }
  })
})

describe('existing data survives incremental migration', () => {
  it('keeps rows written between migrations', async () => {
    write('20260101000001', 'create', 'CREATE TABLE people (id int primary key, name text);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    await onTestDb((c) =>
      c.query(`INSERT INTO people (id, name) VALUES (1,'Ada'), (2,'Grace')`),
    )

    write('20260101000002', 'add_column', 'ALTER TABLE people ADD COLUMN role text;')
    write('20260101000003', 'add_table', 'CREATE TABLE teams (id int primary key);')
    const result = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(result.applied).toHaveLength(2)

    const rows = await onTestDb((c) => c.query('SELECT id, name, role FROM people ORDER BY id'))
    expect(rows.rows).toEqual([
      { id: 1, name: 'Ada', role: null },
      { id: 2, name: 'Grace', role: null },
    ])
  })

  it('preserves data when a later migration fails', async () => {
    write('20260101000001', 'create', 'CREATE TABLE people (id int primary key, name text);')
    await runner.migrate({ databaseUrl: dbUrl, dir })
    await onTestDb((c) => c.query(`INSERT INTO people (id, name) VALUES (1,'Ada')`))

    write('20260101000002', 'broken', 'DELETE FROM people;\nTHIS IS NOT VALID SQL;')
    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow()

    // The DELETE was inside the migration's transaction, so it rolled back with it.
    const rows = await onTestDb((c) => c.query('SELECT count(*)::int AS n FROM people'))
    expect(rows.rows[0].n).toBe(1)
  })
})

describe('migration ordering is deterministic', () => {
  it('orders by identifier, not by directory order', async () => {
    // Written in deliberately reversed order; readdir order is not guaranteed anyway.
    write('20260101000003', 'third', 'CREATE TABLE c (id int primary key);')
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')

    const migrations = runner.readMigrations(dir)
    expect(migrations.map((m: { id: string }) => m.id)).toEqual([
      '20260101000001',
      '20260101000002',
      '20260101000003',
    ])

    const result = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(result.applied.map((m: { id: string }) => m.id)).toEqual([
      '20260101000001',
      '20260101000002',
      '20260101000003',
    ])
  })

  it('depends on the identifier rather than the descriptive name', async () => {
    write('20260101000001', 'zzz_last_alphabetically', 'CREATE TABLE a (id int primary key);')
    write('20260101000002', 'aaa_first_alphabetically', 'CREATE TABLE b (id int primary key);')
    const migrations = runner.readMigrations(dir)
    expect(migrations.map((m: { id: string }) => m.id)).toEqual([
      '20260101000001',
      '20260101000002',
    ])
  })

  it('refuses two migrations sharing an identifier', async () => {
    write('20260101000001', 'one', 'SELECT 1;')
    write('20260101000001', 'two', 'SELECT 1;')
    expect(() => runner.readMigrations(dir)).toThrow(/share identifier/)
  })

  it('refuses a filename that does not carry an identifier', async () => {
    writeFileSync(join(dir, 'not_a_migration.sql'), 'SELECT 1;', 'utf8')
    expect(() => runner.readMigrations(dir)).toThrow(/does not match/)
  })
})

describe('non-transactional migrations', () => {
  it('runs a migration marked non-transactional with a reason', async () => {
    write('20260101000001', 'base', 'CREATE TABLE a (id int primary key, v int);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    write(
      '20260101000002',
      'concurrent_index',
      '-- crux:no-transaction reason: CREATE INDEX CONCURRENTLY cannot run in a transaction\n' +
        'CREATE INDEX CONCURRENTLY a_v_idx ON a (v);',
    )
    const result = await runner.migrate({ databaseUrl: dbUrl, dir })
    expect(result.applied).toHaveLength(1)

    const idx = await onTestDb((c) =>
      c.query(`SELECT indexname FROM pg_indexes WHERE indexname='a_v_idx'`),
    )
    expect(idx.rows).toHaveLength(1)
  })

  it('refuses the marker without a reason', async () => {
    write('20260101000001', 'unjustified', '-- crux:no-transaction\nCREATE TABLE a (id int);')
    expect(() => runner.readMigrations(dir)).toThrow(/without a reason/)
  })

  it('treats an unmarked migration as transactional', async () => {
    write('20260101000001', 'plain', 'CREATE TABLE a (id int primary key);')
    const [m] = runner.readMigrations(dir)
    expect(m.transactional).toBe(true)
    expect(m.noTransactionReason).toBeNull()
  })
})

describe('status and verify', () => {
  it('reports applied and pending separately', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })
    write('20260101000002', 'second', 'CREATE TABLE b (id int primary key);')

    const s = await runner.status({ databaseUrl: dbUrl, dir })
    expect(s.applied.map((r: { id: string }) => r.id)).toEqual(['20260101000001'])
    expect(s.pending.map((m: { id: string }) => m.id)).toEqual(['20260101000002'])
    expect(s.drift).toEqual([])
  })

  it('verify passes on an intact history and reports counts', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    const v = await runner.verify({ databaseUrl: dbUrl, dir })
    expect(v.ok).toBe(true)
    expect(v.appliedCount).toBe(1)
    expect(v.pendingCount).toBe(0)
  })

  it('verify fails while a recorded failure is outstanding', async () => {
    write('20260101000001', 'broken', 'THIS IS NOT VALID SQL;')
    await expect(runner.migrate({ databaseUrl: dbUrl, dir })).rejects.toThrow()

    const v = await runner.verify({ databaseUrl: dbUrl, dir })
    expect(v.ok).toBe(false)
    expect(v.failed).toHaveLength(1)
  })

  it('status works against a database that has never been migrated', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    const s = await runner.status({ databaseUrl: dbUrl, dir })
    expect(s.applied).toEqual([])
    expect(s.pending).toHaveLength(1)
  })
})

describe('the real migration set', () => {
  it('applies to an empty database and is then a no-op', async () => {
    const real = 'supabase/migrations'
    const first = await runner.migrate({ databaseUrl: dbUrl, dir: real })
    expect(first.applied.length).toBeGreaterThan(0)

    const second = await runner.migrate({ databaseUrl: dbUrl, dir: real })
    expect(second.applied).toHaveLength(0)

    const v = await runner.verify({ databaseUrl: dbUrl, dir: real })
    expect(v.ok).toBe(true)
    expect(v.pendingCount).toBe(0)
  }, 120_000)

  it('every shipped migration filename parses and is uniquely ordered', () => {
    const migrations = runner.readMigrations('supabase/migrations')
    const ids = migrations.map((m: { id: string }) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
    // Guard against a fixture directory being picked up by mistake.
    expect(migrations.length).toBeGreaterThanOrEqual(18)
    for (const m of migrations) {
      expect(readFileSync(m.path, 'utf8')).toBe(m.contents)
    }
  })
})

describe('the ledger is not exposed through the API', () => {
  it('lives in the private schema', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    const rows = await onTestDb((c) =>
      c.query(
        `SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relname='schema_migrations'`,
      ),
    )
    expect(rows.rows.map((r) => r.nspname)).toEqual(['private'])
  })

  it('PUBLIC holds no privilege on the private schema', async () => {
    write('20260101000001', 'first', 'CREATE TABLE a (id int primary key);')
    await runner.migrate({ databaseUrl: dbUrl, dir })

    const rows = await onTestDb((c) =>
      c.query(`SELECT has_schema_privilege('public', 'private', 'USAGE') AS usable`),
    )
    expect(rows.rows[0].usable).toBe(false)
  })
})
