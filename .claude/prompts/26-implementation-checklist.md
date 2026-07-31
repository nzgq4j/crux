# Block 26 — Final Implementation Checklist

## Objective

Execute the approved Section 45 implementation checklist as the terminal sign-off for
Crux. Every item is confirmed by recorded evidence from Block 25 or by execution
during this block. No item is confirmed by recollection.

## Scope

### In scope

- Executing the five-phase Section 45 checklist below and recording its outcome.
- The final completion controls that gate release.

### Out of scope

- Any implementation or remediation. A failing item returns to its owning block.

## Dependencies

Block 25.

## Required Inputs

- `docs/final-validation-report.md`.
- `docs/implementation-status.md`, `docs/requirements-traceability.md`.
- `.claude/architecture-manifest.md`.

## Required Outputs

- `docs/final-implementation-checklist.md` with each item marked and evidenced.
- The final release recommendation.

## Source

This block installs the approved **Section 45: Implementation Checklist (Final
Section)** verbatim in structure and content, reorganised only to carry evidence
references alongside each item. The Section 45 numbering (45.1 through 45.5, and each
45.x.y subsection) is preserved so the checklist can be cross-referenced against the
master architecture.

Four supersets are retained deliberately, and are marked where they occur. None
weakens a Section 45 requirement:

1. **Completion controls** — Section 45's six, plus four from the approved block
   architecture, giving ten.
2. **Citation formats** — Section 45's five, plus three, giving eight. Only the five
   are non-deferrable.
3. **Storage buckets** — Section 45's four, plus `quarantine`, which the Block 13
   upload-validation pipeline requires.
4. **Federated identity** — Section 45.2 specifies email/password authentication only.
   Block 28 adds Google OAuth as an additive path. It is checked at 45.2.5 below,
   marked as a retained superset, and is not a Section 45 requirement.

## Execution Rule

**The checklist is executed sequentially. Each phase must be validated before
proceeding to the next.** A phase with a failing item does not pass; its items return
to the owning block, and the phase is re-validated in full after remediation. Phases
may not be run out of order to make progress on a later one.

## Functional Requirements

Confirm each item with an evidence reference.

---

## 45.1 — Database Implementation

### 45.1.1 Supabase project setup

- [ ] Supabase project created
- [ ] Project region and dev/staging/prod environment separation configured
- [ ] Extensions enabled: `pgvector`, `pgcrypto`, `uuid-ossp`
- [ ] Connection pooling configured (PgBouncer or Supabase pooling)
- [ ] RLS enabled globally by default
- [ ] Database backup and retention policy defined

### 45.1.2 Schema creation

- [ ] All schemas present: `auth` *(Supabase-managed — verified present, not created)*,
      `public`, `cms`, `taxonomy`, `identity`,
      `workflow`, `assets`, `knowledge`, `search`, `accounts`, `subscriptions`,
      `analytics`, `audit`, `private`
- [ ] **Validation:** no public exposure of the `private` schema
- [ ] **Validation:** RLS enabled on all non-system schemas

### 45.1.3 Core CMS tables

- [ ] `cms.content_items`, `cms.content_versions`, `cms.content_modules`,
      `cms.content_version_modules` created
- [ ] Immutable published versions enforced by DB constraint or trigger
- [ ] Foreign keys: `content_items` → `content_versions`, `content_versions` →
      `content_modules`
- [ ] Unique stable content identifiers
- [ ] Slug uniqueness per locale where applicable
- [ ] **Validation:** version immutability enforced
- [ ] **Validation:** no direct overwrite of published content

### 45.1.4 Taxonomy system

- [ ] `taxonomy.vocabularies`, `taxonomy.terms`, `taxonomy.term_relationships`,
      `taxonomy.content_terms`, `taxonomy.synonyms`, `taxonomy.external_mappings`
      created
