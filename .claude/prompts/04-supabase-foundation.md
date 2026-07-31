# Block 04 — Supabase Foundation

## Objective

Establish the Supabase substrate — local development, migrations, seeds, typed
clients, extensions, schemas, storage, and Edge Function structure — so that every
later data block builds on a reproducible, validated foundation.

## Scope

### In scope

- Supabase CLI configuration and a reproducible local stack.
- Migration and seed conventions.
- Three typed client factories.
- PostgreSQL extensions and the schema namespace set.
- Storage bucket initialisation and Edge Function scaffolding.
- Environment variable validation.

### Out of scope

- Content schema (Block 05), roles (Block 06), policies (Block 07), and production
  provisioning (Block 23).

## Dependencies

Block 03.

## Required Inputs

- `docs/architecture.md`, `docs/repository-assessment.md`.
- `.claude/rules/database.md`, `.claude/rules/backend.md`, `.claude/rules/security.md`.

## Required Outputs

- `supabase/config.toml` and a working `supabase start`.
- `supabase/migrations/` with the foundation migration.
- `supabase/seed.sql` or an equivalent seed entry point.
- Typed client modules for browser, server, and privileged server use.
- Generated database types committed and regenerable by script.
- `supabase/functions/` structure with a shared module and one health function.
- An environment validation module.
- `docs/local-development.md`.

## Functional Requirements

1. **Supabase CLI.** Pin the CLI version. Provide scripts for start, stop, reset,
   migration creation, migration application, and type generation.
2. **Local development.** `supabase start` followed by reset and seed must yield a
   working database with deterministic fixture data on a clean machine.
3. **Migrations.** Timestamp-ordered, forward-only in production, each with a
   documented reverse procedure. Schema changes occur only through migrations.
4. **Seeds.** Deterministic and idempotent. Seeds must never contain production data
   or real personal data.
5. **Typed clients.** Provide exactly three factories:
   - *Browser client* — anonymous or user session, publishable key only.
   - *Server client* — user session propagated from cookies, subject to RLS.
   - *Privileged server client* — secret key, RLS-bypassing, importable only from
     server-only modules and guarded so that importing it from a client component
     is a build-time or runtime failure.
6. **PostgreSQL extensions.** Enable and pin at minimum: `pgcrypto`, `uuid-ossp` or
   `gen_random_uuid` equivalent, `pg_trgm`, `unaccent`, `vector`, and
   `pg_stat_statements`. Record the version of each.
7. **Required schemas.** Create exactly these namespaces:

   `public`, `cms`, `taxonomy`, `identity`, `workflow`, `assets`, `knowledge`,
   `search`, `accounts`, `subscriptions`, `analytics`, `audit`, `private`

   Grant usage deliberately per schema. The `private` schema is never exposed to
   PostgREST.
8. **Storage initialisation.** Create the bucket set with public and private
   designations recorded. Bucket policies are defined by Block 13; this block
   creates the buckets and records their intended visibility.
9. **Edge Function structure.** A shared module for request identifiers, structured
   logging, error shaping, and environment access; plus one health function proving
   the pattern.
10. **Environment validation.** A single module that parses and validates all
    required variables at startup, distinguishing public from server-only
    variables, and failing fast with a precise message naming the missing variable.

## Technical Requirements

- Every migration is reviewable in isolation and applies cleanly to an empty
  database.
- Type generation is a single scripted command; generated types are committed.
- No SQL is executed from application code outside migrations and defined functions.

## Data Requirements

- Establish the timestamp, identifier, and soft-state conventions later blocks
  inherit: UUID primary keys, `created_at`/`updated_at` with timezone, and an
  `updated_at` trigger helper in the `private` schema.
- Establish the audit-event insert helper contract that Block 07 will protect.

## Security Requirements

- The secret key exists only in server-side environments and Edge Functions. It is
  never referenced in a `NEXT_PUBLIC_` variable, client bundle, or committed file.
- Row Level Security is enabled by default on every table created by later blocks;
  record this as a standing requirement here.
- The `private` schema holds helper functions and is not exposed through the API.
- Seeds contain no real credentials.

## Accessibility Requirements

Not applicable to this block. No user-facing surface is produced. Accessibility
obligations begin at Block 09.

## Testing Requirements

- A test proving a clean `reset` plus `seed` succeeds.
- A test proving the environment validator fails when a required variable is absent.
- A test proving the privileged client cannot be constructed in a browser context.
- A test proving every listed extension and schema exists after migration.

## Documentation Requirements

- `docs/local-development.md`: prerequisites, setup, every script, and the reset
  procedure. Every documented command must have been executed successfully.
- `.env.example` updated with any new variable name, values omitted.
- An ADR recording extension and schema choices.

## Acceptance Criteria

- [ ] `supabase start`, reset, and seed succeed from a clean state.
- [ ] All thirteen schemas exist.
- [ ] All required extensions are installed and version-recorded.
- [ ] All three client factories exist, are typed, and are correctly scoped.
- [ ] The privileged client is unreachable from client code, proven by test.
- [ ] Storage buckets exist with recorded visibility.
- [ ] The Edge Function shared module and health function deploy locally.
- [ ] Environment validation fails fast on a missing variable, proven by test.
- [ ] Generated types are committed and regenerable.
- [ ] `docs/local-development.md` commands were executed as written.

## Completion Report

Report: migrations added, schemas created, extensions enabled with versions, client
factories created, buckets created, Edge Function structure, environment variables
introduced, tests added and their results, documentation written, and confirmation
that no secret was committed.
