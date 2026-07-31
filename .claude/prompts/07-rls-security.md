# Block 07 — RLS and Security

## Objective

Author and verify the Row Level Security policy set, the permission matrix, and the
threat model, so that every exposed table, storage object, and derived index enforces
access control in PostgreSQL rather than in application code.

## Scope

### In scope

- RLS policies for every exposed table across all schemas.
- Storage object policies.
- The permission matrix and its mechanical verification.
- The platform threat model.
- Allowed and denied test suites.

### Out of scope

- Application hardening measures owned by Block 27.

## Dependencies

Blocks 05, 06.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/06-authentication-authorization.md`.
- `docs/permissions.md`.
- `.claude/rules/security.md`, `.claude/rules/database.md`, `.claude/rules/testing.md`.

## Required Outputs

- Migrations enabling RLS and creating policies on every exposed table.
- `docs/rls.md` — the policy inventory and its rationale.
- `docs/threat-model.md`.
- An automated allowed/denied test suite.

## Functional Requirements

1. **RLS matrix.** A table listing every exposed relation and, per role, whether
   select, insert, update, and delete are permitted and under what predicate. Every
   exposed relation appears; no relation is omitted as "internal".
2. **Permission matrix.** A machine-checkable mapping from role to permission to
   protected operation, verified by test rather than by review alone.
3. **Threat model.** Identify actors, assets, entry points, and abuse cases. At
   minimum cover: draft disclosure, privilege escalation, cross-tenant data reading,
   private asset exfiltration, search-based inference of restricted content, audit
   tampering, and OAuth account takeover through identifier collision.
4. **Public content policies.** Anonymous read access is limited to published,
   non-withdrawn versions of publicly licensed content items and their published
   modules, contributors, and taxonomy assignments.
5. **Draft isolation.** Draft and in-review versions are readable only by their
   assigned contributors and by roles holding the editorial read permission. No
   policy path allows an anonymous or merely registered user to read a draft.
6. **User-owned data.** Profiles, preferences, download history, subscription
   records, and saved items are readable and writable only by their owner and by
   the administrative roles that require them.
7. **Editorial access.** Author, reviewer, editor, managing editor, and publisher
   access is scoped by assignment where the workflow assigns work, not granted
   globally by role alone.
8. **Storage policies.** Public buckets permit anonymous read of published assets
   only. Private buckets permit no direct read; access is exclusively through signed
   URLs issued by the trusted server layer after an entitlement check.
9. **Search-document policies.** Search rows inherit the visibility of their source
   content. A restricted document must be unreachable through search for a user who
   cannot read the document, including through result counts and snippets.
10. **Embedding policies.** Vector rows carry the same visibility as their source.
    Similarity queries must filter by permission inside the query.
11. **Claims and source policies.** Claims, sources, and provenance rows attached to
    a published version are publicly readable; those attached to drafts are not.
12. **Audit protections.** Audit tables are append-only. No role may update or
    delete an audit row. Read access is limited to designated administrative roles.
13. **OAuth external-identifier protections.** No role may insert, update, or delete
    an external identity row through the API. Only the trusted server layer writes
    them. A user may read their own linked identities and may not link an identity
    already bound to another account.

## Technical Requirements

- RLS is enabled and forced on every table in every exposed schema.
- Policies use the `private` permission functions from Block 06 rather than
  re-implementing role logic.
- Policies are written per operation with explicit `using` and `with check` clauses;
  a permissive catch-all policy is prohibited.
- Any `SECURITY DEFINER` function sets a restricted `search_path` and is documented.

## Data Requirements

- Every new relation added by a later block must arrive with a policy; record this
  as a standing requirement enforced in review.
- Views over protected tables must be `security_invoker` or otherwise proven not to
  leak.

## Security Requirements

- The default posture is deny; access is granted by explicit policy only.
- No policy may consult a client-supplied claim that the user can set.
- Rate limiting, abuse controls, and headers are deferred to Block 27, but this
  block must record any dependency it places on them.
- This block requires independent review by `database-security-reviewer`; the
  implementing agent may not approve it.

## Accessibility Requirements

Denial must be communicated accessibly: an authorization failure surfaces a clear,
programmatically announced message and never a silent empty state that a
screen-reader user cannot distinguish from "no results".

## Testing Requirements

- **Denied-access tests are mandatory.** For every relation and role pair where
  access is denied, a test must assert the denial.
- Allowed-access tests for every permitted pair.
- A test enumerating all tables in exposed schemas and asserting RLS is enabled,
  so that a future table cannot be added without a policy.
- A test proving a private storage object is unreachable without a signed URL.
- A test proving restricted content does not appear in search results or counts for
  an unauthorised user.
- A test proving audit rows cannot be updated or deleted by any role.

## Documentation Requirements

- `docs/rls.md` lists every relation, policy, predicate, and rationale.
- `docs/threat-model.md` records actors, assets, abuse cases, mitigations, and
  accepted residual risk.
- Document every `SECURITY DEFINER` function and why it requires that privilege.

## Acceptance Criteria

- [ ] RLS is enabled and forced on every table in every exposed schema.
- [ ] Every relation appears in the RLS matrix.
- [ ] Draft content is unreachable by anonymous and registered users, proven by test.
- [ ] Private storage is unreachable without a server-issued signed URL.
- [ ] Search and embedding rows enforce source visibility, proven by test.
- [ ] Audit tables are provably append-only.
- [ ] External identity rows are unwritable through the API.
- [ ] Denied tests exist for every denied role and relation pair, and all pass.
- [ ] The enumeration test that catches unprotected new tables exists and passes.
- [ ] `database-security-reviewer` has signed off independently.

## Completion Report

Report: relations protected, policies created per relation and operation, the RLS
matrix location, threat model coverage, storage policies, search and embedding
policies, audit protections, external identity protections, allowed and denied test
counts with results, residual risks accepted, and the independent reviewer's sign-off.
