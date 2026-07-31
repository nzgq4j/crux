# Block 00 — Master Orchestrator

## Objective

Govern the sequenced execution of Blocks 01 through 28 so that no functional block
is implemented before its dependencies are complete, every block is delegated to its
responsible specialist agent, and every completion claim is backed by evidence
recorded in the repository registers.

This block is a control contract. It produces no application code.

## Scope

### In scope

- Selecting the next eligible block from the dependency graph.
- Verifying dependency completion before authorising implementation.
- Delegating a block to its owning specialist agent.
- Enforcing independent review where a separate reviewer is designated.
- Updating `docs/implementation-status.md`, `docs/requirements-traceability.md`
  and `.claude/architecture-manifest.md` after every block.
- Halting execution when a stopping condition is met.

### Out of scope

- Writing application, database, or infrastructure code.
- Approving a block that the orchestrator itself implemented.
- Altering the approved requirements of any block.

## Dependencies

None. Block 00 is the entry point.

## Required Inputs

- `.claude/architecture-manifest.md` — installed blocks and their status.
- `docs/architecture-block-dependencies.md` — the dependency matrix and wave plan.
- `docs/implementation-status.md` — current per-block status.
- `docs/requirements-traceability.md` — requirement coverage.
- `.claude/rules/general.md` and any rule files applicable to the target block.
- The target block file under `.claude/prompts/`.

## Required Outputs

- A selected next block, with the dependency check that justified the selection.
- A delegation instruction naming the owning agent and the required context set.
- Updated status, traceability, and manifest entries after each block.
- A completion report per block, or a documented stop with its blocking reason.

## Functional Requirements

1. **Execution sequencing.** Determine block eligibility solely from
   `docs/architecture-block-dependencies.md`. A block is *Ready* when every direct
   dependency is *Complete*; otherwise it is *Blocked*.
2. **Dependency checks.** Before authorising a block, re-read the status of each
   direct dependency in `docs/implementation-status.md` and confirm each records
   passing acceptance criteria. A dependency marked complete without recorded
   verification evidence does not satisfy the check.
3. **Agent delegation.** Assign each block to the agent named in the manifest.
   Provide the agent with: the block file, its direct dependency block files, the
   applicable rule files, and the implementation files it must inspect. Do not
   provide the entire architecture pack.
4. **Status inspection.** Re-read the registers at the start of every orchestration
   turn. Never rely on remembered state from earlier in a session.
5. **Traceability updates.** After a block completes, update every requirement row
   the block owns with implementation files, test coverage, and verification
   evidence.
6. **Completion reporting.** Require each block's Completion Report before marking
   the block complete. A block without a completion report remains *In progress*.
7. **Out-of-sequence prevention.** Refuse an instruction to implement a *Blocked*
   block. Report the unmet dependencies instead of partially implementing.
8. **Independent review enforcement.** For Blocks 06, 07, 13, 15, 27 and 28, require
   sign-off from `database-security-reviewer`. For Block 22 and acceptance
   validation, require `test-engineer`. An implementing agent may not sign off its
   own high-risk security work.
9. **Remediation procedure.** When acceptance criteria fail: record the failure in
   the status register, set the block to *Remediation*, re-delegate to the owning
   agent with the failure evidence, and re-run the full acceptance criteria after
   the fix. Do not narrow the criteria to obtain a pass.

## Technical Requirements

- Context control: load only the current block, its direct dependencies, applicable
  rules, and the implementation files being changed.
- Every block runs on a branch off the default branch. Never commit to the default
  branch directly.
- Record every architecture decision as an ADR under `docs/architecture-decisions/`.

## Data Requirements

The orchestrator owns no tables. It reads and writes only Markdown registers.

## Security Requirements

- Treat the following as hard blockers that stop execution regardless of block
  progress: RLS absent on an exposed table, a secret committed to the repository,
  a privileged key reachable from client code, an authorization decision made only
  in the browser, or a mutation of a published content version.
- Never disable, weaken, or bypass a security control to make a test pass.
- Escalate a security blocker to the user rather than routing around it.

## Accessibility Requirements

Accessibility acceptance for Blocks 09 through 14 requires sign-off from
`accessibility-reviewer` before those blocks may be marked complete. The
orchestrator enforces this gate; it performs no accessibility testing itself.

## Testing Requirements

- Do not mark a block complete while any test it introduced or touched is failing.
- Require that denied-access tests exist and pass for every block that introduces an
  authorization boundary.
- Require a green build before Blocks 23, 25 and 26.

## Documentation Requirements

- Each completed block updates the three registers.
- Each significant technical choice produces an ADR.
- Document any deviation from the approved architecture and its justification.

## Parallel Execution Rules

Blocks may run concurrently only when they share no dependency edge and touch
disjoint files. The following restrictions are absolute:

- No two blocks may modify the same migration sequence concurrently.
- Blocks 06 and 07 are strictly sequential; 07 must observe the finished role model.
- Blocks 09 and 10 are strictly sequential; the editor builds on the admin shell.
- Blocks 22, 23, 24, 25 and 26 are strictly sequential and terminal.
- No more than three blocks may be in progress at any time.

Permitted concurrent groups are enumerated in
`docs/architecture-block-dependencies.md`.

## Stopping Conditions

Stop and report rather than continue when any of the following holds:

1. A dependency is incomplete or its evidence is missing.
2. A security blocker listed above is present.
3. An acceptance criterion cannot be verified in the current environment.
4. The approved specification is ambiguous on a requirement that changes the design.
5. Implementing the block would overwrite existing functionality not covered by the
   block's scope.
6. A block file is missing, or contains placeholder content.

## Acceptance Criteria

- [ ] The next eligible block is derived from the dependency matrix, not assumed.
- [ ] Every direct dependency of the selected block is *Complete* with evidence.
- [ ] The delegation names the correct owning agent and the minimum context set.
- [ ] Independent review is enforced for every designated block.
- [ ] The three registers are updated after each block.
- [ ] No block was implemented out of sequence.
- [ ] Every stopping condition encountered was reported, not bypassed.

## Completion Report

After each orchestration cycle, report:

- Block selected and the dependency check result that justified it.
- Agent delegated to, and the context set provided.
- Outcome: Complete, Remediation, or Blocked.
- Acceptance criteria evaluated, with pass or fail for each.
- Registers updated, with file paths.
- Security or accessibility gates enforced and their reviewers.
- Stopping conditions encountered.
- The next eligible block.
