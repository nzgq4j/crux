/**
 * Non-destructive migration runner.
 *
 * The previous runner replayed every file on every invocation and recorded nothing.
 * That is workable against a database you are willing to drop, and useless against one
 * you are not: a second run failed on the first `CREATE TABLE`, so there was no way to
 * apply only new migrations to a persistent environment. `db:reset` was the only
 * supported path, and it destroys data.
 *
 * This runner maintains a ledger, applies only what is missing, and refuses to proceed
 * when the history it finds does not match the history it expects.
 *
 * Guarantees:
 *
 *   - **Ledger.** Every applied migration is recorded with its identifier, filename,
 *     checksum, timestamp, duration and success state.
 *   - **Incremental.** Only unapplied migrations run, in identifier order.
 *   - **Immutable history.** A file whose checksum differs from the recorded one is a
 *     hard failure. Editing an applied migration is how two environments silently
 *     diverge.
 *   - **Single writer.** A session-level advisory lock means two runners cannot apply
 *     migrations concurrently.
 *   - **Atomic per migration.** Each migration and its ledger row commit together, so
 *     a failure can never leave a migration recorded as applied. A migration may opt
 *     out where PostgreSQL forbids a transaction, but must say why.
 *   - **Stops on failure.** Later migrations do not run.
 *
 * The runner is a module first and a CLI second, so the tests drive the same code the
 * operator does.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const { Client } = pg

export const DEFAULT_DATABASE_URL = 'postgresql://postgres@localhost:5432/crux'
export const MIGRATIONS_DIR = 'supabase/migrations'

/**
 * Advisory lock key.
 *
 * An arbitrary constant, fixed forever: its only requirement is that every runner
 * against a given database chooses the same number. Session-scoped rather than
 * transaction-scoped, because the lock must span every migration in the run, not just
 * one.
 */
export const ADVISORY_LOCK_KEY = 8_154_923_771_004n

/** `20260731000100_foundation.sql` → id `20260731000100`. */
const FILENAME_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/

/**
 * A migration may opt out of the wrapping transaction — `CREATE INDEX CONCURRENTLY`
 * and `ALTER TYPE ... ADD VALUE` cannot run inside one. It must state why: a
 * migration that is not atomic can leave the database half-changed, and the next
 * reader deserves to know that was a decision.
 */
const NO_TRANSACTION = /^--\s*crux:no-transaction\s+reason:\s*(\S.*)$/m
const NO_TRANSACTION_BARE = /^--\s*crux:no-transaction\s*$/m

export class MigrationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MigrationError'
  }
}

export class MigrationLockError extends MigrationError {
  constructor(message) {
    super(message)
    this.name = 'MigrationLockError'
  }
}

export class MigrationDriftError extends MigrationError {
  constructor(message) {
    super(message)
    this.name = 'MigrationDriftError'
  }
}

const LEDGER_DDL = `
  CREATE SCHEMA IF NOT EXISTS private;
  REVOKE ALL ON SCHEMA private FROM PUBLIC;
  CREATE TABLE IF NOT EXISTS private.schema_migrations (
    id          text PRIMARY KEY,
    filename    text        NOT NULL,
    checksum    text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms integer     NOT NULL,
    success     boolean     NOT NULL
  );
  COMMENT ON TABLE private.schema_migrations IS
    'Migration ledger. One row per migration attempt; success = false records a failure that must be resolved before the migration can be considered applied. Lives in private, which is not exposed through the API.';
`

export function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

/**
 * Read the migration directory.
 *
 * Ordering is by identifier — the 14-digit timestamp — not by directory order, which
 * is filesystem-dependent. A filename that does not parse is an error rather than a
 * skip: a file silently ignored is worse than a run that refuses to start.
 */
export function readMigrations(dir = MIGRATIONS_DIR) {
  const entries = readdirSync(dir).filter((f) => f.endsWith('.sql'))
  const migrations = entries.map((filename) => {
    const match = FILENAME_PATTERN.exec(filename)
    if (!match) {
      throw new MigrationError(
        `Migration filename '${filename}' does not match <14-digit-timestamp>_<lower_snake_case>.sql`,
      )
    }
    const contents = readFileSync(join(dir, filename), 'utf8')
    const reason = NO_TRANSACTION.exec(contents)
    if (!reason && NO_TRANSACTION_BARE.test(contents)) {
      throw new MigrationError(
        `Migration '${filename}' is marked crux:no-transaction without a reason. ` +
          `Write "-- crux:no-transaction reason: <why>".`,
      )
    }
    return {
      id: match[1],
      name: match[2],
      filename,
      path: join(dir, filename),
      contents,
      checksum: checksum(contents),
      transactional: reason === null,
      noTransactionReason: reason ? reason[1].trim() : null,
    }
  })

  migrations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const seen = new Map()
  for (const m of migrations) {
    if (seen.has(m.id)) {
      throw new MigrationError(
        `Two migrations share identifier ${m.id}: ${seen.get(m.id)} and ${m.filename}. ` +
          `Order would be ambiguous.`,
      )
    }
    seen.set(m.id, m.filename)
  }
  return migrations
}