- [ ] Controlled vocabulary enforcement
- [ ] Term hierarchy (broader/narrower)
- [ ] Synonym resolution layer
- [ ] Term merge and redirect logic
- [ ] Orphan term detection
- [ ] **Validation:** no free-text taxonomy assignment in production tables

### 45.1.5 Identity and roles

- [ ] `accounts.profiles`, `identity.roles`, `identity.permissions`,
      `identity.user_roles`, `identity.role_permissions` created
- [ ] Default roles seeded
- [ ] Default permission matrix seeded
- [ ] Separation of duties: author ≠ publisher, reviewer ≠ final approver
- [ ] DB-backed role resolution only; no client trust
- [ ] **Validation:** role escalation impossible via client manipulation

### 45.1.6 Workflow engine

- [ ] `workflow.states`, `workflow.transitions`, `workflow.content_state`,
      `workflow.assignments`, `workflow.reviews` created
- [ ] State machine constraints enforced in the database
- [ ] Transition validation rules
- [ ] Required review gates per content type
- [ ] Audit-linked state transitions
- [ ] **Validation:** invalid state transitions blocked at DB level

### 45.1.7 Knowledge graph (claims and provenance)

- [ ] `knowledge.claims`, `knowledge.sources`, `knowledge.claim_sources` created
- [ ] Dataset tables created as defined in Block 16
- [ ] Claim-to-source linkage enforced, configurable per content type
- [ ] Evidence classification exposed as the five §45 classes — observed, derived,
      interpretive, forecast, recommendation — derived from the nine storage claim
      types by the Block 16 mapping, implemented in the database so the two cannot
      drift
- [ ] Source traceability required for quantitative claims
- [ ] **Validation:** no orphaned high-confidence claims in published content

### 45.1.8 Search system

- [ ] PostgreSQL full-text search (`tsvector`) enabled
- [ ] Weighted search fields
- [ ] `search.documents` table created
- [ ] pgvector embeddings stored
- [ ] Hybrid ranking function: lexical score, vector similarity, taxonomy match,
      recency, editorial boost
- [ ] RLS-aware filtering in all search queries
- [ ] **Validation:** search never returns unauthorized content

### 45.1.9 Audit system

- [ ] `audit.events` created, append-only
- [ ] DB triggers for content changes, workflow transitions, role changes, and
      publication events
- [ ] Immutable audit enforcement — no UPDATE, no DELETE
- [ ] **Validation:** audit table is write-only

### 45.1.10 Storage system

- [ ] Buckets created: `public-images`, `private-reports`, `datasets`, `avatars`,
      plus `quarantine` *(retained addition — see Source)*
- [ ] Signed URL generation for private assets
- [ ] MIME validation
- [ ] Checksum storage
- [ ] File versioning metadata
- [ ] **Validation:** no direct public access to private buckets

### 45.1.11 Row-Level Security

- [ ] RLS enabled on **all** tables
- [ ] Policies: public read of published content only
- [ ] Policies: draft isolation
- [ ] Policies: ownership-based access
- [ ] Policies: role-based editorial access
- [ ] Policies: asset access control
- [ ] Policies: subscription-based access
- [ ] Test cases executed: anonymous, authenticated, admin, and **denied access
      (must fail explicitly)**
- [ ] **Validation:** no table accessible without an explicit policy

### 45.1.12 Database functions and triggers

- [ ] Versioning triggers
- [ ] Audit triggers
- [ ] Search vector update triggers
- [ ] Slug generation functions
- [ ] Publication transaction function
- [ ] Deterministic logic only
- [ ] No external API calls inside the database
- [ ] No hidden business-logic complexity: each trigger performs one clearly named
      responsibility, and consequential business behaviour is not buried where a
      reader of the application code cannot see it
- [ ] **Validation:** all triggers documented and reversible

**Phase 45.1 validated before proceeding:** ☐

---

## 45.2 — Authentication and Authorization

### 45.2.1 Supabase Auth setup

