# Block 22 — Testing and Quality

## Objective

Establish the complete test suite and the quality gates that block a release, with
mandatory denied-access coverage across every authorization boundary.

## Scope

### In scope

- All test tiers below, the CI quality gates, and the scanning controls.
- Independent acceptance validation of previously completed blocks.

### Out of scope

- Deployment pipeline definition (Block 23), which consumes these gates.

## Dependencies

All implemented blocks.

## Required Inputs

- Every completed block file and its recorded acceptance criteria.
- `docs/implementation-status.md`, `docs/requirements-traceability.md`.
- `.claude/rules/testing.md`, `.claude/rules/security.md`.

## Required Outputs

- The full test suite across every tier.
- CI configuration enforcing the gates.
- `docs/testing.md` with the coverage map.

## Functional Requirements

1. **Unit tests.** Pure logic: citation formatting, validation, entitlement
   evaluation, redaction, ranking fusion, chunking, and format renderers.
2. **Database tests.** Constraints, triggers, functions, immutability enforcement,
   lifecycle transitions, and separation-of-duties rules, executed against a real
   PostgreSQL instance rather than a mock.
3. **RLS tests.** Per relation, per role, per operation, asserting both permitted and
   denied outcomes. Include the enumeration test that fails when a new table lacks
   RLS.
4. **Storage-policy tests.** Public readability, private inaccessibility, signed URL
   issuance and expiry, and entitlement enforcement.
5. **Integration tests.** Server actions and route handlers against a real database:
   authentication, workflow transitions, publication, download issuance, subscription
   flows, and API endpoints.
6. **End-to-end tests.** Full journeys in a browser: registration and sign-in,
   research discovery and report reading, gated download, newsletter subscription and
   confirmation, authoring, review, approval, publication, correction, and
   withdrawal.
7. **Accessibility tests.** Automated checks across all routes and component states,
   plus the recorded manual verification required by Block 20.
8. **Security tests.** Authorization bypass attempts, privilege escalation attempts,
   direct object reference probing, draft disclosure attempts, audit tampering
   attempts, injection attempts against search and API parameters, and OAuth identity
   collision attempts.
9. **Citation tests.** Every format against fixture versions, including corrected,
   superseded, and withdrawn versions, and the absent-field non-fabrication test.
10. **Search tests.** Ranking metrics against the labelled query set with a
    regression threshold, and permission-leakage tests including counts and facets.
11. **Build gates.** TypeScript compilation with no errors, lint with no errors,
    production build success, OpenAPI validation, and the accessibility and ranking
    thresholds.
12. **Secret scans.** Automated scanning of the working tree and history for
    credentials, private keys, and tokens, failing the build on detection.
13. **Dependency scans.** Vulnerability scanning with a documented severity threshold
    that fails the build, and a recorded exception procedure requiring justification
    and an expiry.

### Denied-access coverage

**Denied-access tests are mandatory.** For every authorization boundary in the
platform, a test must assert that the unauthorised actor is refused. A boundary
without a denial test is an incomplete boundary, regardless of whether its permitted
path is tested. This applies to relations, storage objects, routes, server actions,
API endpoints, search results, and administrative mutations.

## Technical Requirements

- Tests are deterministic. No test depends on wall-clock timing, network access to a
  third party, or execution order.
- Fixtures are seeded reproducibly and reset between runs.
- External providers are faked at the Block 03 abstraction boundary, never by
  patching internals.
- The suite runs in CI on every pull request and produces a machine-readable report.
- Test execution time is bounded; the suite is parallelised where safe.

## Data Requirements

- Test data contains no real personal data and no production extract.
- Fixtures cover every content lifecycle state and every role.
- A coverage map records which requirement identifier each test satisfies, feeding
  `docs/requirements-traceability.md`.

## Security Requirements

- **No control may be weakened, disabled, or bypassed to make a test pass.** A test
  that requires disabling RLS, elevating a role, or removing a gate is an invalid
  test; fix the test or the design.
- Test credentials are generated per run and are never committed.
- Security test findings are recorded even when the test passes, so that the
  attempted attack surface is documented.

## Accessibility Requirements

Accessibility tests are a first-class tier, not an optional extra. A build failing
accessibility checks fails the gate. Manual verification results from Block 20 are
referenced from the coverage map.

## Testing Requirements

This block is the testing requirement. Additionally:

- A meta-test asserting every relation in an exposed schema has at least one denial
  test.
- A meta-test asserting every Must-requirement in the traceability register has at
  least one linked test.

## Documentation Requirements

- `docs/testing.md`: the tiers, how to run each locally, the fixture strategy, the
  coverage map, the gate thresholds, and the exception procedure for dependency
  findings.
- Document any known gap in coverage explicitly.

## Acceptance Criteria

- [ ] All ten test tiers exist and pass.
- [ ] Denied-access tests exist for every authorization boundary.
- [ ] The RLS enumeration meta-test passes.
- [ ] The requirement-coverage meta-test passes.
- [ ] Build gates fail the build on type errors, lint errors, or build failure.
- [ ] Secret scanning runs and fails the build on detection.
- [ ] Dependency scanning runs with a documented threshold and exception procedure.
- [ ] Ranking regression threshold is enforced.
- [ ] Accessibility checks are enforced as a gate.
- [ ] No test passes by weakening a security control.
- [ ] The suite is deterministic and reproducible from a clean checkout.

## Completion Report

Report: tests added per tier with counts, denied-access coverage summary, meta-test
results, gates configured and their thresholds, secret and dependency scan results,
ranking metrics, accessibility results, known coverage gaps, requirement coverage
percentage, and the `test-engineer` independent validation record.