async function connect(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

/**
 * Create the ledger if it is absent.
 *
 * Must be called with the advisory lock already held. `CREATE SCHEMA IF NOT EXISTS`
 * and `CREATE TABLE IF NOT EXISTS` are not race-safe in PostgreSQL — two sessions
 * running them simultaneously produce a duplicate-key error on the catalogue rather
 * than one of them quietly winning. Serialising behind the lock is the fix; retrying
 * on the catalogue error would be treating the symptom.
 */
async function ensureLedger(client) {
  await client.query(LEDGER_DDL)
}

/** Does the ledger exist? Read-only commands ask rather than create. */
async function ledgerExists(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('private.schema_migrations') IS NOT NULL AS present`,
  )
  return rows[0].present === true
}

async function ledgerRows(client) {
  const { rows } = await client.query(
    `SELECT id, filename, checksum, applied_at, duration_ms, success
       FROM private.schema_migrations ORDER BY id`,
  )
  return rows
}

/**
 * Compare the ledger against the files on disk.
 *
 * Returns a list of problems rather than throwing, so `status` can report them all and
 * `migrate` can refuse with the complete picture.
 */
export function findDrift(applied, migrations) {
  const byId = new Map(migrations.map((m) => [m.id, m]))
  const problems = []
  for (const row of applied) {
    const file = byId.get(row.id)
    if (!file) {
      problems.push(
        `${row.id} (${row.filename}) is recorded as applied but the file is missing. ` +
          `Restore it or the database's history cannot be reproduced.`,
      )
      continue
    }
    if (file.checksum !== row.checksum) {
      problems.push(
        `${row.id} (${file.filename}) has been modified since it was applied. ` +
          `Recorded ${row.checksum.slice(0, 12)}…, found ${file.checksum.slice(0, 12)}…. ` +
          `Write a new migration instead of editing an applied one.`,
      )
    }
  }
  return problems
}

/**
 * Take the advisory lock, waiting up to `timeoutMs`.
 *
 * `pg_try_advisory_lock` rather than the blocking form so the wait is bounded and the
 * failure is a clear message instead of a hang.
 */
async function acquireLock(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
      ADVISORY_LOCK_KEY.toString(),
    ])
    if (rows[0].locked) return
    if (Date.now() >= deadline) {
      throw new MigrationLockError(
        `Another migration run holds the advisory lock (key ${ADVISORY_LOCK_KEY}). ` +
          `Waited ${timeoutMs}ms. Migrations are never run concurrently.`,
      )
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function releaseLock(client) {
  await client
    .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY.toString()])
    .catch(() => undefined)
}

/** Record a failed attempt on its own transaction, so it survives the rollback. */
async function recordFailure(databaseUrl, migration, durationMs) {
  const client = await connect(databaseUrl)
  try {
    await client.query(
      `INSERT INTO private.schema_migrations (id, filename, checksum, duration_ms, success)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (id) DO UPDATE
         SET filename = EXCLUDED.filename,
             checksum = EXCLUDED.checksum,
             applied_at = now(),
             duration_ms = EXCLUDED.duration_ms,
             success = false`,
      [migration.id, migration.filename, migration.checksum, durationMs],
    )
  } finally {
    await client.end()
  }
}

const RECORD_SUCCESS = `
  INSERT INTO private.schema_migrations (id, filename, checksum, duration_ms, success)
  VALUES ($1, $2, $3, $4, true)
  ON CONFLICT (id) DO UPDATE
    SET filename = EXCLUDED.filename,
        checksum = EXCLUDED.checksum,
        applied_at = now(),
        duration_ms = EXCLUDED.duration_ms,
        success = true`

/**
 * Apply every unapplied migration.
 *
 * Returns `{ applied, alreadyApplied, pending }`. Applying nothing is a success: an
 * up-to-date database is the expected steady state, not an error.
 */
