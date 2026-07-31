# Crux Architecture Block Dependencies

The authoritative dependency matrix. Block eligibility is derived from this file and
nothing else. A block is *Ready* when every direct dependency is *Complete* with
recorded evidence in `docs/implementation-status.md`.

## Dependency matrix

| Block | Name | Depends on |
|---|---|---|
| 00 | Master Orchestrator | None |
| 01 | Repository Assessment | None |
| 02 | Product Requirements | 01 |
| 03 | System Architecture | 01, 02 |
| 04 | Supabase Foundation | 03 |
| 05 | Database Content Model | 04 |
| 06 | Authentication and Authorization | 04, 05 |
| 07 | RLS and Security | 05, 06 |
| 08 | Editorial Workflow | 05, 06, 07 |
| 09 | Administrative Dashboard | 06, 07, 08 |
| 10 | Structured Editor | 05, 08, 09 |
| 11 | Public Experience | 05, 07 |
| 12 | Design System | 02, 03 |
| 13 | Assets and Downloads | 04, 06, 07 |
| 14 | Newsletter Subscriptions | 04, 06 |
| 15 | Search and Retrieval | 05, 07 |
| 16 | Claims and Provenance | 05, 08 |
| 17 | Citation and Authority | 05, 16 |
| 18 | Public Knowledge API | 05, 07, 17 |
| 19 | Analytics and Observability | 03, 04 |
| 20 | Accessibility | 09, 10, 11, 12 |
| 21 | SEO and Machine Discovery | 11, 17 |
| 22 | Testing and Quality | All implemented blocks |
| 23 | Deployment and Operations | 04, 07, 19, 22 |
| 24 | Documentation and Handoff | All implemented blocks |
| 25 | Final Validation | 22, 23, 24 |
| 26 | Implementation Checklist | 25 |
| 27 | Security Hardening | 04, 06, 07, 13, 19 |
| 28 | Google OAuth | 04, 06, 07 |

## Execution waves

Waves are a planning aid. Eligibility is still governed by the matrix above and by the
parallel restrictions below.

| Wave | Blocks | Notes |
|---|---|---|
| 0 | 00 | Control contract; runs continuously, not once |
| 1 | 01 | Baseline |
| 2 | 02 | Requirements |
| 3 | 03 | Architecture |
| 4 | 04 | Substrate |
| 5 | 05, 12, 19 | 12 and 19 unblock early and touch disjoint files |
| 6 | 06 | Roles and auth |
| 7 | 07 | Policies — strictly after 06 |
| 8 | 08, 11, 13, 14, 15, 28 | Broad fan-out once policies exist |
| 9 | 09, 16 | Admin shell and provenance |
| 10 | 10, 17 | Editor and citations |
| 11 | 18, 21, 27 | API, discovery, hardening |
| 12 | 20 | Accessibility remediation across built surfaces |
| 13 | 22 | Testing and quality |
| 14 | 23 | Deployment and operations |
| 15 | 24 | Documentation and handoff |
| 16 | 25 | Final validation |
| 17 | 26 | Implementation checklist |

## Permitted concurrent groups

These sets share no dependency edge and touch disjoint files:

- **{05, 12}** — schema work and design tokens.
- **{12, 19}** — design tokens and observability.
- **{11, 13, 14}** — public surfaces, assets, and subscriptions, provided 13 and 14
  keep to their own schemas.
- **{14, 15}** — subscriptions and search.
- **{16, 17}** once 16 is complete — provenance and citation are sequential to each
  other but each may run alongside 18 or 21 work that does not touch their tables.
- **{21, 27}** — discovery artefacts and hardening.

## Strictly sequential pairs

These may never run concurrently, regardless of file overlap:

- **06 → 07.** Policies must observe the finished role model.
- **09 → 10.** The editor builds on the administrative shell.
- **05 → 16.** Provenance extends the content model.
- **16 → 17.** Citation metadata draws on provenance.
- **22 → 23 → 24 → 25 → 26.** The terminal chain is strictly ordered.

## Additional parallel-execution restrictions

1. No two blocks may modify the same migration sequence concurrently. Migration
   authorship is serialised even when the owning blocks are otherwise independent.
2. No more than three blocks may be in progress at any one time.
3. A block requiring independent review may not begin its review while a concurrent
   block is modifying the same relations.
4. Blocks 22 and 24 depend on "all implemented blocks": they may only start once the
   orchestrator has frozen the set of blocks intended for the release, and any block
   completed after they start invalidates their completion.

## Cross-block amendments

Block 28 is additive and patches Blocks 06, 07, 09, 19, 23, and 27 without redefining
them. See `.claude/prompts/28-google-oauth-authentication.md` for the amendment list.
Those blocks must be re-validated after Block 28 completes.
