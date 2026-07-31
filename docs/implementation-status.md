# Crux Implementation Status

## Repository

- Repository: nzgq4j/crux
- Default branch: main
- Working branch: main (PRs #2 and #3 merged; foundation remediation in progress)
- Architecture version: 1.1.0 (Section 45 reconciled)
- Last updated: 2026-07-31 (foundation remediation pass)

## Status Vocabulary

| Status | Meaning |
|---|---|
| Complete | Every acceptance criterion executed and passed, with recorded evidence. |
| Partial | Some acceptance criteria met and verified; the rest listed explicitly below. |
| Not started | No implementation exists. |
| Blocked | A direct dependency is incomplete. |

**Nothing here is marked Complete on the strength of code existing.** Complete means
the criteria were executed against the running system.

## Functional Blocks

| Block | Name | Status | Evidence |
|---|---|---|---|
| 00 | Master Orchestrator | Installed | Contract only; produces no code |
| 01 | Repository Assessment | Partial | `docs/repository-assessment.md` is the initialization baseline; the formal Block 01 pass and its ADR have not been run |
| 02 | Product Requirements | Not started | Requirements seeded in traceability; `docs/product-requirements.md` not written |
| 03 | System Architecture | Partial | Boundaries realised in code (`src/lib/db/client.ts`, `src/lib/env/{public,server,mode}.ts`); `docs/architecture.md` not written |
| 04 | Supabase Foundation | Partial | 13 schemas, 6 extensions, `audit.events`, slug + updated_at helpers, env validation, three access modes — all applied and tested. Environment split into public/server/mode with a `server-only` boundary and validated `DATABASE_URL` (remediation Workstreams 1-2). Supabase CLI config, Edge Function scaffolding and typed client generation not done |
| 05 | Database Content Model | **Complete** | 8 `cms` tables + 6 `taxonomy` + 4 bibliographic `identity`; immutability trigger-enforced and proven by 10 tests; derived text generation working |
| 06 | Authentication and Authorization | Partial | 14 roles, 26 permissions, 59 grants, permission functions, self-elevation blocked, `accounts.profiles` + `external_identities` — all tested. Actual sign-in/session flow not implemented |
| 07 | RLS and Security | **Complete** | 118 policies across 65 tables; every exposed table has RLS and ≥1 policy; draft isolation, audit protection, subscription-based access all tested. `docs/rls.md` and `docs/threat-model.md` outstanding |
| 08 | Editorial Workflow | Partial | 8 `workflow` tables, 9 states, 19 transitions, DB-enforced transition guard and separation of duties. The atomic publication transaction is **not** implemented |
| 09 | Administrative Dashboard | Not started | — |
| 10 | Structured Editor | Not started | — |
| 11 | Public Experience | Partial | 17 public routes render server-side from live data with empty, degraded and tombstone states, over PostgREST or direct SQL. Read-only: no authoring, account or administrative surface |
| 12 | Design System | Partial | Full token system, dark scheme, focus and reduced-motion handling. Component library not extracted |
| 13 | Assets and Downloads | Partial | 7 `assets` tables, 5 buckets, policies, append-only download events. Signed URL issuance and upload validation not implemented |
| 14 | Newsletter Subscriptions | Partial | 7 `subscriptions` tables with hashed tokens, consent evidence, suppression, retry queue. No provider adapter or routes |
| 15 | Search and Retrieval | Partial | `search.documents` with generated weighted tsvector, chunks, pgvector embeddings, hybrid rank function, boosts/suppressions/zero-result. No query surface or embedding pipeline |
| 16 | Claims and Provenance | Partial | 9 `knowledge` tables; nine claim types with the five §45 evidence classes as a generated column; per-type constraints; traceability validator. Not yet wired to a publication gate |
| 17 | Citation and Authority | Not started | — |
| 18 | Public Knowledge API | Not started | — |
| 19 | Analytics and Observability | Partial | `analytics.events` append-only with six event families and retention policies. No instrumentation in the app |
| 20 | Accessibility | Partial | Semantic layout, skip link, focus indicator, reduced motion, dark scheme. **No automated or manual audit has been run** |
| 21 | SEO and Machine Discovery | Partial | Metadata and canonical base configured. No sitemaps, feeds, JSON-LD, alternates or `llms.txt` |
| 22 | Testing and Quality | Partial | 9 test files across unit/DB/RLS/conformance tiers, all passing. CI runs lint, types, lockfile consistency, unit tests, build, clean-database migrations, schema integrity, database and RLS suites, secret scan, dependency audit, bundle scan and conformance. No integration, E2E or accessibility tiers |
| 23 | Deployment and Operations | Not started | Scripts exist for local only |
| 24 | Documentation and Handoff | Partial | `assumptions`, `local-development`, this file. 20 further documents outstanding |
| 25 | Final Validation | Not started | — |
| 26 | Implementation Checklist | Not started | Contract installed; execution requires Blocks 22–25 |
| 27 | Security Hardening | Partial | Central security headers and a CSP without `unsafe-inline` for scripts, applied and verified over HTTP. Privileged access now requires actor, permission, operation and audit in one transaction, confined by a conformance rule (remediation Workstream 3). No rate limiting or upload controls |
| 28 | Google OAuth | Partial | `accounts.external_identities` with the uniqueness constraint, unwritable through the API, plus startup coherence validation. Flow not implemented |

## Verified Invariants

These were executed, not asserted, against a real PostgreSQL 16 cluster with pgvector
0.6.0. See the remediation report for current counts.

| Invariant | How it is proven |
|---|---|
| Published versions are immutable | 10 tests; asserted against the **superuser** connection, so it is an invariant rather than an access control |
| `audit.events` is append-only | Two independent controls: no UPDATE/DELETE policy, plus table triggers that reject both even for a `BYPASSRLS` role |
| Drafts are invisible to the public | Denial tests for version, modules, item, and full-table scans; verified again over HTTP against the running server |
| Self-elevation is impossible | Including for `user_administrator`, who cannot assign a role to themselves |
| External identities are API-unwritable | No INSERT/UPDATE/DELETE policy exists; absence is the control |
| Search respects permissions | Two layers: drafts cannot be indexed at all, and withdrawal removes a document from anonymous **counts**, not just pages |
| Every exposed table has RLS and a policy | Enumeration meta-test over all 11 schemas |
| Every SECURITY DEFINER function pins `search_path` | Meta-test over `pg_proc` |
| Every workflow transition is performable | Meta-test; guards the permission drift that migration 1400 fixed |

## Defects Found and Fixed During Implementation

Recorded because each was a real hole that testing caught, not a hypothetical.

1. **`audit.events` had no RLS enabled.** Created in the foundation migration without
   `ENABLE ROW LEVEL SECURITY`, leaving its policies inert and the audit log
   world-readable. Caught by the enumeration meta-test.
2. **`service_role` had no table grants.** `BYPASSRLS` exempts a role from policies but
   not from grants, so every privileged server-layer operation would have failed with
   "permission denied" despite the role being nominally privileged. Caught by a search
   leakage test.
3. **Three orphan permissions deadlocked the workflow.** `content.edit`,
   `content.schedule` and `content.submit_for_review` were required by transitions but
   held by no role, making those transitions permanently unperformable — silently.
   Fixed in migration 1400, with a meta-test to prevent recurrence.

## Foundation Remediation Pass

Targeted correction of foundational defects that would have compromised the next
implementation phase. Scope was deliberately limited: no new CMS features, no
authentication, no production hardening.

| Workstream | Outcome |
|---|---|
| 1 — Production database configuration | `DATABASE_URL` is the single canonical runtime variable. The unconditional localhost default is gone outside development and test. Staging and production reject local addresses, malformed URLs, development database names and placeholder credentials. `SUPABASE_DB_URL` was parsed but never used, and has been removed. `CRUX_ENV` now fails closed. |
| 2 — Server-only environment boundary | `src/lib/env.ts` split into `public.ts`, `server.ts` and `mode.ts`. The server module carries `import 'server-only'`, so importing it from a Client Component is a build error rather than a bundled module that throws at runtime. |
| 3 — Privileged database access | `asServiceRole` required only an eight-character reason. It now requires actor, permission, operation, resource, request id and reason; performs the permission check, the operation and the audit write in one transaction; rolls back if authorization or the audit write fails; and records refusals on a separate connection so they survive the rollback. A conformance rule confines it to `src/lib/db/`. |
| 4 — CI baseline | Added lockfile consistency, a database-free unit test stage, and per-job least-privilege permissions. Actions remain tag-pinned — see known limitations. |
| 5 — Documentation reconciliation | README rewritten. It previously described `/admin` as "an operating tool, not a demonstration" while `/admin` did not exist, and simultaneously claimed implementation had not begun. |

## Content Corpus Initialization

A validation corpus of fourteen Crucible Insight research documents (fifteen uploads,
one exact duplicate) was analysed on 31 July 2026. The analysis and its eleven
deliverables are in [`docs/corpus/`](corpus/README.md).

**Nothing was imported and no schema was changed.** The corpus was read from the
upload directory; the database-infrastructure freeze remains in force.

What it established:

| | |
|---|---|
| The content model holds | Typed modules, stable fragments, immutable versions, nine claim types and the declared state machine all survive contact with real documents. Thirteen structural properties map to existing schema elements without change. |
| Eight schema recommendations | Two are module-catalogue rows; five are additive; one relaxes a `NOT NULL` behind an XOR check. All eight are demonstrated by named documents. See [corpus/02](corpus/02-schema-validation.md) §2.6. |
| Three gates block the whole corpus, correctly | `methodology_present` and `limitations_present` refuse all fourteen (no document has either section); `separation_of_duties` cannot be satisfied while the organisation has one identifiable person. None of the three is wrong. See [corpus/06](corpus/06-workflow-validation.md). |
| The expensive part is editorial, not engineering | Over 300 source entries corpus-wide and an estimated 40–80 claims per document. Full ingestion is a multi-week editorial programme. |
| Seven decisions block the next step | Recorded as Band 0 of [corpus/09](corpus/09-product-backlog.md); six of them need the client. |

The recommended first document to publish end-to-end is the Sensor Fusion white paper
([corpus/11](corpus/11-implementation-sequence.md) §3).

## Next Steps, in Dependency Order

1. **Block 08** — the atomic publication transaction. Everything downstream depends on
   publication being a single all-or-nothing operation.
2. **Block 06** — the actual authentication flow against the role model that exists.
3. **Block 09/10** — the administrative surface and structured editor.
4. **Block 11** — the remaining public surfaces, especially the report reading path.
5. **Block 22/20** — integration, E2E and accessibility tiers, and CI.

The corpus analysis does not change this order. It supplies the content that makes
steps 2–4 demonstrable, and the Band 0 decisions that must be settled alongside them.
