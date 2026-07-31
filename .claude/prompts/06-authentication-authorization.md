# Block 06 — Authentication and Authorization

## Objective

Implement Supabase Auth-backed authentication and a database-backed authorization
model with explicit roles, permissions, and separation of duties.

## Scope

### In scope

- Email and password authentication, verification, and recovery.
- Session management across server and browser.
- Profiles, roles, permissions, and role assignment.
- Database-backed permission checks and separation-of-duties constraints.
- The external identity structure consumed by Block 28.

### Out of scope

- RLS policy authoring (Block 07) and the Google OAuth flow itself (Block 28).

## Dependencies

Blocks 04, 05.

## Required Inputs

- `.claude/prompts/04-supabase-foundation.md`, `.claude/prompts/05-database-content-model.md`.
- `.claude/rules/security.md`, `.claude/rules/backend.md`, `.claude/rules/database.md`.

## Required Outputs

- Migrations creating the `identity` and `accounts` authorization tables.
- Authentication routes, server session helpers, and middleware.
- Permission-checking functions in the database and a server-side equivalent.
- `docs/permissions.md` with the full role and permission matrix.

## Functional Requirements

1. **Supabase Auth.** All authentication is issued by Supabase Auth. No parallel
   credential store is created.
2. **Email and password.** Registration with password strength enforcement, and
   sign-in with generic failure messaging that does not disclose account existence.
3. **Email verification.** Required before privileged capabilities are granted.
   Unverified accounts may read public content only.
4. **Password recovery.** Time-limited, single-use recovery, invalidating existing
   sessions on password change.
5. **Session management.** Sessions readable server-side from cookies, refreshed
   safely, revocable, and cleared on sign-out across all surfaces. Configure JWT
   expiration explicitly and enforce secure session cookies (§45.2.1).
5a. **Multifactor authentication (optional).** Provide an MFA extension point per
   §45.2.1. MFA is optional for this release; the extension point is not. If MFA is
   deferred, record the deferral as a Deferred row in
   `docs/requirements-traceability.md` — which Block 24 reconciles into
   `docs/known-limitations.md` — rather than removing the hook.
6. **Profiles.** `accounts.profiles` — a row created for every auth user through a
   trigger, with display name, contact preferences, and a link to an identity record
   where the user is a contributor.
7. **Roles.** `identity.roles`, seeded with exactly:

   `registered_user`, `subscriber`, `research_member`, `contributor`, `author`,
   `reviewer`, `editor`, `managing_editor`, `publisher`, `taxonomy_manager`,
   `asset_manager`, `analytics_viewer`, `user_administrator`,
   `platform_administrator`

8. **Permissions.** `identity.permissions`, with `identity.role_permissions` mapping
   permissions to roles and `identity.user_roles` mapping roles to users (§45.1.5).
   Permissions are granular verbs over resources, not role names re-used as
   permissions. The permission set spans at minimum the four action families named in
   §45.2.3 — **content actions, taxonomy actions, asset actions, and admin actions** —
   and the server-side resolver maps permissions across all four.

   **Schema note.** The `identity` schema carries two related but distinct concerns:
   the authorization model (`roles`, `permissions`, `user_roles`,
   `role_permissions`) and the bibliographic identity records defined in Block 05
   (people and organisations cited as authors, reviewers, and sources). These are
   separate table families in one namespace. A platform user and a cited author are
   different entities; link them explicitly through `accounts.profiles` rather than
   conflating them.
9. **Database-backed authorization.** A `private` schema function returning whether
   the current user holds a named permission, usable inside RLS policies and callable
   from the trusted server layer. Application code never computes permissions from
   client-held state.
10. **Separation of duties.** Enforce in the database:
    - A user may not review a version they authored.
    - A user may not approve a review they performed.
    - A user may not publish a version they authored, unless an explicit,
      audited exception role grants it.
    - Role assignment requires `user_administrator` or `platform_administrator`,
      and no user may elevate their own roles.
