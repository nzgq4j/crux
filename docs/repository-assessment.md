# Crux Repository Assessment — Initialization Baseline

**Status: initialization-time baseline, not the Block 01 deliverable.**

This document records the repository state observed while installing the architecture
pack on 2026-07-31. It exists so that Block 01 starts from a recorded baseline rather
than an empty page. Block 01 — Repository Assessment owns the full assessment, will
execute the build and test commands, and will replace or extend the sections below
with its own findings and a baseline ADR.

## Resolved repository

| Property | Value |
|---|---|
| Owner | nzgq4j |
| Full name | nzgq4j/crux |
| URL | https://github.com/nzgq4j/crux |
| Repository ID | 1317935883 |
| Node ID | R_kgDOTo4bCw |
| Visibility | Public |
| Description | Crucible Insight content managed website |
| Default branch | `main` |
| Latest commit at baseline | `46ecc83e5ec7226b67d01b48d86d8d225879702f` — "Initial commit" |
| Created | 2026-07-31 |
| Branches | `main` only, at the time of resolution |
| Open pull requests | None |
| Open issues | None |
| Archived / disabled | No |

Repository resolution was unambiguous: exactly one accessible repository named `crux`
was found under the authenticated account.

## Existing files at baseline

Two tracked files:

- `README.md` — two lines: the project name and the description "Crucible Insight
  content managed website".
- `.gitignore` — the standard Next.js template, covering `node_modules`, `.next`,
  `out`, `build`, `coverage`, `.env*.local`, `.env`, `.vercel`, `*.pem`, and
  TypeScript build artefacts.

## Inspection findings

| Area | Finding |
|---|---|
| Framework | **Absent.** No `package.json`, no `next.config.*`, no `tsconfig.json`, no `app/` or `pages/` directory. The Next.js-flavoured `.gitignore` reflects the repository creation template, not an installed framework. |
| Package manager | **Absent.** No lockfile of any kind. Not yet chosen. |
| Supabase | **Absent.** No `supabase/` directory, no `config.toml`, no project linkage, no generated types, no client modules. |
| Migrations | **Absent.** No migration directory. The database is unprovisioned. |
| Authentication | **Absent.** No auth implementation, middleware, session handling, route guards, or role model. |
| Tests | **Absent.** No test runner, no test files, no coverage tooling. |
| CI/CD | **Absent.** No `.github/workflows/`, no deployment configuration. |
| Documentation | **Minimal.** The two-line README only. No CLAUDE.md, no ADRs, no runbooks — prior to this initialization. |
| Technical debt | **None inherited.** The repository is effectively empty, so no failing build, deprecated dependency, or unmaintained code path exists. |
| Reusable assets | The `.gitignore` and the README description are the only pre-existing assets. Both were preserved and extended rather than replaced. |
| Secrets | Scanned at initialization. No credential, private key, or token found in the tracked files or in the single commit. |

## Constraints this baseline imposes

1. Every framework, tooling, and infrastructure decision is open. Nothing is inherited
   and nothing must be worked around.
2. Because no package manager is chosen, Block 01 must select one and Block 04 must
   pin it. The Next.js `.gitignore` template implies an intent toward Next.js and
   Vercel, but implies nothing binding.
3. There is no existing schema, so Blocks 04 and 05 define the database from empty.
   The schema and table names specified in the architecture are therefore achievable
   exactly, with no migration-from-legacy compromise.
4. There is no CI, so Block 22's gates and Block 23's pipeline are greenfield.

## What Block 01 must still do

- Select and record the package manager and Node version constraint.
- Execute the build and test commands once tooling exists, and record actual output.
- Produce `docs/architecture-decisions/0001-baseline-repository-state.md`.
- Confirm or correct every finding above by direct inspection at the time it runs.
