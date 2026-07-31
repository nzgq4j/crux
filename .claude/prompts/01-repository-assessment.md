# Block 01 — Repository Assessment

## Objective

Establish a verified factual baseline of the Crux repository before any
implementation begins, so that later blocks extend what exists rather than
duplicating or silently replacing it.

## Scope

### In scope

- Inspection of the existing framework, tooling, configuration, and documentation.
- Identification of reusable assets and technical debt.
- Recording the baseline as an ADR and an assessment document.

### Out of scope

- Installing dependencies, scaffolding an application, or changing configuration.
- Making design decisions reserved for Blocks 02 and 03.

## Dependencies

None.

## Required Inputs

- The repository working tree at the current branch.
- `.claude/rules/general.md` and `.claude/rules/documentation.md`.

## Required Outputs

- `docs/repository-assessment.md` containing every finding below.
- `docs/architecture-decisions/0001-baseline-repository-state.md`.
- Updated `docs/implementation-status.md` marking Block 01 complete.

## Functional Requirements

Inspect and record, stating explicitly when something is absent:

1. **Framework inspection.** Presence and version of Next.js, React, and TypeScript.
   App Router or Pages Router. `tsconfig.json` strictness. Existing route tree.
2. **Package-manager inspection.** Which of npm, pnpm, yarn, or bun is in use, as
   evidenced by lockfile. Node version constraints. Existing scripts.
3. **Existing Supabase inspection.** Any `supabase/` directory, `config.toml`,
   project linkage, generated types, or client helper modules.
4. **Migration inspection.** Any files under `supabase/migrations/`, their ordering
   convention, and whether they are reversible.
5. **Existing auth inspection.** Any authentication implementation, session
   handling, middleware, route guards, or role model already present.
6. **Existing tests.** Test runners configured, test locations, current pass state,
   and coverage tooling.
7. **Existing CI/CD.** Workflows under `.github/workflows/`, deployment
   configuration, and required status checks.
8. **Existing documentation.** README, CLAUDE.md, ADRs, and any operational runbook.
9. **Technical debt.** Failing builds, deprecated dependencies, unpinned versions,
   committed secrets, disabled type checking, or unmaintained code paths.
10. **Reusable assets.** Anything a later block should extend rather than recreate:
    components, utilities, schema, styles, configuration, or content.

## Technical Requirements

- Report observed facts only. Do not infer a framework from a `.gitignore` template.
- Distinguish "absent" from "not inspected"; both are reportable, they are not equal.
- Record exact file paths and versions.

## Data Requirements

Record any existing database objects discovered: schemas, tables, functions,
policies, extensions, and seed data. Where none exist, state that the database is
unprovisioned.

## Security Requirements

- Scan for committed secrets, private keys, and service-role credentials.
- Report any privileged key referenced from client-side code.
- Do not print discovered secret values into documentation or logs. Report the file
  and line, and the class of secret, only.

## Accessibility Requirements

Record whether any accessibility tooling, linting, or testing exists. No
accessibility remediation occurs in this block.

## Testing Requirements

- Attempt to run the existing build and test commands, and record the actual result.
- If no build or test tooling exists, record that fact rather than creating it.

## Documentation Requirements

- `docs/repository-assessment.md` must cover all ten inspection areas above.
- The baseline ADR must record the starting state and the constraints it imposes.
- Known limitations of the assessment must be stated explicitly.

## Acceptance Criteria

- [ ] All ten inspection areas are recorded with evidence or an explicit absence.
- [ ] Every claim cites a file path, command output, or explicit "not present".
- [ ] The baseline ADR exists and is referenced from the assessment.
- [ ] No configuration, dependency, or source file was modified by this block.
- [ ] Secret scan performed and results recorded without exposing secret values.
- [ ] `docs/implementation-status.md` updated.

## Completion Report

Report: framework state, package manager, Supabase state, migration state, auth
state, test state, CI/CD state, documentation state, technical debt found, reusable
assets found, secret scan result, files created, and confirmation that no existing
file was modified.
