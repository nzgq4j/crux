# Local Development

Every command below was executed as written during implementation and produced the
result shown. Where a step could not be run in the build environment, that is stated
rather than glossed over.

## Prerequisites

| Requirement | Version used | Notes |
|---|---|---|
| Node.js | 22.22.2 | `>=22` enforced in `package.json` |
| PostgreSQL | 16.13 | Server **and** client. `initdb`, `pg_ctl`, `psql`. |
| pgvector | 0.6.0 | `apt-get install postgresql-16-pgvector` on Debian/Ubuntu |

Supabase CLI and Docker are **not** required for local work — see
[`docs/assumptions.md` A-002](assumptions.md) for why, and what that does and does not
cover.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in locally; .env.local is git-ignored
npm run db:start               # init cluster if needed, start it, create the database
npm run db:migrate             # apply every migration in timestamp order
npm run db:seed                # load demonstration content
npm run dev                    # http://localhost:3000
```

`npm run db:reset` drops, recreates, migrates and seeds in one step. It refuses to run
when `CRUX_ENV=production`.

## Verified output

`npm run db:migrate` against an empty database:

```
==> 20260731000100_foundation.sql ... ok
==> 20260731000200_taxonomy.sql ... ok
==> 20260731000300_identity_accounts.sql ... ok
==> 20260731000350_roles_permissions.sql ... ok
==> 20260731000400_cms_content.sql ... ok
==> 20260731000500_workflow_engine.sql ... ok
==> 20260731000600_knowledge_provenance.sql ... ok
==> 20260731000700_assets_downloads.sql ... ok
==> 20260731000800_subscriptions_newsletter.sql ... ok
==> 20260731000900_search_retrieval.sql ... ok
==> 20260731001000_analytics_events.sql ... ok
==> 20260731001100_rls_core.sql ... ok
==> 20260731001200_rls_domains.sql ... ok
==> 20260731001300_rls_search_analytics.sql ... ok
==> 20260731001400_reconcile_permissions.sql ... ok
==> 20260731001500_service_role_grants.sql ... ok
==> all migrations applied
```

`npm run db:seed`:

```
seeded article      : 13
seeded brief        : 4
seeded case_study   : 3
seeded collection   : 3
seeded data_story   : 2
seeded report       : 7
seeded white_paper  : 4
```

Resulting shape: **65 tables, 118 RLS policies, 63 `private` functions, 36 published
items, 1 draft** (the draft exists so draft isolation is demonstrable in a running
instance).

## Tests

```bash
npm test          # 42 tests, 4 files
npm run test:rls  # RLS and denied-access only
npm run test:db   # database invariants and meta-tests
npm run typecheck # tsc --noEmit
npm run build     # production build
```

The test suite needs a migrated, seeded database. It creates its own fixtures
idempotently and rolls back every transaction, so it can be run repeatedly without a
reset.

One local-only grant is required so the test harness can `SET ROLE`:

```bash
psql -d crux -c 'GRANT anon, authenticated, service_role TO postgres;'
```

This is a convenience for the harness, not part of the schema. On Supabase the
connection already authenticates as the appropriate role.

## Environment variables

Names and purposes are in `.env.example`; values are never committed. `src/lib/env.ts`
validates at startup and fails fast, naming the missing variable. It additionally
refuses to start when Google OAuth is enabled but its four variables are absent or the
redirect URL does not match the public origin — a misconfiguration surfaces at boot
rather than as a broken login.

Only `DATABASE_URL` is needed for local work. It defaults to
`postgresql://postgres@localhost:5432/crux`.

## What is not runnable locally

| Capability | State |
|---|---|
| Supabase Auth | Schema and policies exist; runtime integration not built |
| Supabase Storage | Buckets, policies and metadata modelled; object I/O not wired |
| Edge Functions | Structure defined in Block 04; functions not implemented |
| Embedding generation | `search.embeddings` and the queue exist; no provider called |

These are listed under Remaining Work in the README with the same honesty.

## Troubleshooting

**`pg_ctl: cannot be run as root`** — the scripts run PostgreSQL as the `postgres`
user via `su`. Run them as a user who can `su postgres`, or set `PGBIN`/`PGDATA` and
start the cluster yourself.

**`permission denied for table …` in tests** — the `GRANT anon, authenticated,
service_role TO postgres` above has not been applied.

**`extension "vector" is not available`** — install `postgresql-16-pgvector`. All
other required extensions ship with PostgreSQL 16.
