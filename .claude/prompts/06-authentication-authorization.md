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
   safely, revocable, and cleared on sign-out across all surfaces.
6. **Profiles.** A profile row created for every auth user through a trigger, with
   display name, contact preferences, and a link to an identity record where the
   user is a contributor.
7. **Roles.** A role table seeded with exactly:

   `registered_user`, `subscriber`, `research_member`, `contributor`, `author`,
   `reviewer`, `editor`, `managing_editor`, `publisher`, `taxonomy_manager`,
   `asset_manager`, `analytics_viewer`, `user_administrator`,
   `platform_administrator`

8. **Permissions.** A permission table and a role-permission mapping. Permissions
   are granular verbs over resources, not role names re-used as permissions.
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
11. **External identity support.** A table recording provider, provider subject
    identifier, linked user, verified email, first-linked timestamp, and last-used
    timestamp, unique on provider plus subject. Block 28 populates it.
12. **Google OAuth integration reference.** This block provides the storage and role
    resolution that Block 28 depends on. See `.claude/prompts/28-google-oauth-authentication.md`
    for the flow itself; do not implement the OAuth flow here.

## Technical Requirements

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
- [ ] Permissions are granular and mapped to roles.
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
