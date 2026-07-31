# Crux Architecture Manifest

- **Architecture version:** 1.0.0
- **Installation date:** 2026-07-31
- **Repository:** nzgq4j/crux
- **Installation branch:** `claude/initialize-crux-repository-w49p3o`
- **Base commit:** `46ecc83e5ec7226b67d01b48d86d8d225879702f`
- **Installation validation status:** Passed — 29 of 29 prompt blocks installed, all
  fourteen required sections present in every block, no empty files, no unresolved
  placeholders, no secrets detected.

## Source Document

The approved modular architecture was supplied **directly in the Claude Code
initialization instruction** — acceptable source type 1 under the installation
procedure's Section 6. That instruction contained the functional definitions for
Blocks 00 through 28, the dependency matrix, execution and parallel-execution
constraints, block invocation rules, independent-review assignments, context-control
rules, exact schema and table names, the fourteen-role model, the required environment
variable names, the eight citation formats, and the final completion controls.

No external architecture document, repository file, or connector-accessible source was
used. Nothing was drawn from an earlier conversation.

## Known Source Gaps

One gap is recorded rather than silently filled:

| Gap | Block | What was supplied | What was done |
|---|---|---|---|
| The verbatim text of the approved "Section 45" final checklist | 26 | The instruction directed installation of "the approved final Section 45 checklist in full", then enumerated the thirteen coverage areas the checklist must cover and the ten final completion controls to preserve. The verbatim Section 45 prose itself was not present in the instruction. | Block 26 was constructed from the supplied coverage areas and the ten completion controls, all of which are preserved exactly. A **Source Note** in `26-implementation-checklist.md` records this and instructs reconciliation if the verbatim text is later provided. |

Two further items were supplied as requirements rather than as prose and were therefore
derived, not transcribed:

- **Execution waves** — the instruction supplied the dependency matrix and required
  that parallel and sequential blocks be documented. The wave plan in
  `docs/architecture-block-dependencies.md` is derived from that matrix.
- **Remediation procedure** — supplied as a required capability of Block 00 rather than
  as prose; written into Block 00 functional requirement 9.

No block was invented, stubbed, or abbreviated. No requirement was reinterpreted to
shorten a prompt.

## Installed Blocks

A block is marked **Installed** only where it contains its complete specification with
all fourteen required sections.

