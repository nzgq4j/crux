# crux

Crucible Insight content managed website.

Crux is a production-oriented research, publishing, and digital-content platform. It
publishes structured research with immutable versions, traceable evidence, and
version-aware citations, and it is operated through its own administrative dashboard.

## Platform purpose

- Publish research — articles, reports, white papers, datasets, and collections — as
  structured, citable, machine-readable content.
- Govern that research through a real editorial workflow: assignment, review,
  approval, scheduled publication, correction, and withdrawal.
- Make every quantitative finding traceable to the data and method that produced it.
- Serve the public research corpus accessibly, and serve machines honestly.

## Architecture

The intended architecture, and what is actually built today. The right-hand column is
the honest one — see [Current status](#current-status) for detail.

| Layer | Technology | Built? |
|---|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript strict | Yes — 17 public read-only routes |
| Database | Supabase PostgreSQL with Row Level Security | Yes — 12 schemas, 65 tables, 118 policies |
| Data access | PostgREST (deployed) and direct SQL (local) | Yes — both, one RLS model |
| Authentication | Supabase Auth, including Google OAuth | **No** — role model exists, no sign-in flow |
| Storage | Supabase Storage, public and private buckets | **No** — `assets` schema exists, no buckets |
| Server functions | Supabase Edge Functions | **No** |
| Search | Weighted tsvector plus pgvector | **Partly** — `search` schema and pgvector exist; the site searches with `ILIKE` over title, standfirst and body |
| Administrative dashboard | `/admin` | **No** — the route does not exist |

### Supabase-native CMS

The content model is built on this project's own PostgreSQL. **No paid or proprietary
CMS product or component suite is used.** Content types, structured modules, versions,
taxonomy, workflow and assets are first-class database objects governed by RLS.

What that means today: the schema, constraints, triggers and policies are implemented
and tested. **There is no authoring interface.** Content reaches the database through
`supabase/seed.sql`, and editing it means writing SQL.

## Prompt-block execution model

Implementation is driven by a library of numbered implementation contracts under
`.claude/prompts/` — Blocks 00 through 28. Each block states its objective, scope,
dependencies, inputs, outputs, functional and technical requirements, security,
accessibility, testing and documentation obligations, acceptance criteria, and its
completion report format.

Work proceeds through `.claude/prompts/00-master-orchestrator.md`, which selects the
next eligible block from the dependency matrix, delegates it to the owning specialist
agent in `.claude/agents/`, and refuses to start a block whose dependencies are
incomplete. Security-critical and accessibility-critical blocks require sign-off from a
reviewer other than the implementing agent.

Start at `CLAUDE.md`.

## Current status

**A public read-only reading surface over a complete, policy-governed database. No
authoring, no accounts, no administrative surface.**

Verified on the commit that introduced this section — every figure below was produced
by running the command, not by reading the code.

### What is built

| Area | State |
|---|---|
| Next.js application | 17 public routes, Server Components, TypeScript strict, Tailwind v4 tokens |
| Database | 18 migrations applying clean to an empty cluster; 12 schemas; 65 tables; 118 RLS policies; 14 roles; 26 permissions; 59 grants |
| Data access | PostgREST as `anon` in deployment, direct SQL locally — the same RLS policies govern both |
| Content model | Typed JSON modules with stable fragment identifiers, immutable published versions enforced by trigger, append-only audit |
| Privileged access | Permission check, operation and audit write in one transaction; confined to `src/lib/db/` by a conformance rule |
| Configuration | Split public/server environment modules; `server-only` boundary; validated `DATABASE_URL` that refuses local addresses and placeholder credentials outside development |
| Tests | 9 files — RLS and denied-access, database invariants, conformance teeth, environment validation |
| CI | Lint, types, lockfile consistency, unit tests, build, clean-database migrations, schema integrity, database and RLS suites, secret scan, dependency audit, bundle scan, architecture conformance |

### What is not built

These are absent, not partially working. Nothing in the interface pretends otherwise.

- **Authentication.** No sign-in, no session handling, no OAuth. The role model,
  permissions and policies exist and are tested, but nothing authenticates a user.
  `/account` is a placeholder that says so.
- **Administrative dashboard.** `/admin` does not exist.
- **Structured editor.** No authoring interface. Content enters through seed SQL.
- **Editorial workflow.** The `workflow` schema, its states and transitions exist and
  are validated; no interface drives them.
- **Entitlements and downloads.** No signed URLs, no storage buckets, no gating.
- **Newsletter.** The `subscriptions` schema exists; nothing subscribes.
- **Hybrid search.** The site uses `ILIKE`. The `search` schema and pgvector are in
  place but unused by the reading surface.
- **Claims, evidence and citation export.** The `knowledge` schema exists; no surface
  reads or exports from it.
- **Observability, rate limiting, provider integrations.**

### Known production blockers

1. **The deployed database carries only part of the schema.** The Supabase project has
   `cms`, `taxonomy`, `identity`, `accounts` and `audit`. The `workflow`, `knowledge`,
   `assets`, `subscriptions`, `search` and `analytics` migrations have never been
   applied there.
2. **`CRUX_ENV` is not set in the deployment.** It now fails closed — an unset value on
   a production build resolves to `production` — but the deployment should set it
   explicitly rather than rely on inference.
3. **Accessibility is unverified.** WCAG 2.2 AA is the target. No automated check runs
   in CI and no manual keyboard or screen-reader pass has been performed.
4. **Out-of-order migrations are applied rather than rejected.** A migration merged
   with an earlier timestamp than one already applied will run after it. See
   `docs/known-limitations.md`.

See `docs/known-limitations.md` for the full register and `docs/implementation-status.md`
for per-block state.

## Repository layout

```
CLAUDE.md                                  Root project instructions
src/
  app/                                     17 public routes (App Router)
  components/                              Content rendering and UI state components
  lib/
    content/                               PostgREST and direct-SQL backends, one interface
    db/                                    Pooled access; the only privileged path
    env/                                   public, server and mode configuration modules
supabase/
  migrations/                              18 timestamp-ordered migrations
  seed.sql                                 Deterministic demonstration content
tests/                                     RLS, database, conformance, environment
scripts/                                   Database, scanning and conformance tooling
.claude/
  architecture-manifest.md                 Installed blocks, hashes, agents, gates
  prompts/                                 Blocks 00–28, the implementation contracts
  agents/                                  Specialist agent role contracts
  rules/                                   Enforceable engineering rules
docs/
  implementation-status.md                 Per-block status and next eligible block
  requirements-traceability.md             Requirement → implementation → test → evidence
  repository-assessment.md                 Initialization baseline
  architecture-block-dependencies.md       Dependency matrix, waves, parallel limits
  architecture-installation-report.md      What was installed, and what was not
  architecture-decisions/                  ADRs
.github/
  pull_request_template.md
  ISSUE_TEMPLATE/                          Bug, feature, and security templates
```

## Security principles

1. Authorization is enforced in PostgreSQL and the trusted server layer — never in the
   browser, and never by hiding a control.
2. RLS is enabled and forced on every table in every exposed schema.
3. Privileged credentials and secret keys stay server-side. Nothing secret reaches a
   client bundle, a log, or this repository.
4. Private reports and datasets are delivered only through short-lived signed URLs
   issued after a server-side entitlement check.
5. Published versions are immutable; audit logs are append-only.
6. Search is permission-aware: restricted content is absent from results, counts,
   facets, and snippets.
7. Denied-access tests are mandatory for every authorization boundary, and no control
   is ever weakened to make a test pass.

## Editorial integrity

Crux does not fabricate research claims, sources, citations, credentials, datasets,
identifiers, or institutional authority. Where a metadata field has no value, it is
omitted rather than filled with a plausible one.

Crux also does not claim that structured data, `llms.txt`, or any other technical
implementation **guarantees** citation by a large language model. These measures improve
the conditions for accurate attribution. They do not compel it.

## Local setup

Requires Node 22+ and PostgreSQL 16 with the `vector` extension. Every command below
was executed as written on a clean checkout.

```bash
npm ci                  # install from the lockfile
npm run db:start        # initialise and start a local cluster
npm run db:reset        # drop, apply 18 migrations, seed demonstration content
npm run dev             # http://localhost:3000
```

`db:migrate` is incremental and safe to run repeatedly, including against a database
with data in it: a ledger in `private.schema_migrations` records what has been applied,
only missing migrations run, and a migration edited after it was applied is a hard
failure. `db:reset` is destructive — it drops and recreates the database — and refuses
to run outside development and test.

Copy `.env.example` to `.env.local` and fill it in. It contains variable names only,
never values. With no Supabase variables set the application reads the local cluster
over a direct SQL connection; with `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set it reads Supabase over PostgREST. Both paths
are governed by the same RLS policies.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Full suite (requires a running, migrated database) |
| `npm run test:unit` | Environment and conformance tests only — no database needed |
| `npm run test:db` / `test:rls` | Database invariants / RLS and denied-access |
| `npm run test:migrations` | Migration runner: incremental, drift, concurrency |
| `npm run db:start` / `db:stop` | Start or stop the local cluster |
| `npm run db:migrate` | Apply unapplied migrations. Incremental, non-destructive, safe to rerun |
| `npm run db:status` | Which migrations are applied, which are pending, and any drift |
| `npm run db:migrate:verify` | Verify the ledger against the files. Read-only; safe against production |
| `npm run db:seed` | Seed demonstration content |
| `npm run db:reset` | **Destructive.** Drop, recreate, migrate, seed. Local development only |
| `npm run db:verify` | Schema integrity: RLS coverage, `SECURITY DEFINER` search paths, FK indexes, orphan permissions |
| `npm run check:conformance` | Architecture rules a linter cannot express |
| `npm run scan:secrets` / `scan:bundle` | Secret scan over history / server-only identifiers in client output |
| `npm run verify` | typecheck, lint, conformance, secret scan, tests |

### Test coverage

Nine test files. The suite covers RLS and denied-access boundaries, published-version
immutability, search leakage, privileged-access authorization and audit, database URL
validation, the client/server environment boundary, SQL-interpolation conformance, and
query parameterisation.

There are **no** end-to-end tests, no accessibility tests, and no rendering tests. The
reading surface is verified by the build succeeding and by manual inspection, which is
not the same as being tested.

## Links

- [Implementation status](docs/implementation-status.md)
- [Known limitations](docs/known-limitations.md)
- [Local development](docs/local-development.md)
- [Architecture manifest](.claude/architecture-manifest.md)
- [Block dependency matrix](docs/architecture-block-dependencies.md)
- [Requirements traceability](docs/requirements-traceability.md)
- [Architecture installation report](docs/architecture-installation-report.md)
