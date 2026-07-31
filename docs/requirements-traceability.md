# Crux Requirements Traceability

This register maps every high-level platform requirement to its owning block, its
implementation, its tests, and its verification evidence.

Block 02 expands these seeded requirements into the full, uniquely identified
requirement set. Every block updates the rows it touches on completion. Block 24
reconciles the register; any row still unmet at that point moves to
`docs/known-limitations.md` with its impact.

## Status Vocabulary

| Status | Meaning |
|---|---|
| Not started | No implementation exists. |
| In progress | Implementation begun, acceptance not yet verified. |
| Implemented | Code exists, verification pending. |
| Verified | Acceptance criteria executed and passed, with evidence recorded. |
| Deferred | Explicitly moved out of scope, recorded in known limitations. |

## Seeded Requirements

| Requirement ID | Functional domain | Source block | Requirement | Priority | Implementation status | Implementation files | Test coverage | Verification evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| REQ-CMS-001 | Content management | 04, 05 | The CMS is Supabase-native: content, workflow, and assets are stored and governed in the project's own PostgreSQL and Storage. | Must | Not started | — | — | — | Owned by Supabase Architect |
| REQ-CMS-002 | Content management | 03, 04 | No paid or proprietary CMS product or component suite is introduced as a dependency. | Must | Not started | — | — | — | Verified at dependency review |
| REQ-ADM-001 | Administration | 09 | A functional `/admin` dashboard exists in which all nineteen surfaces operate on live queried data. | Must | Not started | — | — | — | No hard-coded metrics permitted |
| REQ-ADM-002 | Administration | 09 | Every administrative mutation re-verifies permission server-side and writes an audit row. | Must | Not started | — | — | — | Denial tests mandatory |
| REQ-CNT-001 | Content model | 05 | Content is stored as typed, ordered, schema-validated modules; no opaque full-document HTML. | Must | Not started | — | — | — | |
| REQ-CNT-002 | Content model | 05 | Published versions are immutable, enforced by database trigger. | Must | Not started | — | — | — | Final completion control 3 |
| REQ-CNT-003 | Content model | 05 | Every content item and published version has a permanent, never-reused identifier; every module has a stable fragment identifier. | Must | Not started | — | — | — | Final completion control 5 |
| REQ-CNT-004 | Content model | 05, 08 | Corrections, supersession, and withdrawal are modelled; superseded versions remain resolvable and withdrawn items serve a tombstone retaining the citation record. | Must | Not started | — | — | — | |
| REQ-WKF-001 | Editorial workflow | 08 | Workflow states and transitions are registry-driven; transitions occur only through validated functions. | Must | Not started | — | — | — | Final completion control 6 |
| REQ-WKF-002 | Editorial workflow | 08 | Publication is a single atomic transaction; partial publication is impossible. | Must | Not started | — | — | — | Proven by injected-failure test |
| REQ-WKF-003 | Editorial workflow | 06, 08 | Separation of duties is database-enforced: no self-review, no self-approval, no self-publication. | Must | Not started | — | — | — | |
| REQ-SEC-001 | Security | 07 | RLS is enabled and forced on every table in every exposed schema, with explicit per-operation policies. | Must | Not started | — | — | — | Final completion control 1 |
| REQ-SEC-002 | Security | 06 | Authentication uses Supabase Auth with email verification, secure recovery, and session invalidation on credential change. | Must | Not started | — | — | — | |
| REQ-SEC-003 | Security | 06 | Fourteen named roles exist with granular, database-backed permissions; self-elevation is structurally impossible. | Must | Not started | — | — | — | |
| REQ-SEC-004 | Security | 28 | Google OAuth account linking is deterministic, auditable, and cannot produce a duplicate or hijacked account. | Must | Not started | — | — | — | Client secret server-side only |
| REQ-SEC-005 | Security | 07, 11, 13, 15, 18, 21 | Private and draft content remains private across every surface: query, listing, count, facet, snippet, storage, API, and sitemap. | Must | Not started | — | — | — | Final completion control 9 |
| REQ-SEC-006 | Security | 27 | Application hardening is in place: headers, CSP, rate limiting, upload controls, session policy, and lockout. | Must | Not started | — | — | — | |
| REQ-DWN-001 | Downloads | 13 | Private reports and datasets are delivered only by short-lived signed URL after a server-side entitlement check. | Must | Not started | — | — | — | |
| REQ-DWN-002 | Downloads | 13 | Every download issuance is recorded with actor, asset version, and entitlement basis. | Must | Not started | — | — | — | Append-only |
| REQ-NWS-001 | Newsletter | 14 | Newsletter subscription uses double opt-in with durable consent records and immediate one-click unsubscribe. | Must | Not started | — | — | — | |
| REQ-NWS-002 | Newsletter | 14 | Subscribers manage newsletter, topic, and frequency preferences without requiring a platform account. | Must | Not started | — | — | — | |
| REQ-SRH-001 | Search | 15 | PostgreSQL full-text search with weighted tsvector is operational across published content. | Must | Not started | — | — | — | |
| REQ-SRH-002 | Search | 15 | Semantic search over chunks, claims, and findings is operational via pgvector. | Must | Not started | — | — | — | |
| REQ-SRH-003 | Search | 15 | Retrieval is permission-aware: filtering occurs inside the query, and restricted content is absent from results, counts, facets, and snippets. | Must | Not started | — | — | — | Final completion control 4 |
| REQ-PRV-001 | Provenance | 16 | Nine `knowledge` tables exist; nine claim types are enforced by constraint, each mapping to exactly one of the five §45 evidence classes by a database-enforced mapping. | Must | Not started | — | — | — | Mapping must not be application-side |
| REQ-PRV-003 | Provenance | 05, 08, 16 | Claim-to-source linkage is enforced per the minimum evidence standard declared on the content type; no high-confidence claim publishes without a resolvable source or analysis run. | Must | Not started | — | — | — | §45.1.7 |
| REQ-SEC-007 | Security | 07 | Subscription-gated content is readable only with an active entitlement, evaluated inside the RLS policy. | Must | Not started | — | — | — | §45.1.11 policy class |
| REQ-SEC-008 | Security | 06 | JWT is validated server-side on every server action and Edge Function; expired tokens are rejected outright. | Must | Not started | — | — | — | §45.2.4 |
| REQ-DEP-004 | Deployment | 23 | The staging promotion sequence is gated: migrate → schema integrity → RLS suite → production. | Must | Not started | — | — | — | §45.5.3 |
| REQ-DEP-005 | Deployment | 23 | Post-deployment validation covers RLS, audit logging, the embedding pipeline, and the four end-to-end journeys on the deployed environment. | Must | Not started | — | — | — | §45.5.5 |
| REQ-PRV-002 | Provenance | 16 | Quantitative findings and data figures are traceable to analysis runs, dataset versions, and variables. | Must | Not started | — | — | — | Final completion control 8 |
| REQ-CIT-001 | Citations | 17 | Citations are version-aware and resolve to the exact version cited after supersession. | Must | Not started | — | — | — | |
| REQ-CIT-002 | Citations | 17 | Citation export works in APA, MLA, Chicago, BibTeX, and RIS. | Must | Not started | — | — | — | Final completion control 7; the five §45.3.4 formats, non-deferrable |
| REQ-CIT-004 | Citations | 17 | Citation export additionally works in plain text, Harvard, and CSL-JSON. | Should | Not started | — | — | — | Retained superset; deferrable only as a recorded Deferred row |
| REQ-CIT-003 | Citations | 17 | No citation field is fabricated when source data is absent; the field is omitted. | Must | Not started | — | — | — | |
| REQ-API-001 | Public API | 18 | A read-only, path-versioned public API serves content, sections, claims, references, citations, authors, taxonomy, and datasets. | Must | Not started | — | — | — | No write methods anywhere |
| REQ-API-002 | Public API | 18 | Every response carries canonical URL and licence metadata, with ETag and Last-Modified support. | Must | Not started | — | — | — | |
| REQ-PUB-001 | Public experience | 11 | Report and article bodies render as server-side semantic HTML, complete without client JavaScript. | Must | Not started | — | — | — | |
| REQ-DIS-001 | Machine discovery | 21 | Sitemaps, RSS, Atom, JSON-LD, and alternate Markdown and JSON representations are generated from published data and validate. | Must | Not started | — | — | — | |
| REQ-DIS-002 | Machine discovery | 21 | `llms.txt` and a research corpus manifest exist, contain only published HTML content, and involve no cloaking or machine-only claims. | Must | Not started | — | — | — | |
| REQ-DIS-003 | Machine discovery | 17, 21 | Documentation states explicitly that technical controls cannot guarantee citation by an external LLM. | Must | Not started | — | — | — | Honesty control |
| REQ-ACC-001 | Accessibility | 20 | Every public and administrative surface meets WCAG 2.2 Level AA, verified by automated and recorded manual assessment. | Must | Not started | — | — | — | |
| REQ-ACC-002 | Accessibility | 10, 20 | The structured editor is fully operable by keyboard alone, with managed focus and announced state. | Must | Not started | — | — | — | |
| REQ-AUD-001 | Audit | 06, 07, 08, 09 | Every privileged operation writes an append-only audit row that no role may update or delete. | Must | Not started | — | — | — | Final completion control 2 |
| REQ-TST-001 | Testing | 22 | All ten test tiers exist and pass, with mandatory denied-access coverage for every authorization boundary. | Must | Not started | — | — | — | |
| REQ-TST-002 | Testing | 22 | Build gates fail on type errors, lint errors, build failure, detected secrets, dependency findings above threshold, accessibility failures, and ranking regressions. | Must | Not started | — | — | — | |
| REQ-DEP-001 | Deployment | 23 | Four environments are reproducible; staging deploys automatically and production requires explicit human approval. | Must | Not started | — | — | — | |
| REQ-DEP-002 | Deployment | 04, 23 | Backup, restore, and rollback are implemented and rehearsed, with recovery time recorded. The retention policy is defined at project setup (§45.1.1). | Must | Not started | — | — | — | Final completion control 10 |
| REQ-DEP-003 | Deployment | 23, 28 | OAuth environment variables are validated at startup and deployment; a mismatch fails the deployment. | Must | Not started | — | — | — | |
| REQ-OBS-001 | Observability | 19 | Six event families are instrumented with structured logging, request identifiers, and centralised redaction. | Must | Not started | — | — | — | No secret ever logged |

## Coverage Summary

| Metric | Value |
|---|---|
| Seeded requirements | 50 |
| Must-requirements | 49 |
| Should-requirements | 1 |
| Verified | 0 |
| Implemented, pending verification | 0 |
| Not started | 50 |
| Deferred | 0 |

Seven rows were added by the Section 45 reconciliation on 2026-07-31: REQ-CIT-004,
REQ-PRV-003, REQ-SEC-007, REQ-SEC-008, REQ-DEP-004, REQ-DEP-005, and the REQ-CIT-002
split.

Block 02 will expand this register. Block 22 adds the meta-test asserting every
Must-requirement links to at least one test.
