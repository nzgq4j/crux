# Block 02 — Product Requirements

## Objective

Define the complete set of users, journeys, and functional capabilities for the Crux
research, publishing, and digital-content platform, so that every later block
implements against a stated requirement rather than an assumption.

## Scope

### In scope

- User classes and their journeys.
- Functional capability definitions for public, account, editorial, and
  administrative surfaces.
- Requirement identifiers seeded into the traceability register.

### Out of scope

- Technical architecture (Block 03), visual design (Block 12), and any implementation.

## Dependencies

Block 01.

## Required Inputs

- `docs/repository-assessment.md`.
- `.claude/prompts/01-repository-assessment.md`.
- `.claude/rules/general.md`, `.claude/rules/content-modeling.md`.

## Required Outputs

- `docs/product-requirements.md` with uniquely identified requirements.
- Seeded and updated rows in `docs/requirements-traceability.md`.
- `docs/architecture-decisions/0002-product-scope.md`.

## Functional Requirements

### User classes

Define the goals, permitted actions, and access limits of each:

- Anonymous visitors
- Registered users
- Subscribers
- Research members
- Contributors
- Authors
- Reviewers
- Editors
- Publishers
- Taxonomy managers
- Asset managers
- Administrators

For each class, state what the class may read, what it may write, what it may
publish, and what it must never reach.

### Journeys

Define an end-to-end journey, including failure and denial paths, for each:

1. **Public research discovery** — browsing, filtering, hub and topic navigation,
   and search entry points.
2. **Report reading** — server-rendered report consumption, section navigation,
   figures, tables, references, and stable fragment links.
3. **Controlled downloads** — entitlement evaluation, gated request, signed
   delivery, and download history.
4. **Account management** — registration, verification, sign-in, profile, password
   recovery, linked identities, and deletion request.
5. **Newsletter preferences** — subscribe, confirm, adjust topics and frequency,
   unsubscribe.
6. **Editorial authoring** — draft creation, structured module authoring, claim and
   citation attachment, autosave, and submission.
7. **Review** — assignment, review criteria, comments, evidence checks, and
   approval or rejection.
8. **Publication** — scheduling, publication gate, immutable version creation, and
   canonical URL assignment.
9. **Correction** — correction notice, superseding version, and public visibility of
   the correction record.
10. **Withdrawal** — withdrawal reason, tombstone behaviour, and retention of the
    citation record.
11. **Citation export** — version-aware citation retrieval in every supported format.
12. **Dataset discovery** — dataset listing, variable inspection, version selection,
    and access control.
13. **Administrative reporting** — live operational metrics for editorial, search,
    downloads, subscriptions, and accounts.

## Technical Requirements

- Assign every requirement a stable identifier of the form `REQ-<DOMAIN>-<NNN>`.
- Mark each requirement Must, Should, or Could. Must-requirements gate completion.
- Cross-reference each requirement to the block that will own its implementation.

## Data Requirements

Identify the entities the product implies — content items, versions, modules,
claims, sources, datasets, assets, accounts, entitlements, subscriptions,
taxonomies, and audit events — without specifying their schema. Schema is owned by
Blocks 05 and 16.

## Security Requirements

- State, per user class, the data that class must never be able to read or modify.
- State that draft and unpublished content is never visible to anonymous visitors.
- State that entitlement decisions are server-authoritative.

## Accessibility Requirements

Every journey must be stated as completable by keyboard alone and by a screen-reader
user. Journeys that cannot meet this are not acceptable requirements.

## Testing Requirements

Each Must-requirement must be phrased so that it is testable: it must state an
observable outcome, not an intention. Include the denial expectation for every
permission-bearing requirement.

## Documentation Requirements

- `docs/product-requirements.md` covers all user classes and all thirteen journeys.
- The traceability register is seeded with every Must-requirement.
- Explicitly record out-of-scope items and deferred capabilities.

## Acceptance Criteria

- [ ] All twelve user classes are defined with read, write, publish, and deny limits.
- [ ] All thirteen journeys are defined including failure and denial paths.
- [ ] Every requirement has a stable identifier and a priority.
- [ ] Every Must-requirement is observable and testable.
- [ ] Every requirement is mapped to an owning block.
- [ ] `docs/requirements-traceability.md` contains a row per Must-requirement.
- [ ] No requirement asserts a capability the platform will not build.

## Completion Report

Report: user classes defined, journeys defined, requirement count by priority,
requirements mapped per block, traceability rows seeded, deferred scope, open
questions, and files created.
