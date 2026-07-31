# crux

Crucible Insight content managed website.

Crux is a production-oriented research, publishing, and digital-content platform. It
publishes structured research with immutable versions, traceable evidence, and
version-aware citations, and it is operated through its own administrative dashboard.

## Platform purpose

- Publish research — articles, reports, white papers, datasets, and collections — as
  structured, citable, machine-readable content.
- Govern that research through a real editorial workflow: assignment, review,
  approval, scheduled publication, correction, and withdrawal.
- Make every quantitative finding traceable to the data and method that produced it.
- Serve the public research corpus accessibly, and serve machines honestly.

## Architecture summary

| Layer | Technology |
|---|---|
| Application | Next.js App Router, React, TypeScript (strict) |
| Database | Supabase PostgreSQL with Row Level Security |
| Authentication | Supabase Auth, including Google OAuth |
| Storage | Supabase Storage, public and private buckets |
| Server functions | Supabase Edge Functions |
| Search | PostgreSQL full-text search with weighted tsvector, plus pgvector |

### Supabase-native CMS

The content management system is built on this project's own Supabase PostgreSQL and
Storage. **No paid or proprietary CMS product or component suite is used.** Content
types, structured modules, versions, taxonomy, workflow, and assets are all first-class
database objects governed by RLS.

### Functional administrative dashboard

`/admin` is an operating tool, not a demonstration. Every surface reads live queried
data, every mutation re-verifies permission on the server and writes an audit row, and
no metric is hard-coded.

## Prompt-block execution model

Implementation is driven by a library of numbered implementation contracts under
`.claude/prompts/` — Blocks 00 through 28. Each block states its objective, scope,
dependencies, inputs, outputs, functional and technical requirements, security,
accessibility, testing and documentation obligations, acceptance criteria, and its
completion report format.

Work proceeds through `.claude/prompts/00-master-orchestrator.md`, which selects the
next eligible block from the dependency matrix, delegates it to the owning specialist
agent in `.claude/agents/`, and refuses to start a block whose dependencies are
incomplete. Security-critical and accessibility-critical blocks require sign-off from a
reviewer other than the implementing agent.

Start at `CLAUDE.md`.

## Current status

**Architecture installed. Application implementation has not begun.**

There is no framework installation, no package manifest, no Supabase configuration, no
migrations, no tests, and no CI/CD in this repository yet. The next eligible block is
**Block 01 — Repository Assessment**.

See `docs/implementation-status.md` for the live per-block state.

## Repository layout

```
CLAUDE.md                                  Root project instructions
.claude/
  architecture-manifest.md                 Installed blocks, hashes, agents, gates
  prompts/                                 Blocks 00–28, the implementation contracts
  agents/                                  Specialist agent role contracts
  rules/                                   Enforceable engineering rules
docs/
  implementation-status.md                 Per-block status and next eligible block
  requirements-traceability.md             Requirement → implementation → test → evidence
  repository-assessment.md                 Initialization baseline
  architecture-block-dependencies.md       Dependency matrix, waves, parallel limits
  architecture-installation-report.md      What was installed, and what was not
  architecture-decisions/                  ADRs
.github/
  pull_request_template.md
  ISSUE_TEMPLATE/                          Bug, feature, and security templates
```

## Security principles

1. Authorization is enforced in PostgreSQL and the trusted server layer — never in the
   browser, and never by hiding a control.
2. RLS is enabled and forced on every table in every exposed schema.
3. Privileged credentials and secret keys stay server-side. Nothing secret reaches a
   client bundle, a log, or this repository.
4. Private reports and datasets are delivered only through short-lived signed URLs
   issued after a server-side entitlement check.
5. Published versions are immutable; audit logs are append-only.
6. Search is permission-aware: restricted content is absent from results, counts,
   facets, and snippets.
7. Denied-access tests are mandatory for every authorization boundary, and no control
   is ever weakened to make a test pass.

## Editorial integrity

Crux does not fabricate research claims, sources, citations, credentials, datasets,
identifiers, or institutional authority. Where a metadata field has no value, it is
omitted rather than filled with a plausible one.

Crux also does not claim that structured data, `llms.txt`, or any other technical
implementation **guarantees** citation by a large language model. These measures improve
the conditions for accurate attribution. They do not compel it.

## Local setup

Not yet available. Setup instructions will be written by Block 04 into
`docs/local-development.md`, and every command in that document will have been executed
before it is published.

## Links

- [Implementation status](docs/implementation-status.md)
- [Architecture manifest](.claude/architecture-manifest.md)
- [Block dependency matrix](docs/architecture-block-dependencies.md)
- [Requirements traceability](docs/requirements-traceability.md)
- [Architecture installation report](docs/architecture-installation-report.md)
