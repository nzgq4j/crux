# Crux Architecture Installation Report

**Date:** 2026-07-31
**Branch:** `claude/initialize-crux-repository-w49p3o`
**Base commit:** `46ecc83e5ec7226b67d01b48d86d8d225879702f`

## Headline

**The complete architecture pack was installed.** All 29 prompt blocks (00–28), all 12
specialist agent contracts, and all 9 engineering rule files are present, complete, and
independently usable. One source gap was recorded at installation and has since been
closed; see **Missing source material**.

## Repository resolved

| Property | Value |
|---|---|
| Owner | nzgq4j |
| Full name | nzgq4j/crux |
| URL | https://github.com/nzgq4j/crux |
| Repository ID | 1317935883 |
| Visibility | Public |
| Default branch | `main` |
| Latest commit at start | `46ecc83` — "Initial commit" |
| Branches at start | `main` |
| Open pull requests at start | None |
| Open issues at start | None |

Resolution was unambiguous — exactly one accessible repository named `crux` exists
under the authenticated account, so the ambiguity rule did not engage.

## Architecture source resolved

**Source type 1** — the approved modular architecture supplied directly in the Claude
Code initialization instruction.

That instruction supplied, and this installation used:

- Functional definitions for Blocks 00 through 28.
- The dependency matrix (Section 10 of the instruction).
- Block invocation rules and the required per-block section template.
- Context-control rules and parallel-execution restrictions.
- Independent-review assignments per agent.
- Exact schema names (all thirteen), the eight `cms` table names, and the nine
  `knowledge` table names.
- The fourteen-role model with exact role identifiers.
- The four Google OAuth environment variable names.
- The eight required citation formats.
- The nine claim types.
- The ten final completion controls.

No repository file, external document, or connector-accessible source was used, and
nothing was drawn from a prior conversation.

### Source validation result

All 29 required blocks were present in the source as functional definitions. Required
supporting material was validated as follows:

| Required source element | Present | Note |
|---|---|---|
| Blocks 00–28 functional definitions | Yes | All 29 |
| Dependency relationships | Yes | Full matrix supplied |
| Execution waves | Derived | Matrix supplied; waves derived from it in `docs/architecture-block-dependencies.md` |
| Block invocation rules | Yes | |
| Remediation procedure | Derived | Supplied as a required Block 00 capability, not as prose; written as Block 00 functional requirement 9 |
| Independent-review procedure | Yes | Reviewer assignments and the no-self-approval rule supplied |
| Parallel-execution restrictions | Yes | Extended with explicit concurrent groups and sequential pairs |
| Context-control rules | Yes | |
| Final implementation checklist | Yes | Supplied verbatim after installation; see Closure — 2026-07-31 |

## Missing source material

**None outstanding.** One gap was recorded at installation; it has since been closed.

### The gap as originally recorded

> **Block 26 — the verbatim "Section 45" checklist text.** The instruction directed
> that "the approved final Section 45 checklist" be installed *in full*, but the
> verbatim prose of that section was not included in the instruction. What *was*
> supplied — and was preserved exactly — is the list of thirteen coverage areas the
> checklist must cover and the ten final completion controls.

Installation proceeded rather than stopping because the block's *requirements* were
supplied and only the original prose was not. No requirement was invented, and the gap
was disclosed in the block file, the manifest, and this report.

### Closure — 2026-07-31

The verbatim Section 45 text was subsequently supplied and installed. Actions taken:

