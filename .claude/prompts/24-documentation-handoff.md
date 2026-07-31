# Block 24 — Documentation and Handoff

## Objective

Produce the complete documentation set required for another team to operate, extend,
and audit Crux without access to the implementing session.

## Scope

### In scope

- The twenty-three documentation domains below, verified for accuracy.
- The handoff package and its index.

### Out of scope

- Writing documentation for functionality that does not exist. Documentation
  describes what is built, never what is planned as though it were built.

## Dependencies

All implemented blocks.

## Required Inputs

- Every completed block, its completion report, and its documentation output.
- `docs/implementation-status.md`, `docs/requirements-traceability.md`.
- `.claude/rules/documentation.md`.

## Required Outputs

- A complete, indexed `docs/` set covering every domain below.
- `docs/README.md` as the handoff index.
- Updated `docs/known-limitations.md` and `docs/roadmap.md`.

## Functional Requirements

Ensure each of the following exists, is accurate, and was verified against the
implementation:

1. **Product** — user classes, journeys, and the requirement register.
2. **Architecture** — components, boundaries, flows, and the ADR index.
3. **Database** — every schema, table, column, constraint, trigger, function, and
   index, with the entity diagram.
4. **RLS** — the policy inventory, predicates, and rationale.
5. **Permissions** — the role and permission matrix and separation-of-duties rules.
6. **Threats** — the threat model, mitigations, and accepted residual risk.
7. **Content** — content types, module catalogue and schemas, and the version
   lifecycle.
8. **Editorial workflow** — states, transitions, gates, and the publication
   transaction.
9. **Administration** — every administrative surface, its permissions, its
   mutations, and its metric definitions.
10. **Authors** — the authoring guide, module usage, claim classification, citation
    attachment, and keyboard shortcuts.
11. **Reviewers** — review criteria, evidence checks, and the comment and approval
    procedure.
12. **Publishers** — the publication procedure, gates, scheduling, and cancellation.
13. **Taxonomy** — vocabulary governance, term creation, merge, and deprecation.
14. **Assets** — buckets, validation, licensing, entitlements, and signed delivery.
15. **Citations** — identifiers, URL scheme, metadata model, formats, and the
    limitation statement that technical controls cannot guarantee LLM citation.
16. **Corrections** — the corrections policy, the correction procedure, and the
    withdrawal procedure.
17. **Search** — document construction, ranking, permission filtering, and the
    administrative controls.
18. **API** — endpoints, versioning, pagination, caching, licensing, and the
    OpenAPI reference.
19. **Local development** — prerequisites, setup, scripts, and reset.
20. **Deployment** — environments, configuration matrix, pipeline, and release.
21. **Backup and recovery** — schedule, retention, restore procedure, and rehearsal
    results.
22. **Incident response** — severities, roles, communication, and playbooks.
23. **Known limitations** — every accepted gap, its impact, and its plan.
24. **Roadmap** — deferred scope and its rationale, clearly marked as not built.

## Technical Requirements

- Every command in the documentation must have been executed as written and produced
  the documented result. Untested commands are not acceptable.
- Every environment variable is documented by name, purpose, whether it is required,
  whether it is public or server-only, and its per-environment source. No value is
  documented.
- Diagrams are text-sourced so they remain maintainable and reviewable in diff.
- Cross-references between documents resolve; a link check runs in CI.

## Data Requirements

- Documentation examples use seed or fabricated data, never production data.
- The traceability register is reconciled: every Must-requirement has an
  implementation reference, a test reference, and verification evidence, or is
  explicitly listed as unmet in known limitations.

## Security Requirements

- No document contains a credential, token, private key, internal hostname,
  production connection string, or any exploit detail that would assist an attacker
  beyond what defenders need.
- The threat model documents mitigations without publishing a working attack recipe.
- Documentation stating a security control exists must reference the test proving it.

## Accessibility Requirements

- Documentation states the conformance level achieved, the assistive technology used
  in verification, and every known accessibility limitation with its impact.
- Documentation itself uses accessible structure: real headings, meaningful link
  text, table headers, and text alternatives for any diagram.

## Testing Requirements

- A link check across the documentation set in CI.
- A verification pass in which every documented command is executed on a clean
  checkout and its output compared to the documentation.
- A reconciliation check asserting the traceability register has no unresolved rows
  that are not also listed in known limitations.

## Documentation Requirements

This block is the documentation requirement. Additionally, `docs/README.md` must
index every document, state its owner, and state the date it was last verified
against the implementation.

## Acceptance Criteria

- [ ] All twenty-four documentation domains exist and are accurate.
- [ ] Every documented command was executed and matches its documented output.
- [ ] Every environment variable is documented by name and purpose, without values.
- [ ] No document claims functionality that is not implemented.
- [ ] The citation limitation statement is present.
- [ ] Known limitations are complete and honest.
- [ ] The roadmap is clearly marked as not built.
- [ ] The traceability register is reconciled.
- [ ] The link check passes.
- [ ] No credential, internal hostname, or exploit recipe appears anywhere.

## Completion Report

Report: documents produced or verified per domain, commands executed during
verification with results, environment variables documented, traceability
reconciliation outcome, unmet requirements moved to known limitations, link check
result, and the handoff index location.