- [ ] Email/password authentication enabled
- [ ] JWT expiration configured
- [ ] Email verification enabled
- [ ] Session management configured
- [ ] Optional MFA support or a documented extension point
- [ ] **Validation:** secure session cookies enforced

### 45.2.2 Role system implementation

- [ ] Roles seeded in `identity.roles`
- [ ] Permissions mapped in `identity.role_permissions`
- [ ] User-role mapping implemented
- [ ] Database is the source of truth
- [ ] **Validation:** no role stored only in frontend state

### 45.2.3 Permission engine

- [ ] Server-side resolver mapping permissions to content, taxonomy, asset, and
      admin actions
- [ ] Separation of duties enforced
- [ ] Least privilege enforced
- [ ] **Validation:** no client-side permission enforcement

### 45.2.4 Auth security rules

- [ ] JWT validated on all server actions
- [ ] Expired tokens rejected
- [ ] Client role claims never trusted
- [ ] DB-based authorization enforced
- [ ] **Validation:** all privileged actions require server verification

### 45.2.5 Federated identity *(retained superset — Block 28, not required by §45)*

- [ ] Google OAuth via Supabase Auth; no bespoke OAuth client
- [ ] `accounts.external_identities` unique on provider plus subject identifier
- [ ] Every branch of the linking decision procedure implemented and tested
- [ ] An unverified provider email neither links nor creates an account
- [ ] Linking never alters an existing user's roles
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` absent from all client output, proven by test

**Phase 45.2 validated before proceeding:** ☐

---

## 45.3 — Backend Implementation

### 45.3.1 Next.js server layer

- [ ] Server actions for content creation, content updates, publishing, and workflow
      transitions
- [ ] Zod validation enforced
- [ ] Request ID tracking
- [ ] Structured logging

### 45.3.2 Edge Functions

- [ ] Embedding generation
- [ ] Email sending
- [ ] Webhook processing
- [ ] Signed download generation
- [ ] Scheduled publishing
- [ ] Each enforces authentication, authorization, input validation, and audit
      logging

### 45.3.3 Search pipeline

- [ ] Content chunked to embeddings
- [ ] Embedding metadata stored
- [ ] Hybrid search function built
- [ ] RLS filtering enforced
- [ ] **Validation:** no leakage of private embeddings

### 45.3.4 Citation system

- [ ] APA, MLA, Chicago, BibTeX, RIS generated *(required by §45)*
- [ ] Plain text, Harvard, CSL-JSON generated *(retained superset — deferrable only
      with a recorded limitation)*
- [ ] Version-aware citations
- [ ] Stable identifiers

### 45.3.5 Provenance system

- [ ] Claim linking, UI and backend
- [ ] Dataset lineage tracking
- [ ] Figure provenance metadata
- [ ] **Validation:** every published figure has a traceable origin

### 45.3.6 Audit system integration

- [ ] All privileged actions logged
- [ ] Each entry records actor, action, resource, and decision
- [ ] Immutability ensured

**Phase 45.3 validated before proceeding:** ☐

---

## 45.4 — Frontend Implementation

### 45.4.1 Public application

- [ ] Articles, reports, datasets, and author pages built
- [ ] Semantic HTML
- [ ] Stable fragment navigation
- [ ] Citation UI
- [ ] Download UI

### 45.4.2 Admin application (`/admin`)

- [ ] Content library
- [ ] Structured editor
- [ ] Workflow dashboard
- [ ] Taxonomy manager
- [ ] Asset manager
- [ ] Audit viewer
- [ ] **Validation:** role-aware UI enforced

### 45.4.3 Structured editor

- [ ] Claims, citations, figures, and tables supported
- [ ] Autosave
- [ ] Versioning
- [ ] Validation panel

### 45.4.4 Search UI

- [ ] Full-text search
- [ ] Filters
- [ ] Ranking display
- [ ] Permission-safe results

### 45.4.5 Accessibility

- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Semantic HTML
- [ ] Automated accessibility tests

**Phase 45.4 validated before proceeding:** ☐

---

## 45.5 — Deployment

### 45.5.1 Environment setup

- [ ] Supabase URL configured
- [ ] Anon / publishable key configured
- [ ] Service role / secret key configured, **server only**
- [ ] Embedding API keys configured
- [ ] Email provider keys configured
- [ ] **Validation:** no secrets in the frontend bundle

### 45.5.2 CI/CD pipeline

- [ ] Lint
- [ ] Typecheck
- [ ] Unit tests
- [ ] Integration tests
- [ ] Migration step
- [ ] Deployment step

### 45.5.3 Database migrations

- [ ] Run in staging
- [ ] Schema integrity validated
- [ ] RLS test suite run
- [ ] Promoted to production

### 45.5.4 Production deployment

- [ ] Next.js app deployed
- [ ] Edge Functions deployed
- [ ] Auth flow verified
- [ ] Publishing verified
- [ ] Search verified
- [ ] Storage access verified

### 45.5.5 Post-deployment validation

- [ ] End-to-end: draft → publish
- [ ] End-to-end: search flow
- [ ] End-to-end: citation export
- [ ] End-to-end: download flow
- [ ] RLS enforcement validated
- [ ] Audit logging validated
- [ ] Embedding pipeline validated
- [ ] Logs, errors, and performance metrics monitored

**Phase 45.5 validated:** ☐

---

## Final Completion Controls

Section 45's closing note defines six controls. The approved block architecture adds
four more. All ten are the terminal gate: every one must be true, with evidence.
Release is not recommended if any is false.

**Section 45 core six:**

1. **RLS is enforced everywhere.**
2. **Audit logging is active.**
3. **The publication pipeline is immutable.**
4. **Search respects permissions.**
5. **Content versioning is enforced.**
6. **Administrative workflows are fully operational.**

**Additional four, retained from the block architecture:**

7. **Citation exports work.**
8. **Provenance is traceable.**
9. **Private content remains private.**
10. **Production validation passes.**

Every item in this checklist is required for production readiness unless explicitly
marked optional in an earlier block.

## Technical Requirements

- Each item cites its evidence: a test identifier, a validation report area, or a
  command output.
- An item that cannot be evidenced is marked failed, not deferred.
- Phase gates are recorded with the date and the confirming agent.

## Data Requirements

The checklist result is recorded in the repository and referenced from
`docs/implementation-status.md`.

## Security Requirements

A failing security item is a release blocker and may not be waived by this block. The
`database-security-reviewer` confirms phases 45.1.11, 45.1.9, 45.1.10, 45.2, and
45.5.1; the implementing agent may not self-confirm them.

## Accessibility Requirements

Phase 45.4.5 is confirmed by `accessibility-reviewer` against the Block 25
re-verification, not against the earlier Block 20 record.

## Testing Requirements

The full Block 22 suite must be green at the time the checklist is signed. A checklist
signed against a stale test run is invalid.

## Documentation Requirements

`docs/final-implementation-checklist.md` records every item, its state, its evidence
reference, the confirming reviewer where required, the phase-gate dates, and the
signing date.

## Acceptance Criteria

- [ ] All five phases executed in order, each validated before the next began.
- [ ] Every checklist item is marked with an evidence reference.
- [ ] All ten final completion controls are true and evidenced.
- [ ] Security items are confirmed by the independent reviewer.
- [ ] Accessibility items are confirmed against the Block 25 re-verification.
- [ ] The test suite was green at signing time.
- [ ] No item was waived without an explicit, recorded acceptance by the user.

## Completion Report

Report: phases completed with their gate dates, items passed, items failed with their
owning block, the state of each of the ten final completion controls, independent
reviewer confirmations, the test suite state at signing, any accepted waiver with its
authorisation, and the explicit release recommendation.