| Block | File | Dependencies | Agent | Hash (SHA-256) | Status |
|---|---|---|---|---|---|
| 00 | `prompts/00-master-orchestrator.md` | None | product-architect | `0d798952908eac43f0521946300f0f9bf92bddfb721a9f0ec8dad80103125ca7` | Installed |
| 01 | `prompts/01-repository-assessment.md` | None | product-architect | `7b00e6dd339dcc4ee14ecf635d832dc4ba53c16406bff1f9d9d892b801af9358` | Installed |
| 02 | `prompts/02-product-requirements.md` | 01 | product-architect | `bf24fa2cb0f7f4cd8f3e3105ade830037f29f589b7ec2d82ec5ae4f72b1b87fa` | Installed |
| 03 | `prompts/03-system-architecture.md` | 01, 02 | product-architect | `23ec6a38e196adf767cd15c9c6b746c68a8b138e60610182de69616d864a6bdb` | Installed |
| 04 | `prompts/04-supabase-foundation.md` | 03 | supabase-architect | `05a9ee80634de95201a030c94149ac7e0b171f628b45b5b067224a0fb1204e6e` | Installed |
| 05 | `prompts/05-database-content-model.md` | 04 | supabase-architect | `bac76b948f7f8802958f1bfd2ed8bcc6047f1d540e3c6231604f4486a6db9022` | Installed |
| 06 | `prompts/06-authentication-authorization.md` | 04, 05 | supabase-architect | `a6ae19298857e6860f9e1d1f2e4da6b4d93ffcdbce3f306de491d12968b721ef` | Installed |
| 07 | `prompts/07-rls-security.md` | 05, 06 | database-security-reviewer | `dadf5d819164ba2f343545b458290952eb35212a3a065d0ef1641fcd9d962653` | Installed |
| 08 | `prompts/08-editorial-workflow.md` | 05, 06, 07 | editorial-workflow-engineer | `b3c668dc970047976b70765467aff474f01ec1a7f371ecf8e665ebe4c1bd15c3` | Installed |
| 09 | `prompts/09-admin-dashboard.md` | 06, 07, 08 | cms-product-engineer | `3fd010cb02ae49d3990c529f67397dc925e452ed56c4c7c58bb12402c57b5c10` | Installed |
| 10 | `prompts/10-structured-editor.md` | 05, 08, 09 | cms-product-engineer | `8ac9c58a49cab769383fd24a8d568e85264796eb7e039b33940c129d3a4da7d2` | Installed |
| 11 | `prompts/11-public-experience.md` | 05, 07 | design-system-engineer | `f9b05fcb77b8254a4bc4a7d71ed367bea5b438cc93578b531ab789aa6853abcb` | Installed |
| 12 | `prompts/12-design-system.md` | 02, 03 | design-system-engineer | `cc8102f9ea13dd2f78673e0c527fab12a6cda24532bcd15c27388cf95bd30b9e` | Installed |
| 13 | `prompts/13-assets-downloads.md` | 04, 06, 07 | supabase-architect | `3cceefed64331b3614ecc6c08fe2b7b91beda807e55bbb802dd856b582ae2312` | Installed |
| 14 | `prompts/14-newsletter-subscriptions.md` | 04, 06 | cms-product-engineer | `619aa306499b1fd577cc05e389c3b0bc2f9abb72dddc94b072ac27daa8d2f55a` | Installed |
| 15 | `prompts/15-search-retrieval.md` | 05, 07 | search-relevance-engineer | `d16bcaac04c2fa8d7927af9a4c86c9a6df60114dfc0495cc31bb7089e2a741b9` | Installed |
| 16 | `prompts/16-claims-provenance.md` | 05, 08 | provenance-engineer | `1dc63e20f4839934afd24a28e1e817d1cc1f3f75181c961f0f68d590770e1f83` | Installed |
| 17 | `prompts/17-citation-authority.md` | 05, 16 | citation-discovery-reviewer | `96038c7fd4af509bf41cfd62032c29f5c34a177f7a1eb5f625c47421cdce86e0` | Installed |
| 18 | `prompts/18-public-api.md` | 05, 07, 17 | citation-discovery-reviewer | `35ff73f4c82da57d44805b887fad964522ea13b2fc728b2753f5213b3e589a2e` | Installed |
| 19 | `prompts/19-analytics-observability.md` | 03, 04 | deployment-engineer | `a89fb41dff534850b657f8cbde10a8d9ed36a77984421b13d07e441be99d5c0e` | Installed |
| 20 | `prompts/20-accessibility.md` | 09, 10, 11, 12 | accessibility-reviewer | `b95f9f986f80413b5130cbd092a2b55e79121f76593011d0b8863b5d8e453811` | Installed |
| 21 | `prompts/21-seo-machine-discovery.md` | 11, 17 | citation-discovery-reviewer | `3ab3ca89dc190ff5c992420fe986c769ce4bb1a07b6f9243f14dc75520982449` | Installed |
| 22 | `prompts/22-testing-quality.md` | All implemented blocks | test-engineer | `89a990cc01598b0be4b44d3f244c82cef25ae8e884f371c404baa66bda0159f9` | Installed |
| 23 | `prompts/23-deployment-operations.md` | 04, 07, 19, 22 | deployment-engineer | `b80b668b94aa41363f6bff6b9c2ac7be5639dccbec793ae72d7a215e6619ec5a` | Installed |
| 24 | `prompts/24-documentation-handoff.md` | All implemented blocks | product-architect | `3f91193063c9d5603fe8ec146e60e579ff381f86299053453fc66aba7d10dd92` | Installed |
| 25 | `prompts/25-final-validation.md` | 22, 23, 24 | product-architect | `9a960c7c08415e4c1d79a8209e4c35c118cb81737868385be13e442e51a43ce4` | Installed |
| 26 | `prompts/26-implementation-checklist.md` | 25 | test-engineer | `47c0490226e291953c928674b7dc8513ba3e590faecdf1852e567ef098311c08` | Installed — see Known Source Gaps |
| 27 | `prompts/27-security-hardening.md` | 04, 06, 07, 13, 19 | database-security-reviewer | `dd869e9ebe6bde824aabb3c91d515f24f7c5436b548b337da1b3092d5d90cb37` | Installed |
| 28 | `prompts/28-google-oauth-authentication.md` | 04, 06, 07 | database-security-reviewer | `739e69ec26c219c77973cc6ea7a33115dbdb7d4db788dcb48fe28bd68e276beb` | Installed |

Regenerate hashes with:

```bash
find .claude/prompts -type f -name '*.md' -print0 | sort -z | xargs -0 sha256sum
```

## Required Outputs by Block