- **Block 26 rebuilt** to reproduce Section 45's five-phase structure with its 45.x.y
  numbering intact, and to carry the sequential phase-gate rule ("each phase validated
  before proceeding") as an explicit execution requirement. The Source Note recording
  the gap was removed, since it no longer applies.
- **Reconciliation applied across the pack.** Section 45 supplied exact identifiers
  that eleven other files had described only generically. Blocks 04, 05, 06, 07, 08,
  13, 15, 16, 17, 19 and `.claude/rules/backend.md` were updated to use them literally.
- **Five conflicts resolved and recorded**, each in favour of the superset or the
  explicitly reconciled position rather than by silently dropping one side: the claim
  taxonomy (nine storage types mapped to five §45 evidence classes), citation formats
  (eight retained, §45's five mandatory), completion controls (ten retained, §45's six
  marked as core), ranking signals (conformed to §45's five), and the dual purpose of
  the `identity` schema.
- **Nine new requirements adopted** from Section 45 that the earlier source had not
  contained.

The full reconciliation record, including the identifier table and the conflict
resolutions, is in the manifest under **Section 45 Reconciliation**. Architecture
version raised to 1.1.0.

**Nothing in Section 45 was dropped, weakened, or paraphrased where it gave an exact
name.**

### Reconciliation verification — 2026-07-31

The reconciliation was independently verified by seven agents: one per Section 45
phase, checking every source line item against both the checklist and its owning block
file; plus two cross-checkers hunting contradictions, stale references, and omissions.

**34 findings, all resolved.** Notably:

| Severity | Count | Nature |
|---|---|---|
| Blocking | 7 | One genuine coverage hole — `audit.events` was protected and referenced everywhere but never *created* by any block — plus six contradictions the reconciliation edits themselves introduced |
| Major | 16 | Checklist items with no owning requirement in any block file; generic references left behind where an exact name had been adopted; registers left stale |
| Minor | 11 | Fidelity and anchoring: abbreviated table names, missing acceptance criteria for newly added requirements, cross-reference ordering |

The six self-inflicted contradictions are worth recording, because they show the class
of error a reconciliation produces: making a rule configurable in one file while
leaving the absolute version of that rule standing in the same file's tests and
acceptance criteria, and in the rules library that binds every agent. Specifically —
claim-to-source linkage was made per-content-type configurable in Block 16 while
Block 16's own test and acceptance rows, and `rules/content-modeling.md` rule 18, still
asserted it absolutely; citation formats gained a deferral clause that contradicted the
block's own scope, testing, and acceptance statements; a cross-reference was written to
"§17.2 of the platform brief", a document that does not exist in this repository; the
Section 45 table list in Block 08 read as exhaustive and silently dropped three tables
that block requires; and the schema count disagreed between Block 04 (thirteen created)
and Block 26 (fourteen listed, including Supabase-managed `auth`).

All are fixed. A second concern the verification raised — that Blocks 06 and 17
referenced `docs/known-limitations.md`, which Block 24 does not create until much later
— was resolved by pointing both at `docs/requirements-traceability.md` instead, which
exists from initialization and which Block 24 reconciles into known limitations.

## Existing project state

The repository was effectively empty: two tracked files and one commit. No framework,
no package manifest, no package manager lockfile, no Supabase configuration, no
migrations, no authentication, no tests, no CI/CD, no CLAUDE.md, and no `.claude/`
directory. Full detail is in `docs/repository-assessment.md`.

## Existing files preserved

| File | Treatment |
|---|---|
| `README.md` | **Preserved and extended.** The original title (`# crux`) and description ("Crucible Insight content managed website") are retained verbatim as the opening lines. Nothing was removed. |
| `.gitignore` | **Preserved and extended.** All 36 original lines are intact and unmodified. Required entries were appended under a clearly marked section. |

No existing file was deleted, truncated, or rewritten. No uncommitted work existed, so
no worktree separation was required.

## Existing instructions merged

No `CLAUDE.md` existed prior to this installation, so `CLAUDE.md` was created rather
than merged. **No merge conflicts arose and none were suppressed.**

## Files installed

### Prompt blocks — 29

`00-master-orchestrator` through `28-google-oauth-authentication`, each containing all
fourteen required sections: Objective, Scope, Dependencies, Required Inputs, Required
Outputs, Functional Requirements, Technical Requirements, Data Requirements, Security
Requirements, Accessibility Requirements, Testing Requirements, Documentation
Requirements, Acceptance Criteria, and Completion Report.

Where a concern genuinely does not apply to a block, the section states so and explains
why — for example, Block 04 records that it produces no user-facing surface and that
accessibility obligations begin at Block 09. No section was omitted.

### Specialist agents — 12

`product-architect`, `supabase-architect`, `database-security-reviewer`,
`cms-product-engineer`, `editorial-workflow-engineer`, `design-system-engineer`,
`accessibility-reviewer`, `search-relevance-engineer`, `provenance-engineer`,
`citation-discovery-reviewer`, `test-engineer`, `deployment-engineer`.

Each contains Mission, Owned Blocks, Required Context, Responsibilities, Prohibited
Actions, Required Validation, and Handoff Format. Ownership matches the assignment in
the instruction exactly, and the no-self-approval rule for high-risk security work is
written into both the reviewer's contract and each implementing agent's prohibited
actions.

### Engineering rules — 9

`general`, `frontend`, `backend`, `database`, `security`, `content-modeling`,
`accessibility`, `testing`, `documentation`.

### Registers and governance

`CLAUDE.md`, `.claude/architecture-manifest.md`,
`docs/architecture-block-dependencies.md`, `docs/implementation-status.md`,
`docs/requirements-traceability.md`, `docs/repository-assessment.md`,
`docs/architecture-decisions/README.md`, this report, `.env.example`,
`.github/pull_request_template.md`, and three issue templates.

## Fidelity notes

Preserved exactly as approved: all thirteen schema names; the eight `cms` table names;
the nine `knowledge` table names; the fourteen role identifiers; the nine claim types;
the eight citation formats; the four OAuth variable names; the nineteen administrative
surfaces; the nineteen public surfaces; publication immutability; separation of duties;
the atomic publication transaction; the ten final completion controls; the LLM-citation
limitation statement; and the prohibition on IBM and McKinsey trade dress.

Removed, as permitted: conversational framing and repeated introductory text only.

Consolidated with cross-reference: Block 06 defers the OAuth flow to Block 28 while
owning the external identity table; Block 27 defers RLS policy authoring to Block 07
while owning the layers above it; Block 21 defers the LLM-citation limitation statement
to Block 17, which owns it. Each consolidation carries an explicit pointer to the
owning block.

## Conflicts

**Resolved:** six. Five arose during the Section 45 reconciliation — the claim
taxonomy, citation formats, completion controls, ranking signals, and the dual purpose
of the `identity` schema — and are recorded in the manifest's Section 45 Reconciliation
table. The sixth is the branch-name conflict below.

The initialization instruction proposed the branch name
`chore/initialize-crux`, while this session's standing branch requirement designates
`claude/initialize-crux-repository-w49p3o`. The standing requirement was followed, since
pushing to a different branch without permission is prohibited. All other constraints
were honoured: branched from the default branch, no direct push to `main`, no force
push, no history rewrite, no visibility or protection change, no branch or tag deletion,
no collaborator change.

**Unresolved:** none.

## Validation performed

| Check | Command or method | Result |
|---|---|---|
| Block count | `ls .claude/prompts/*.md \| wc -l` | 29 — pass |
| Agent count | `ls .claude/agents/*.md \| wc -l` | 12 — pass |
| Rule count | `ls .claude/rules/*.md \| wc -l` | 9 — pass |
| No empty files | `find .claude docs -type f -empty` | No output — pass |
| All 14 sections per block | Scripted `grep -qF` over every required heading in all 29 files | No missing sections — pass |
| All 7 sections per agent | Scripted `grep -qF` over every required heading in all 12 files | No missing sections — pass |
| Placeholder scan | `grep -RniE 'TODO\|TBD\|insert architecture\|pending content installation\|see prior conversation\|content to be added\|placeholder'` | 3 matches, all reviewed manually — see below — pass |
| Secret scan | `grep -RniE 'service_role\|client_secret\|BEGIN (RSA )?PRIVATE KEY\|ghp_\|github_pat_\|sk-[A-Za-z0-9]{10}'` | 6 matches, all reviewed manually — see below — pass |
| Hash generation | `find .claude/prompts -type f -name '*.md' -print0 \| sort -z \| xargs -0 sha256sum` | 29 hashes recorded in the manifest — pass |
| Working tree | `git status --short` | Only intended files — pass |
| Whitespace | `git diff --check` | Clean — pass |

### Placeholder scan — manual review of all 3 matches

| Location | Text | Verdict |
|---|---|---|
| `prompts/00-master-orchestrator.md:145` | "A block file is missing, or contains **placeholder** content." | Legitimate — a stopping condition prohibiting placeholders |
| `prompts/09-admin-dashboard.md:93` | "No surface displays a **placeholder**, sample, or estimated figure." | Legitimate — a prohibition |
| `.github/ISSUE_TEMPLATE/bug_report.yml:27` | `placeholder:` | Legitimate — a GitHub issue-form schema key |

**No unresolved placeholder content exists.** No file contains `TODO`, `TBD`, "Prompt
content to be added", "Pending content installation", "Insert architecture here", or
"See prior conversation".

### Secret scan — manual review of all 6 matches

All six are the **variable name** `GOOGLE_OAUTH_CLIENT_SECRET` — either assigned an
empty value in `.env.example:52`, or discussed in prose in Blocks 23 and 28 explaining
that the secret must remain server-side. Per the installation procedure, variable names
in `.env.example` are not treated as exposed secrets.

**No secret value, credential, private key, token, or `service_role` reference exists
anywhere in the repository.**

## What was NOT installed

Deliberately out of scope for initialization:

- Application implementation of any kind.
- Framework installation, package manifest, or dependency lockfile.
- Supabase project configuration or database migrations.
- Any production credential or environment value.
- CI/CD workflows (owned by Block 23).
- Any deployment.

## Recommended next block

**Block 01 — Repository Assessment**, owned by `product-architect`.

It has no dependencies and is the only block currently *Ready*. It should confirm or
correct every finding in `docs/repository-assessment.md` by direct inspection, select
the package manager and Node version, and produce
`docs/architecture-decisions/0001-baseline-repository-state.md`.