export async function migrate({
  databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  dir = MIGRATIONS_DIR,
  lockTimeoutMs = 30_000,
  log = () => {},
} = {}) {
  const migrations = readMigrations(dir)
  const client = await connect(databaseUrl)
  const applied = []

  try {
    // The lock comes first so that creating the ledger is serialised too — see
    // ensureLedger. Taking it needs no table, only a connection.
    await acquireLock(client, lockTimeoutMs)
    await ensureLedger(client)

    // Read after taking the lock: another runner may have applied migrations while we
    // waited, and acting on a stale view would replay them.
    const ledger = await ledgerRows(client)
    const successful = ledger.filter((r) => r.success)

    const problems = findDrift(successful, migrations)
    if (problems.length > 0) {
      throw new MigrationDriftError(
        `Migration history does not match the files on disk:\n  - ${problems.join('\n  - ')}`,
      )
    }

    const appliedIds = new Set(successful.map((r) => r.id))
    const pending = migrations.filter((m) => !appliedIds.has(m.id))

    if (pending.length === 0) {
      log(`==> up to date (${appliedIds.size} migrations applied)`)
      return { applied: [], alreadyApplied: successful.length, pending: 0 }
    }

    for (const migration of pending) {
      const started = Date.now()
      try {
        if (migration.transactional) {
          // The migration and its ledger row commit together. There is no window in
          // which one exists without the other.
          await client.query('BEGIN')
          await client.query(migration.contents)
          await client.query(RECORD_SUCCESS, [
            migration.id,
            migration.filename,
            migration.checksum,
            Date.now() - started,
          ])
          await client.query('COMMIT')
        } else {
          await client.query(migration.contents)
          await client.query(RECORD_SUCCESS, [
            migration.id,
            migration.filename,
            migration.checksum,
            Date.now() - started,
          ])
        }
      } catch (error) {
        if (migration.transactional) {
          await client.query('ROLLBACK').catch(() => undefined)
        }
        const durationMs = Date.now() - started
        // Separate connection: the rollback above would otherwise erase the record.
        await recordFailure(databaseUrl, migration, durationMs).catch(() => undefined)
        throw new MigrationError(
          `Migration ${migration.filename} failed after ${durationMs}ms and was not applied. ` +
            `Later migrations were not attempted.\n${error.message}`,
        )
      }

      const durationMs = Date.now() - started
      applied.push({ ...migration, durationMs })
      log(`==> ${migration.filename.padEnd(52)} applied in ${durationMs}ms`)
    }

    log(`==> ${applied.length} migration${applied.length === 1 ? '' : 's'} applied`)
    return { applied, alreadyApplied: successful.length, pending: pending.length }
  } finally {
    await releaseLock(client)
    await client.end()
  }
}

/** What is applied, what is pending, and whether the history is intact. */
export async function status({
  databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  dir = MIGRATIONS_DIR,
} = {}) {
  const migrations = readMigrations(dir)
  const client = await connect(databaseUrl)
  try {
    // Read-only: a database that has never been migrated reports everything pending
    // rather than having a ledger created as a side effect of being inspected. That
    // matters for `verify`, which is meant to be safe to run against production.
    const ledger = (await ledgerExists(client)) ? await ledgerRows(client) : []
    const successful = ledger.filter((r) => r.success)
    const failed = ledger.filter((r) => !r.success)
    const appliedIds = new Set(successful.map((r) => r.id))
    return {
      applied: successful,
      failed,
      pending: migrations.filter((m) => !appliedIds.has(m.id)),
      drift: findDrift(successful, migrations),
    }
  } finally {
    await client.end()
  }
}

/** Non-zero exit if the recorded history and the files disagree. */
export async function verify(options = {}) {
  const s = await status(options)
  return {
    ok: s.drift.length === 0 && s.failed.length === 0,
    drift: s.drift,
    failed: s.failed,
    appliedCount: s.applied.length,
    pendingCount: s.pending.length,
  }
}

// --- CLI --------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? 'migrate'
  const log = (m) => console.error(m)

  try {
    if (command === 'migrate') {
      await migrate({ log })
    } else if (command === 'status') {
      const s = await status()
      console.error(`==> applied: ${s.applied.length}   pending: ${s.pending.length}`)
      for (const r of s.applied) {
        console.error(
          `  applied  ${r.id}  ${r.filename.padEnd(48)} ${new Date(r.applied_at).toISOString()}  ${r.duration_ms}ms`,
        )
      }
      for (const r of s.failed) {
        console.error(`  FAILED   ${r.id}  ${r.filename}  (recorded failure, not applied)`)
      }
      for (const m of s.pending) {
        console.error(`  pending  ${m.id}  ${m.filename}`)
      }
      if (s.drift.length > 0) {
        console.error('==> DRIFT')
        for (const d of s.drift) console.error(`  - ${d}`)
        process.exit(1)
      }
    } else if (command === 'verify') {
      const v = await verify()
      if (!v.ok) {
        console.error('==> migration history FAILED verification')
        for (const d of v.drift) console.error(`  - ${d}`)
        for (const f of v.failed) console.error(`  - ${f.id} ${f.filename} recorded as failed`)
        process.exit(1)
      }
      console.error(
        `  ok    migration history intact (${v.appliedCount} applied, ${v.pendingCount} pending)`,
      )
    } else {
      console.error(`usage: migrate.mjs [migrate|status|verify]`)
      process.exit(2)
    }
  } catch (error) {
    console.error(error instanceof MigrationError ? error.message : String(error))
    process.exit(1)
  }
}
