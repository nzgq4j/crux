# Block 09 — Administrative Dashboard

## Objective

Build a functional `/admin` application in which every listed surface operates on
live data and every mutation is authorised server-side. The dashboard is an
operating tool, not a demonstration.

## Scope

### In scope

- The `/admin` application shell, navigation, and all nineteen surfaces below.
- Server-side authorization on every route and every mutation.
- Live metrics derived from the database.

### Out of scope

- The structured editor itself (Block 10), which the content library links into.

## Dependencies

Blocks 06, 07, 08.

## Required Inputs

- `.claude/prompts/06-authentication-authorization.md`, `.claude/prompts/07-rls-security.md`,
  `.claude/prompts/08-editorial-workflow.md`.
- `docs/permissions.md`, `.claude/rules/frontend.md`, `.claude/rules/accessibility.md`.

## Required Outputs

- The `/admin` route tree with all surfaces implemented.
- Server actions or route handlers for every mutation, each permission-checked.
- `docs/administration.md`.

## Functional Requirements

Implement each surface with live data, real filtering, real pagination, and working
mutations:

1. **Dashboard overview** — counts and trends for content by state, review queue
   depth, overdue tasks, publication schedule, search health, download volume, and
   subscription growth. Every figure is queried, never hard-coded.
2. **Content library** — all content items and versions with filters by type, state,
   author, topic, and date; bulk actions permitted only where authorised.
3. **Structured editor** — entry point into Block 10 for a selected version.
4. **Workflow queues** — per-role queues: my assignments, awaiting review, changes
   requested, approved, scheduled, and overdue.
5. **Editorial calendar** — scheduled and recently published content by date, with
   the ability to reschedule or cancel where authorised.
6. **Evidence review** — claims requiring source attachment, quantitative claims
   without a traceable dataset, and sources failing validation.
7. **Citation-quality review** — versions with missing methodology, missing
   limitations, unresolved references, or malformed external identifiers.
8. **Taxonomy manager** — vocabularies and terms, create, merge, deprecate, and
   reassign, with a preview of affected content counts before any destructive merge.
9. **Expert manager** — identity and expert records, affiliations, disclosures, and
   external identifiers.
10. **Asset manager** — asset upload, metadata, alternative text, licensing,
    versions, and replacement.
11. **Download manager** — gated downloads, entitlement rules, and download history.
12. **Newsletter manager** — newsletter types, consent state counts, suppression
    list, and failure queue with retry.
13. **Search-quality manager** — zero-result queries, synonyms, boosts,
    suppressions, and ranking test results.
14. **OAuth-account visibility** — which accounts have linked external identities,
    which provider, when linked, and when last used. Read-only; unlinking is an
    audited administrative action.
15. **User and role manager** — accounts, role assignment, verification state, and
    lockout state. Self-elevation is impossible here as it is everywhere.
16. **Redirect manager** — redirect rows, conflict detection, and loop detection.
17. **Audit viewer** — filterable append-only audit log with actor, action, target,
    and timestamp. Read-only.
18. **Settings** — platform configuration exposed for administration, excluding any
    secret value.
19. **Navigation and shell** — role-aware navigation that omits surfaces the current
    user may not reach.

## Technical Requirements

- Server Components by default; Client Components only for genuine interactivity.
- Every mutation is a server action or route handler that re-verifies permission
  before acting. Hiding a control in the UI is never the authorization mechanism.
- Every list has server-side pagination, sorting, and filtering; no unbounded query.
- Every surface renders explicit loading, empty, success, and failure states.
- Metrics queries are indexed and must not perform table scans on large relations.

## Data Requirements

- Every metric is defined by a documented query with a stated definition, so that
  two surfaces reporting the same figure agree.
- No surface displays a placeholder, sample, or estimated figure.

## Security Requirements

- `/admin` requires an authenticated, verified session with an administrative
  permission; unauthorised access returns a denial, not a redirect that leaks
  existence.
- The privileged client is used only where RLS cannot express the operation, and
  every such use is preceded by an explicit permission check and an audit write.
- Settings never render secret values, not even masked from the server.
- Destructive actions require confirmation naming the exact object and its impact.
- Every mutation writes an audit row.

## Accessibility Requirements

- Full keyboard operability across navigation, tables, filters, dialogs, and menus.
- Visible focus on every interactive element; focus is managed on dialog open and
  close and returned to the invoking control.
- Data tables use proper header semantics, scope, and captions.
- Asynchronous updates, save results, and errors are announced through live regions.
- Sortable columns expose their sort state programmatically.
- No surface conveys state by colour alone.
- This block requires `accessibility-reviewer` sign-off.

## Testing Requirements

- End-to-end tests covering the primary path of each surface.
- Permission tests proving each surface and each mutation is denied to every role
  that must not reach it.
- A test proving no metric is hard-coded: metrics change when the underlying data
  changes.
- Accessibility tests: automated checks plus recorded manual keyboard and
  screen-reader verification for the editor entry, tables, and dialogs.

## Documentation Requirements

- `docs/administration.md` documents every surface, who may reach it, what it
  mutates, and its metric definitions.
- Document the destructive actions and their confirmation requirements.

## Acceptance Criteria

- [ ] All nineteen surfaces exist and operate on live data.
- [ ] Every metric is query-derived and its definition documented.
- [ ] Every mutation re-verifies permission server-side.
- [ ] Navigation is role-aware and omits unreachable surfaces.
- [ ] Every list paginates, sorts, and filters server-side.
- [ ] Every surface has loading, empty, success, and failure states.
- [ ] Destructive actions require explicit confirmation and are audited.
- [ ] No secret value is rendered anywhere in the dashboard.
- [ ] Permission denial tests pass for every surface and mutation.
- [ ] `accessibility-reviewer` has signed off.

## Completion Report

Report: surfaces implemented, metric definitions and their queries, mutations added
with their permission checks, audit events emitted, pagination and filtering
approach, loading and failure state coverage, permission test results, accessibility
findings and their resolution, reviewer sign-offs, and documentation written.
