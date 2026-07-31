# Block 08 — Editorial Workflow

## Objective

Implement the editorial state machine — assignment, review, approval, scheduling,
publication, correction, and withdrawal — with enforced review gates, separation of
duties, and an atomic publication transaction.

## Scope

### In scope

- The `workflow` schema: states, transitions, assignments, reviews, approvals,
  comments, tasks, and deadlines.
- Required review gates and separation-of-duties enforcement.
- Scheduled publication and the atomic publication transaction.
- Correction and withdrawal procedures.

### Out of scope

- Administrative UI (Block 09) and the editor surface (Block 10). This block owns
  the workflow engine and its server contract; those blocks consume it.

## Dependencies

Blocks 05, 06, 07.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/06-authentication-authorization.md`,
  `.claude/prompts/07-rls-security.md`.
- `.claude/rules/database.md`, `.claude/rules/backend.md`.

## Required Outputs

- Migrations creating the `workflow` tables and the transition functions.
- The publication transaction function.
- Server-layer workflow service with permission enforcement.
- `docs/editorial-workflow.md` with the state diagram and gate table.

## Functional Requirements

1. **Workflow states.** At minimum: `draft`, `in_review`, `changes_requested`,
   `approved`, `scheduled`, `published`, `correction_pending`, `superseded`,
   `withdrawn`. States are stored in a registry table, not as free text.
2. **Workflow transitions.** A transition table declaring, for each state pair, the
   permission required, the gates that must be satisfied, and whether the transition
   is reversible. Transitions occur only through a transition function that
   validates the declaration; direct status updates are prohibited by trigger.
3. **Assignments.** Assign a version to a contributor, author, reviewer, or editor,
   with a role on the assignment, an assigning actor, and a timestamp. Editorial
   access under Block 07 is scoped by these assignments.
4. **Reviews.** A review record per reviewer per round, with structured criteria
   covering evidence sufficiency, citation quality, methodology statement,
   limitations statement, and accessibility of figures and tables.
5. **Approvals.** An approval is distinct from a review and records the approving
   actor, the review round approved, and the timestamp.
6. **Comments.** Threaded comments anchored to a version and optionally to a module
   fragment identifier, with resolution state.
7. **Tasks.** Discrete work items attached to a version or assignment, with owner,
   state, and completion record.
8. **Deadlines.** Due dates on assignments and tasks, with overdue derivation
   available to the administrative queues.
9. **Required review gates.** Publication requires: at least one completed review
   with an approval, a methodology statement present where the content type requires
   one, a limitations statement present where required, every quantitative claim
   linked to a source, and every figure carrying a text alternative. A gate failure
   blocks the transition and reports which gate failed.
10. **Separation of duties.** Enforce the Block 06 rules at the transition boundary:
    an author may not review or approve their own version, and a reviewer may not
    approve their own review. Enforcement is in the database.
11. **Scheduled publication.** A version may be scheduled for a future timestamp. A
    scheduled job performs the publication using the same transaction and the same
    gates as an immediate publication. A schedule may be cancelled before it fires.
12. **Corrections.** A correction opens a new version from the published version,
    records the correction reason and scope, and on publication supersedes the prior
    version while leaving it retrievable with a visible correction notice.
13. **Withdrawal.** Withdrawal requires a reason, a withdrawing actor holding the
    publisher or managing editor permission, and produces a public tombstone that
    retains the citation record.
14. **Publication transaction.** Publication is a single atomic database transaction
    that: validates every gate, freezes the version and its modules, sets the
    published timestamp, updates the content item's current version pointer, writes
    the redirect if the canonical slug changed, enqueues search indexing and
    embedding work, and writes the audit record. If any step fails, nothing is
    published. Partial publication is not an acceptable outcome.

## Technical Requirements

- Transition functions are `SECURITY DEFINER` with a restricted `search_path` and
  perform their own permission checks.
- The publication function is idempotent under retry: republishing an already
  published version is a no-op that reports the existing state rather than an error
  that leaves inconsistent data.
- Search indexing and embedding are enqueued, not performed inline, so that a
  provider outage cannot fail a publication.

## Data Requirements

- Every transition writes an append-only audit row recording actor, from-state,
  to-state, gates evaluated, and timestamp.
- Review, approval, and withdrawal records are retained permanently; they are part
  of the public correction and provenance record.
- Comments are retained with the version and are never publicly exposed.

## Security Requirements

- No transition may be performed by a client-side status write.
- Gate evaluation happens inside the transaction; it may not be pre-computed by the
  caller and passed in.
- Scheduled publication runs under a service identity whose permissions are limited
  to publication, and the schedule endpoint is protected by the cron secret.
- Withdrawal and correction are privileged operations and are always audited.

## Accessibility Requirements

Workflow state, gate failures, and assignment changes must be conveyed as text, not
as colour or icon alone, wherever the administrative surface renders them. Gate
failure messages must name the specific gate and the remedy.

## Testing Requirements

- A test per declared transition, asserting allowed and denied outcomes by role.
- Tests proving each separation-of-duties rule blocks the violating transition.
- A test per publication gate, asserting the gate blocks publication when unmet.
- A test proving the publication transaction is atomic: inject a failure after the
  version freeze and assert nothing was published.
- A test proving a scheduled publication applies the same gates.
- Tests for correction and withdrawal, including public visibility of the notice and
  the tombstone.

## Documentation Requirements

- `docs/editorial-workflow.md`: state diagram, transition table with permissions and
  gates, the publication transaction steps, and the correction and withdrawal
  procedures.
- Runbooks for cancelling a schedule, issuing a correction, and withdrawing content.

## Acceptance Criteria

- [ ] All workflow states and transitions exist in registry tables.
- [ ] Direct status writes are blocked; transitions occur only through functions.
- [ ] Assignments scope editorial access as Block 07 requires.
- [ ] Reviews, approvals, comments, tasks, and deadlines are implemented.
- [ ] Every publication gate is enforced and individually tested.
- [ ] Separation of duties is database-enforced and tested.
- [ ] Scheduled publication uses the same transaction and gates.
- [ ] The publication transaction is atomic, proven by an injected-failure test.
- [ ] Correction produces a superseding version with a visible notice.
- [ ] Withdrawal produces a tombstone retaining the citation record.
- [ ] Every transition is audited.

## Completion Report

Report: states and transitions implemented, gates implemented, separation-of-duties
enforcement points, publication transaction steps and atomicity evidence, scheduling
implementation, correction and withdrawal behaviour, audit events, tests added with
results, and documentation written.
