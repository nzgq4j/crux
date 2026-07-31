# General Engineering Rules

These rules apply to every block, every agent, and every change.

## Inspect before modifying

1. Read the existing implementation before adding to it or replacing it.
2. Search for an existing utility, component, table, or policy before creating an
   overlapping one.
3. When existing code conflicts with the block you are implementing, report the
   conflict and the proposed resolution rather than silently overwriting.

## Preserve compatible behaviour

4. Do not remove or change working functionality that the current block does not own.
5. When a change is unavoidably breaking, record it, provide the migration path, and
   flag it in the completion report.
6. Do not delete a file, table, or route because it appears unused. Establish that it
   is unused first.

## Keep changes within the current block

7. Implement only what the current block specifies. Work belonging to a later block
   is recorded, not implemented early.
8. Do not implement a block whose dependencies are incomplete.
9. Avoid unrelated refactors. If you find something worth changing outside the block,
   record it in the completion report as a recommendation.

## Record assumptions

10. When the specification is ambiguous, state the assumption explicitly in the
    completion report and proceed with the reading most consistent with the rest of
    the architecture.
11. When two blocks appear to conflict, escalate rather than choosing silently.
12. Record every meaningful technical decision as an ADR under
    `docs/architecture-decisions/`.

## Update status and traceability

13. Update `docs/implementation-status.md` when a block's state changes.
14. Update `docs/requirements-traceability.md` with implementation files, tests, and
    verification evidence for every requirement the block touches.
15. Update `.claude/architecture-manifest.md` when a prompt file changes.

## Do not claim completion without evidence

16. "Complete" means the acceptance criteria were executed and passed, with the
    evidence recorded. It does not mean the code was written.
17. Report test failures with their output. Do not describe a red suite as green.
18. Report skipped work explicitly, including what was skipped and why.
19. Do not describe a control as working because the code appears correct. Run it.
20. Never fabricate research claims, sources, citations, credentials, datasets,
    identifiers, or institutional authority — in code, in seed data, in fixtures, or
    in documentation.