11. **External identity support.** `accounts.external_identities` — recording
    provider, provider subject identifier, linked user, verified email at link time,
    first-linked timestamp, and last-used timestamp, unique on provider plus subject.
    It sits in `accounts` alongside `accounts.profiles`, reinforcing that a platform
    account is distinct from a bibliographic identity record. Block 28 populates it.
12. **Google OAuth integration reference.** This block provides the storage and role
    resolution that Block 28 depends on. See `.claude/prompts/28-google-oauth-authentication.md`
    for the flow itself; do not implement the OAuth flow here.

## Technical Requirements

- **JWT validation (§45.2.4).** Every server action, route handler, and Edge Function
  validates the Supabase JWT server-side before performing any work. Validation
  happens per request against the current signing key; a cached or client-asserted
  identity is never sufficient.
- **Expired tokens are rejected (§45.2.4).** An expired or otherwise invalid token is
  refused outright and never silently refreshed into an authorized session. Expiry is
  evaluated server-side against server time, not against a client-supplied timestamp.
- Session reading occurs in a single server helper reused by every protected route.
- Middleware protects `/admin` and account routes; route handlers re-verify
  permission rather than trusting middleware alone.
- Permission checks are cached per request, never across requests.
- Failed authentication attempts are rate-limited; see Block 27 for thresholds.

## Data Requirements

- Role assignment rows record the assigning actor and timestamp.
- Every authentication and authorization event writes an append-only audit row.
- Profile deletion requests are recorded rather than executed destructively without
  an audited administrative action.

## Security Requirements

- No role or permission is ever read from a cookie, header, or client payload as an
  authorization input.
- Privileged operations use the privileged client only inside server-only modules,
  and only after an explicit permission check.
- Password reset and email change flows invalidate existing sessions.
- Enumerate the denial expectation for every role and record it for Block 07.
- Self-elevation of roles is structurally impossible, not merely unimplemented.

## Accessibility Requirements

Authentication forms must have programmatic labels, visible focus, inline error
messaging associated with its field, and must not rely on colour alone to signal
error state. Errors must be announced to assistive technology.

## Testing Requirements

- Allowed and denied tests for every role against every permission-bearing surface.
- A test proving a user cannot assign themselves a role.
- Tests for each separation-of-duties constraint, asserting the database rejects the
  violating operation.
- A test proving unverified accounts cannot reach privileged capabilities.
- A test proving sessions are invalidated after password change.

## Documentation Requirements

- `docs/permissions.md` contains the complete role-by-permission matrix.
- Document the separation-of-duties rules and their enforcement point.
- Document the session lifecycle and revocation procedure.

## Acceptance Criteria

- [ ] All fourteen roles exist with the exact specified names.
- [ ] Permissions are granular and mapped to roles, covering all four §45.2.3 action
      families.
- [ ] JWT expiration is explicitly configured and secure session cookie attributes are
      enforced (§45.2.1).
- [ ] JWT is validated server-side on every server action; expired tokens are rejected.
- [ ] The MFA extension point exists; if MFA itself is deferred, the deferral is
      recorded as a Deferred row in `docs/requirements-traceability.md` (§45.2.1).
- [ ] The permission function is database-backed and usable in RLS.
- [ ] Email verification gates privileged capability.
- [ ] Password recovery is single-use, time-limited, and session-invalidating.
- [ ] All four separation-of-duties rules are database-enforced and tested.
- [ ] Self-elevation is impossible, proven by test.
- [ ] The external identity table exists with its uniqueness constraint.
- [ ] Authentication and authorization events are audited.
- [ ] Denied tests exist and pass for every role.

## Completion Report

Report: tables created, roles and permissions seeded, permission function signature,
separation-of-duties rules enforced and where, session handling implementation,
external identity structure, audit events emitted, allowed and denied tests with
results, and the review sign-off from `database-security-reviewer`.
