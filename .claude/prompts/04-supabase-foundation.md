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
- The five storage buckets, with visibility recorded per bucket.
- The `audit.events` table.
- `docs/local-development.md`, recording project region, dev/staging/prod separation,
  connection pooling mode and sizing, and the backup and retention policy.

## Functional Requirements

1. **Supabase CLI.** Pin the CLI version. Provide scripts for start, stop, reset,
   migration creation, migration application, and type generation.
2. **Local development.** `supabase start` followed by reset and seed must yield a
   working database with deterministic fixture data on a clean machine.
2a. **Project setup (§45.1.1).** Record the project region and the dev/staging/prod
   environment separation. Configure connection pooling — PgBouncer or Supabase
   pooling — and record the pool mode and sizing. Define the database backup and
   retention policy here; Block 23 implements and rehearses it.
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
6. **PostgreSQL extensions.** The §45.1.1 baseline is mandatory: `vector`
   (pgvector), `pgcrypto`, and `uuid-ossp` or a `gen_random_uuid` equivalent.
   `uuid-ossp` is mandatory as §45.1.1 states; do not substitute `pgcrypto`'s
   `gen_random_uuid` for it, though that function may still be used for defaults.
   Additionally enable `pg_trgm`, `unaccent`, and `pg_stat_statements`, which later
   blocks depend on. Record the version of each.
7. **Required schemas.** Create exactly these namespaces:

   `public`, `cms`, `taxonomy`, `identity`, `workflow`, `assets`, `knowledge`,
   `search`, `accounts`, `subscriptions`, `analytics`, `audit`, `private`

   §45.1.2 lists fourteen schemas; the fourteenth is `auth`, which is Supabase-managed
   and already exists. Do not create or alter it. The thirteen above are created here.

   Grant usage deliberately per schema. The `private` schema is never exposed to
   PostgREST.
8. **Storage initialisation (§45.1.10).** Create the bucket set with visibility
   recorded per bucket:

   | Bucket | Visibility | Contents |
   |---|---|---|
   | `public-images` | Public | Published images and open assets |
   | `private-reports` | Private | Gated reports and white papers |
   | `datasets` | Private by default | Dataset files, classification per dataset |
   | `avatars` | Public | Profile and expert portraits |
   | `quarantine` | Private | Uploads pending validation |

   Bucket policies are defined by Block 13; this block creates the buckets and
   records their intended visibility.
9. **Edge Function structure.** A shared module for request identifiers, structured
   logging, error shaping, and environment access; plus one health function proving
   the pattern. The target function inventory from §45.3.2, implemented by their
   owning blocks, is: embedding generation (15), email sending (14), webhook
   processing (14), signed download generation (13), and scheduled publishing (08).

   **Every Edge Function, without exception, enforces the §45.3.2 quartet**:
   authentication of the caller (user JWT, service identity, cron secret, or verified
   provider signature — whichever applies), authorization against the required
   permission, input validation against a schema, and an audit-log write. The shared
   module provides these as the default path so that a function opting out is a
   visible, reviewable decision rather than an omission.
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
- **Create `audit.events` (§45.1.9).** This block owns the table's creation, because
  every later block writes to it. Required columns: event identifier, `occurred_at`,
  actor (nullable for system actions), action, resource type, resource identifier,
  decision, request identifier, and a JSON detail payload. Append-only by design;
  Block 07 authors the policies that enforce it and Block 19 defines what is logged.
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
- [ ] All thirteen schemas exist; `auth` is present and Supabase-managed.
- [ ] Project region and dev/staging/prod separation are recorded.
- [ ] Connection pooling is configured, with mode and sizing recorded.
- [ ] The backup and retention policy is defined.
- [ ] `audit.events` exists with its required columns.
- [ ] All five storage buckets exist with recorded visibility.
- [ ] The Edge Function shared module enforces authentication, authorization, input
      validation, and audit logging by default.
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
