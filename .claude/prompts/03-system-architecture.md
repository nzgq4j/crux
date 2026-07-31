# Block 03 — System Architecture

## Objective

Define the runtime composition, trust boundaries, and principal data flows of the
Crux platform so that every later block places its code on the correct side of a
boundary.

## Scope

### In scope

- Application, server, and Supabase boundaries.
- Trust boundaries and the authority for each authorization decision.
- Principal flows: authentication, publication, download, citation.
- Architecture Decision Records for each binding choice.

### Out of scope

- Schema definition (Block 05), policy definition (Block 07), and implementation.

## Dependencies

Blocks 01, 02.

## Required Inputs

- `docs/repository-assessment.md`, `docs/product-requirements.md`.
- `.claude/rules/general.md`, `.claude/rules/backend.md`, `.claude/rules/security.md`.

## Required Outputs

- `docs/architecture.md` with a component diagram and boundary table.
- ADRs under `docs/architecture-decisions/` for each binding decision.
- Updated traceability rows for architecture-owned requirements.

## Functional Requirements

1. **Public application.** Next.js App Router, Server Components by default. Report
   and article bodies are server-rendered semantic HTML. Define which surfaces may
   be static, incrementally revalidated, or dynamic.
2. **Administrative application.** The `/admin` surface, its session requirements,
   its route-level authorization, and its isolation from public rendering paths.
3. **Trusted server layer.** Route handlers, server actions, and Edge Functions that
   hold privileged credentials. Define what may run here and what may not.
4. **Supabase boundary.** Which operations use the anonymous browser client, the
   authenticated server client, and the privileged server client. Define the rule
   that the privileged client is never constructed in a client component.
5. **Storage boundary.** Public buckets versus private buckets, and the rule that
   private objects are only ever delivered through short-lived signed URLs issued
   after a server-side entitlement check.
6. **Search boundary.** Where full-text and vector retrieval execute, and how
   permission filtering is applied within the query rather than after it.
7. **External service abstractions.** Email, newsletter, embeddings, analytics, and
   error monitoring must sit behind an interface so that no provider SDK is called
   directly from feature code.
8. **Authentication flow.** Sign-in, session issuance, refresh, server-side session
   reading, and sign-out, including the Google OAuth callback path defined in
   Block 28.
9. **Publication flow.** Draft to review to approval to publication, ending in an
   atomic transaction that creates an immutable version.
10. **Download flow.** Request, entitlement evaluation, signed URL issuance,
    delivery, and download-event recording.
11. **Citation flow.** Version resolution, metadata assembly, and format rendering.

## Technical Requirements

- TypeScript strict mode across all layers.
- A single generated database type source consumed by every client.
- Environment variables validated at startup; the process fails fast when a required
  variable is absent.
- No feature code imports a provider SDK directly.

## Data Requirements

Define the ownership of each data domain by schema namespace, and the rule that
cross-schema access occurs through defined functions or views rather than ad hoc
joins from application code where a policy boundary is involved.

## Security Requirements

- Enumerate every trust boundary and name the authority that enforces it.
- Authorization is enforced in PostgreSQL and in the trusted server layer. Client
  state is never an authorization input.
- Secret material exists only in the trusted server layer and in Edge Functions.
- Define the threat surfaces to be modelled in detail by Block 07.

## Accessibility Requirements

Architecture must not preclude accessibility: the report reading path must not
require client-side JavaScript to render its primary content, and administrative
surfaces must remain operable without pointer input.

## Testing Requirements

- Each boundary must be testable: define, for each, the test that proves the
  boundary holds and the test that proves crossing it is denied.
- Define where integration tests execute relative to the Supabase boundary.

## Documentation Requirements

- `docs/architecture.md` includes the component diagram, boundary table, and all
  four principal flows.
- One ADR per binding decision, each recording context, decision, alternatives, and
  consequences.

## Acceptance Criteria

- [ ] All eleven architectural elements above are defined.
- [ ] Every trust boundary names its enforcing authority.
- [ ] The privileged-client rule is stated and unambiguous.
- [ ] Private storage delivery is defined as signed-URL-only after a server check.
- [ ] External services are abstracted behind interfaces.
- [ ] All four principal flows are documented end to end, including failure paths.
- [ ] ADRs exist for every binding decision.
- [ ] No decision contradicts an approved requirement from Block 02.

## Completion Report

Report: components defined, boundaries defined with enforcing authority, flows
documented, external abstractions defined, ADRs written, requirements traced,
deviations from Block 02 with justification, and open risks referred to Block 07.
