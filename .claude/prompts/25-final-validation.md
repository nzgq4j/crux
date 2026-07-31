# Block 25 — Final Validation

## Objective

Independently verify, by execution rather than by inspection, that every capability
of the Crux platform works end to end before the implementation checklist in
Block 26 is signed.

## Scope

### In scope

- Executing and recording the twenty-four validation areas below.
- Producing the validation record with evidence.

### Out of scope

- Fixing defects found. Defects are routed back to their owning block for
  remediation; this block re-validates after the fix.

## Dependencies

Blocks 22, 23, 24.

## Required Inputs

- The complete implementation on a release candidate build.
- `docs/implementation-status.md`, `docs/requirements-traceability.md`, `docs/testing.md`.
- Every block's acceptance criteria.

## Required Outputs

- `docs/final-validation-report.md` with per-area evidence.
- Defect records for every failure, referred to the owning block.
- Updated status and traceability registers.

## Functional Requirements

Execute and record evidence for each. "Verified" means executed in this validation
pass, not inherited from an earlier block's report.

1. **Local startup** — clean checkout to running application, following only the
   documentation.
2. **Reset and seed** — database reset and seed produce the documented fixture state.
3. **Authentication** — registration, verification, sign-in, sign-out, password
   recovery, and Google OAuth sign-in and linking.
4. **Authorization** — each role reaches exactly its permitted surfaces; each denied
   surface returns a denial.
5. **Administrative access** — every administrative surface loads with live data for
   an authorised role and is denied to an unauthorised one.
6. **Content creation** — a draft is created and authored with structured modules,
   claims, citations, a figure with alternative text, and a table with headers.
7. **Review** — assignment, review with criteria, comments, and changes requested.
8. **Publication** — gates enforced, publication transaction atomic, version
   immutable afterwards, canonical URL live.
9. **Correction** — a correction produces a superseding version with a public
   correction notice, and the corrected version remains resolvable.
10. **Withdrawal** — a withdrawal produces a tombstone retaining the citation record
    and removes the item from listings, sitemaps, and feeds.
11. **Search** — lexical and semantic retrieval return relevant results; permission
    filtering excludes restricted content from results, counts, and facets.
12. **Embeddings** — the embedding queue processes new publications and re-embeds on
    correction.
13. **Downloads** — entitled download succeeds via signed URL; unentitled download is
    refused; the signed URL expires; download history records the event.
14. **Newsletter** — double opt-in, confirmation, preference change, unsubscribe, and
    suppression all behave correctly.
15. **Citations** — all eight formats render correctly for a current, a corrected, a
    superseded, and a withdrawn version.
16. **API** — every endpoint responds correctly, conditional requests return 304,
    rate limiting engages, and no draft or private data is reachable.
17. **Structured data** — JSON-LD validates for every content type.
18. **Sitemaps** — index and child sitemaps validate and exclude non-public content.
19. **Feeds** — RSS and Atom validate.
20. **Accessibility** — automated checks pass and the manual keyboard and
    screen-reader paths from Block 20 are re-verified on the release candidate.
21. **Security** — the Block 22 security tests pass; RLS is enabled everywhere;
    denied-access tests pass; no secret is present in the build or repository.
22. **Audit logging** — every privileged operation performed during this validation
    appears in the audit log with the correct actor, and audit rows resist update and
    deletion.
23. **Deployment build** — the production build succeeds, deploys to staging, and
    passes post-deploy smoke tests.
24. **Documentation** — the documentation was sufficient to complete areas 1 and 2
    without recourse to the implementing session; any gap is recorded as a defect.

## Technical Requirements

- Validation runs against a release candidate build, not a development server with
  debug affordances.
- Each area records: what was executed, the observed result, the expected result,
  pass or fail, and the evidence reference.
- A partial pass is a fail. There is no "mostly working" outcome.

## Data Requirements

Validation uses seeded fixture data plus data created during the pass. No production
data is used. Data created during validation is recorded so the environment can be
reset.

## Security Requirements

- Areas 4, 13, 16, 21, and 22 include their negative cases; a validation that
  exercises only the happy path is incomplete.
- Any security failure is a release blocker regardless of the number of areas passing.
- Validation must not disable any control to proceed; a control that blocks
  validation is either correct or a defect, and either way it is not bypassed.

## Accessibility Requirements

Area 20 requires the manual verification to be re-executed on the release candidate,
not copied forward from Block 20. Record the assistive technology and browser used.

## Testing Requirements

- The full Block 22 suite runs green on the release candidate.
- Each of the twenty-four areas has recorded execution evidence.
- Every defect found is reproduced, recorded, referred, fixed, and re-validated.

## Documentation Requirements

- `docs/final-validation-report.md`: per-area execution record, evidence, pass or
  fail, defects raised with their owning block, and the re-validation outcome.
- Update `docs/known-limitations.md` with anything accepted rather than fixed.

## Acceptance Criteria

- [ ] All twenty-four areas were executed in this pass on a release candidate.
- [ ] Every area records evidence, not an assertion.
- [ ] Negative cases were executed for every security-bearing area.
- [ ] All defects found were referred, fixed, and re-validated.
- [ ] No control was bypassed to complete validation.
- [ ] The full test suite is green on the release candidate.
- [ ] Documentation alone was sufficient for clean setup.
- [ ] Any accepted limitation is recorded with its impact.

## Completion Report

Report: areas executed with pass or fail and evidence references, defects found with
their owning blocks and resolution state, re-validation results, security negative
case outcomes, accessibility verification tooling and results, deployment validation
result, accepted limitations, and the explicit statement of whether the release
candidate is validated.