| Block | Principal required outputs |
|---|---|
| 00 | Block selection, delegation, register updates, completion reports |
| 01 | `docs/repository-assessment.md`, baseline ADR |
| 02 | `docs/product-requirements.md`, seeded traceability rows |
| 03 | `docs/architecture.md`, ADRs per binding decision |
| 04 | `supabase/config.toml`, foundation migration, three typed clients, seed, env validation, `docs/local-development.md` |
| 05 | Eight `cms` tables, taxonomy and identity schemas, `docs/database.md` |
| 06 | Roles, permissions, permission function, auth routes, `docs/permissions.md` |
| 07 | RLS policies on every exposed relation, `docs/rls.md`, `docs/threat-model.md` |
| 08 | `workflow` tables, transition functions, publication transaction, `docs/editorial-workflow.md` |
| 09 | Nineteen `/admin` surfaces, `docs/administration.md` |
| 10 | Structured editor, `docs/authors.md` |
| 11 | Nineteen public surfaces, `docs/public-surfaces.md` |
| 12 | Token system, component library, `docs/design-system.md` |
| 13 | `assets` schema, bucket policies, signed-download route, `docs/assets.md` |
| 14 | `subscriptions` schema, provider adapter, `docs/newsletter.md` |
| 15 | `search` schema, embedding pipeline, ranking harness, `docs/search.md` |
| 16 | Nine `knowledge` tables, traceability validators, `docs/provenance.md` |
| 17 | Citation service, eight format renderers, `docs/citations.md` |
| 18 | Read-only API, OpenAPI document, `docs/api.md` |
| 19 | `analytics` schema, logging and redaction, health endpoints, `docs/observability.md` |
| 20 | Remediation, accessibility CI suite, `docs/accessibility.md` |
| 21 | Sitemaps, feeds, JSON-LD, alternates, `llms.txt`, corpus manifest, `docs/machine-discovery.md` |
| 22 | Ten test tiers, CI gates, `docs/testing.md` |
| 23 | CI/CD workflows, `docs/deployment.md`, `docs/backup-recovery.md`, `docs/incident-response.md` |
| 24 | Complete indexed `docs/` set, `docs/README.md` |
| 25 | `docs/final-validation-report.md` |
| 26 | `docs/final-implementation-checklist.md`, release recommendation |
| 27 | Headers, CSP, rate limiting, `docs/security-hardening.md` |
| 28 | OAuth routes and linking service, `docs/oauth.md`, linking-policy ADR |

## Mandatory Acceptance Gates

| Gate | Applies to | Enforcing agent |
|---|---|---|
| Independent security review | 06, 07, 13, 15, 27, 28 | `database-security-reviewer` — may not be the implementing agent |
| Accessibility sign-off | 09, 10, 11, 12, 13, 14, 20 | `accessibility-reviewer` |
| Independent acceptance validation | All blocks | `test-engineer` |
| Denied-access test coverage | Every authorization boundary | `test-engineer` |
| Atomic publication proof | 08 | `editorial-workflow-engineer`, verified by `test-engineer` |
| Ranking regression threshold | 15, 22 | `search-relevance-engineer` |
| Ten final completion controls | 26 | `test-engineer` with `database-security-reviewer` |

## Specialist Agents Installed

| Agent | File | Owns |
|---|---|---|
| Product Architect | `agents/product-architect.md` | 00, 01, 02, 03, 25, 24 (coordination) |
| Supabase Architect | `agents/supabase-architect.md` | 04, 05, 08 (db), 13 (db), 23 (db ops) |
| Database Security Reviewer | `agents/database-security-reviewer.md` | Independent review of 06, 07, 13, 15, 27, 28 |
| CMS Product Engineer | `agents/cms-product-engineer.md` | 09, 10, 08 (admin UI), 14 (admin UI) |
| Editorial Workflow Engineer | `agents/editorial-workflow-engineer.md` | 08, 16 (editorial), corrections and withdrawal |
| Design System Engineer | `agents/design-system-engineer.md` | 11, 12 |
| Accessibility Reviewer | `agents/accessibility-reviewer.md` | 20, accessibility review across 09–14 |
| Search Relevance Engineer | `agents/search-relevance-engineer.md` | 15, 21 (search portions) |
| Provenance Engineer | `agents/provenance-engineer.md` | 16, 17 (provenance portions) |
| Citation and Discovery Reviewer | `agents/citation-discovery-reviewer.md` | 17, 18, 21 |
| Test Engineer | `agents/test-engineer.md` | 22, 26, independent acceptance validation |
| Deployment Engineer | `agents/deployment-engineer.md` | 19, 23, 25 (operational) |

## Engineering Rules Installed

`rules/general.md`, `rules/frontend.md`, `rules/backend.md`, `rules/database.md`,
`rules/security.md`, `rules/content-modeling.md`, `rules/accessibility.md`,
`rules/testing.md`, `rules/documentation.md`

## Superseded Sections

None. This is the initial installation; no prior architecture existed in this
repository to supersede.

## Cross-Block Amendments

Block 28 is additive and patches Blocks 06, 07, 09, 19, 23, and 27 without redefining
them. Those blocks must be re-validated after Block 28 completes. The amendment list is
in `prompts/28-google-oauth-authentication.md`.

## Maintenance

When a prompt file changes, regenerate its hash and update this manifest in the same
change. A hash mismatch means a block was edited without the manifest being updated,
and is treated as a defect.
