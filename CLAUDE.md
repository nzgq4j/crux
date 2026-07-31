# Crux Project Mission

Build a production-oriented research, publishing, and digital-content platform using
Next.js, TypeScript, and a native Supabase backend.

The platform includes:

- Public research publishing
- Supabase-native CMS
- Functional administrative dashboard
- Structured content and immutable publication versions
- Editorial review and publication workflows
- User accounts and access entitlements
- Controlled report and white-paper downloads
- Newsletter subscriptions and preference management
- Permission-aware hybrid search
- Claims, evidence, and provenance
- Citation exports
- Machine-readable public knowledge
- Accessibility, security, observability, and operational controls

# Architecture Execution

1. Treat `.claude/prompts/` as the authoritative implementation-contract library.
2. Read only the current block, its direct dependencies, applicable rules, and
   relevant implementation files.
3. Use `.claude/prompts/00-master-orchestrator.md` to select and sequence work.
4. Do not implement a block whose dependencies are incomplete.
5. Do not mark a block complete until every mandatory acceptance criterion passes.
6. Update:
   - `docs/implementation-status.md`
   - `docs/requirements-traceability.md`
   - `.claude/architecture-manifest.md`

# Technical Rules

1. Use Supabase PostgreSQL, Auth, Storage, Edge Functions, and RLS.
2. Do not introduce a paid CMS or proprietary CMS component suite.
3. Keep privileged credentials and secret keys server-side.
4. Enforce authorization in PostgreSQL and the trusted server layer.
5. Write migrations, tests, and documentation with functional changes.
6. Preserve published-version immutability.
7. Preserve complete auditability.
8. Preserve evidence and analytical provenance.
9. Ensure search is permission aware.
10. Do not fabricate research claims, sources, citations, credentials, datasets,
    identifiers, or institutional authority.
11. Do not claim that structured data, `llms.txt`, or any technical implementation
    guarantees citation by an LLM.
12. When implementing OAuth:
    - Use Supabase Auth unless explicitly directed otherwise.
    - Never store OAuth secrets in client code.
    - Make account linking deterministic and auditable.
    - Prevent duplicate account creation across providers.
13. Inspect existing code before replacing or creating overlapping functionality.
14. Preserve compatible existing functionality.
15. Do not push directly to the default branch.

# Repository Map

| Path | Purpose |
|---|---|
| `.claude/prompts/` | Blocks 00–28, the implementation contracts |
| `.claude/agents/` | Specialist agent role contracts |
| `.claude/rules/` | Enforceable engineering rules |
| `.claude/architecture-manifest.md` | Installed blocks, hashes, agents, gates |
| `docs/implementation-status.md` | Per-block status and next eligible block |
| `docs/requirements-traceability.md` | Requirement to implementation to test mapping |
| `docs/architecture-block-dependencies.md` | Dependency matrix and execution waves |
| `docs/architecture-decisions/` | ADRs |

# Engineering Rules

Load the rule files relevant to the work in hand:

- `.claude/rules/general.md` — always
- `.claude/rules/frontend.md` — Next.js and React work
- `.claude/rules/backend.md` — server actions, route handlers, Edge Functions
- `.claude/rules/database.md` — migrations, schema, policies, functions
- `.claude/rules/security.md` — any authorization, secret, or upload work
- `.claude/rules/content-modeling.md` — content, claims, taxonomy, citations
- `.claude/rules/accessibility.md` — any user-facing surface
- `.claude/rules/testing.md` — always, when writing code
- `.claude/rules/documentation.md` — always, when writing documentation

# Current Status

Architecture installed. **Application implementation has not begun.** The next
eligible block is Block 01 — Repository Assessment.
