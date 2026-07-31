# Block 26 — Final Implementation Checklist

## Objective

Provide the terminal sign-off checklist for Crux. Every item is confirmed by recorded
evidence from Block 25 or by execution during this block. No item is confirmed by
recollection.

## Scope

### In scope

- Executing the checklist below and recording its outcome.
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

## Source Note

The approved architecture referenced a final "Section 45" checklist. The verbatim
text of that section was not supplied to the installing session. This block is
constructed from the approved checklist **coverage areas** and the approved **final
completion controls**, both of which were supplied. If the verbatim Section 45 text
is later provided, reconcile this file against it and record any difference in
`docs/architecture-installation-report.md`.

## Functional Requirements

Confirm each item with an evidence reference.

### Database

- [ ] All thirteen schemas exist as specified.
- [ ] All required extensions are installed and version-recorded.
- [ ] All `cms`, `taxonomy`, `identity`, `workflow`, `assets`, `knowledge`, `search`,
      `accounts`, `subscriptions`, `analytics`, and `audit` tables exist as specified.
- [ ] Foreign keys, check constraints, and unique constraints are in place.
- [ ] Indexes exist for every documented access path.
- [ ] Migrations apply cleanly to an empty database and are documented as reversible.
- [ ] Seeds are deterministic and contain no real personal data.

### Authentication

- [ ] Email and password authentication works, with verification and recovery.
- [ ] Google OAuth sign-in and account linking work.
- [ ] Sessions are issued, refreshed, revoked, and invalidated on password change.
- [ ] Account lockout and rate limiting are active.

### Authorization

- [ ] All fourteen roles exist.
- [ ] Permissions are granular and role-mapped.
- [ ] Authorization is database-backed and enforced server-side.
- [ ] Separation of duties is enforced and tested.
- [ ] Self-elevation is impossible.

### Backend

- [ ] Input is validated on every mutation.
- [ ] Request identifiers propagate and are returned.
- [ ] Structured logging is in place with redaction.
- [ ] The publication transaction is atomic.
- [ ] Queues retry with backoff and dead-letter correctly.
- [ ] Errors are sanitised and never leak internals.

### Frontend

- [ ] Report and article bodies are server-rendered semantic HTML.
- [ ] Every administrative surface operates on live data.
- [ ] The structured editor is fully keyboard-operable.
- [ ] Loading, empty, success, and failure states exist everywhere.
- [ ] No secret is present in any client bundle.

### Search

- [ ] Full-text search with weighted tsvector is operational.
- [ ] Semantic search over chunks, claims, and findings is operational.
- [ ] Hybrid ranking is documented and tunable.
- [ ] Ranking tests meet the recorded threshold.
- [ ] Synonyms, boosts, and suppressions are administrable.

### Citations

- [ ] Stable item and version identifiers are permanent.
- [ ] Version-aware citation resolution works after supersession.
- [ ] All eight citation formats render and validate.
- [ ] Correction and withdrawal notices appear in the citation record.
- [ ] No citation field is fabricated when data is absent.
- [ ] The documentation states that technical controls cannot guarantee LLM citation.

### Provenance

- [ ] All nine `knowledge` tables exist.
- [ ] All nine claim types are enforced.
- [ ] Quantitative findings resolve to analysis runs, datasets, and variables.
- [ ] Data figures resolve through `figure_provenance`.
- [ ] Dataset versions referenced by published content are immutable.

### Audit

- [ ] Every privileged operation writes an audit row.
- [ ] Audit tables are append-only and resist update and deletion.
- [ ] Audit access is restricted to designated administrative roles.
- [ ] The audit viewer is operational and read-only.

### Storage

- [ ] Public, private, and quarantine buckets exist with correct policies.
- [ ] Uploads are validated by file signature and checksummed.
- [ ] Asset versioning preserves published references.
- [ ] Private objects are reachable only by short-lived signed URL.
- [ ] Entitlements are evaluated server-side before issuance.

### RLS

- [ ] RLS is enabled and forced on every table in every exposed schema.
- [ ] Every relation has explicit per-operation policies.
- [ ] Draft content is unreachable by anonymous and registered users.
- [ ] Search and embedding rows enforce source visibility.
- [ ] Denied-access tests exist for every boundary and pass.
- [ ] The enumeration test catching unprotected new tables passes.

### Deployment

- [ ] CI runs every gate on every pull request.
- [ ] Staging deploys automatically; production requires explicit approval.
- [ ] Migrations are rehearsed on staging.
- [ ] Backups run and are monitored.
- [ ] A restore has been rehearsed with recovery time recorded.
- [ ] Rollback has been rehearsed.
- [ ] OAuth environment validation fails deployment on a mismatch.
- [ ] No secret exists in the repository, build logs, or client bundles.

### Post-deployment validation

- [ ] Health and readiness endpoints respond correctly.
- [ ] Smoke tests pass: sign-in, public report, search, download, citation export.
- [ ] Monitoring and alerting are receiving signals.
- [ ] Scheduled jobs run within their expected windows.
- [ ] Error monitoring receives events with release identifiers.
- [ ] Accessibility smoke check passes on the deployed environment.

## Final Completion Controls

These ten controls are the terminal gate. Every one must be true, with evidence.
Release is not recommended if any is false.

1. **RLS is enforced everywhere.**
2. **Audit logging is active.**
3. **Published versions are immutable.**
4. **Search respects permissions.**
5. **Versioning is enforced.**
6. **Administrative workflows are operational.**
7. **Citation exports work.**
8. **Provenance is traceable.**
9. **Private content remains private.**
10. **Production validation passes.**

## Technical Requirements

- Each item cites its evidence: a test identifier, a validation report area, or a
  command output.
- An item that cannot be evidenced is marked failed, not deferred.

## Data Requirements

The checklist result is recorded in the repository and referenced from
`docs/implementation-status.md`.

## Security Requirements

A failing security item is a release blocker and may not be waived by this block. The
`database-security-reviewer` confirms the RLS, audit, storage, and authorization
sections; the implementing agent may not self-confirm them.

## Accessibility Requirements

The accessibility items are confirmed by `accessibility-reviewer` against the Block 25
re-verification, not against the earlier Block 20 record.

## Testing Requirements

The full Block 22 suite must be green at the time the checklist is signed. A checklist
signed against a stale test run is invalid.

## Documentation Requirements

`docs/final-implementation-checklist.md` records every item, its state, its evidence
reference, the confirming reviewer where required, and the date.

## Acceptance Criteria

- [ ] Every checklist item is marked with an evidence reference.
- [ ] All ten final completion controls are true and evidenced.
- [ ] Security items are confirmed by the independent reviewer.
- [ ] Accessibility items are confirmed against the Block 25 re-verification.
- [ ] The test suite was green at signing time.
- [ ] No item was waived without an explicit, recorded acceptance by the user.

## Completion Report

Report: items passed, items failed with their owning block, the state of each of the
ten final completion controls, independent reviewer confirmations, the test suite
state at signing, any accepted waiver with its authorisation, and the explicit
release recommendation.
