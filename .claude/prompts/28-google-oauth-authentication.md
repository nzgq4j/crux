# Block 28 — Google OAuth Authentication

## Objective

Add Google sign-in through Supabase Auth as an additive authentication path, with
deterministic account linking, duplicate-account prevention, and complete auditing.

This block is additive. It does not replace email and password authentication, and it
does not alter the role model established in Block 06.

## Scope

### In scope

- The Google OAuth flow through Supabase Auth, new-user creation, existing-user
  login, deterministic linking, external identity storage, role resolution, audit
  events, callback failure handling, rate limiting, accessibility, testing, and
  deployment variables.

### Out of scope

- Additional identity providers. The structure must generalise, but only Google is
  implemented here.

## Dependencies

Blocks 04, 06, 07.

## Required Inputs

- `.claude/prompts/06-authentication-authorization.md` — the external identity table
  and the role model.
- `.claude/prompts/07-rls-security.md` — the external-identifier protections.
- `.claude/rules/security.md`, `.claude/rules/accessibility.md`.

## Required Outputs

- The OAuth initiation route, callback handler, and linking service.
- Supabase Auth provider configuration for each environment.
- `docs/oauth.md`.

## Cross-Block Patches

This block amends the following without redefining them:

- **Block 06** — adds Google as an authentication path; the external identity table
  defined there is populated here.
- **Block 07** — the external-identifier policies defined there govern this block's
  writes; no policy is relaxed to accommodate OAuth.
- **Block 09** — the OAuth-account visibility surface displays what this block records.
- **Block 19** — the OAuth event family is emitted by this block's flow.
- **Block 23** — the four environment variables below are validated at deployment.
- **Block 27** — the OAuth callback is a rate-limited endpoint and identity collision
  is a security test case.

## Functional Requirements

1. **Google OAuth through Supabase Auth.** Use Supabase Auth's Google provider. Do
   not implement a bespoke OAuth client, and do not introduce a second session
   mechanism. The resulting session is the same Supabase session used everywhere.
2. **New-user creation.** When the verified Google email matches no existing account,
   create the auth user, the profile, and the external identity row in one atomic
   operation, then assign the default role. A partial creation is not acceptable.
3. **Existing-user login.** When the Google subject identifier already matches an
   external identity row, sign that user in. Match on the provider subject
   identifier, never on the email address alone, because an email address can change
   ownership.
4. **Deterministic account linking.** Linking follows a fixed, documented decision
   procedure with no ambiguous branch:
   - Subject identifier matches an existing identity row → sign in that user.
   - No subject match, and the Google email is verified and matches exactly one
     existing account's verified email → link, provided the platform's linking policy
     permits automatic linking; otherwise require the user to authenticate with their
     existing method first and link explicitly.
   - No subject match, and the Google email is unverified → refuse to link and do not
     create an account on that basis.
   - No subject match and no email match → create a new account.
   - Subject identifier is already linked to a different account → refuse, record the
     attempt, and present a clear resolution path.

   The chosen automatic-linking policy is recorded in an ADR with its rationale,
   because it is a security trade-off, not a preference.
5. **External identity storage.** Store provider, subject identifier, the verified
   email at link time, the link timestamp, and the last-used timestamp. Unique on
   provider plus subject identifier. Written only by the trusted server layer.
6. **Duplicate-account prevention.** One provider subject identifier maps to at most
   one platform account, enforced by a database unique constraint rather than by
   application logic alone. A verified email is never associated with two accounts
   through this path.
7. **Role resolution.** A user arriving through Google receives exactly the same
   default role as an equivalent email-and-password registration. An existing user's
   roles are unchanged by linking. OAuth never grants elevated privilege, and provider
   claims are never mapped to platform roles.
8. **Audit events.** Record: authorisation started, callback succeeded, callback
   failed with a reason code, account created, identity linked, link refused because
   the identity belongs to another account, link refused because the email was
   unverified, and identity unlinked. Every event records actor where known, IP, and
   request identifier.
9. **Callback failure handling.** Handle explicitly: user denied consent, state
   parameter mismatch, expired or replayed authorisation code, provider error,
   unverified email, identity already linked elsewhere, and provider timeout. Each
   returns a specific, non-technical user-facing message and a distinct internal
   reason code. No failure exposes a stack trace, a token, or the provider's raw
   error payload.
10. **Rate limiting.** The initiation and callback endpoints are rate-limited per IP
    and, where known, per account, under the Block 27 controls.
11. **Accessibility.** The Google sign-in control is a real button with an accessible
    name stating the action, is keyboard-reachable with visible focus, and is not
    conveyed by a logo alone. Redirect and loading states are announced. Failure
    messages are announced, associated with the sign-in region, and state the recovery
    path. The provider choice does not become the only way to authenticate.
12. **Testing.** As specified below.
13. **Deployment variables.** As specified below.

## Technical Requirements

- The state parameter and PKCE handling are managed by Supabase Auth; do not
  reimplement them, and do not weaken them.
- The callback handler runs server-side and never exposes tokens to client code.
- Account creation and identity linking occur in a single database transaction.
- The redirect URL is exact-matched and environment-specific.

## Data Requirements

- The external identity table is append-oriented: linking creates a row, unlinking is
  an audited administrative operation that records rather than silently deletes
  history.
- The verified email recorded at link time is retained even if the provider's email
  later changes, so the linking decision remains auditable.

## Security Requirements

- **The client secret must remain server-side.** `GOOGLE_OAUTH_CLIENT_SECRET` is
  never exposed to the browser, never placed in a `NEXT_PUBLIC_` variable, never
  committed, and never logged.
- Never trust an unverified provider email for linking or account creation.
- Never match accounts on email alone when a subject identifier is available.
- The callback must reject a replayed authorisation code.
- Provider claims are never an authorization input; roles come from the platform.
- Unlinking must not leave a user unable to authenticate; require an alternative
  method to exist first.
- This block requires independent review by `database-security-reviewer`.

## Accessibility Requirements

Stated in functional requirement 11 above. In addition, the sign-in surface must
present provider and email authentication as equal choices, both keyboard-reachable
in a logical order, with no reliance on colour or logo alone to distinguish them.

## Testing Requirements

- A test for each branch of the linking decision procedure, including the two refusal
  branches.
- A test proving a subject identifier cannot be linked to two accounts.
- A test proving an unverified provider email neither links nor creates an account.
- A test proving a Google-created account receives the default role only.
- A test proving linking does not alter an existing user's roles.
- A test proving a replayed authorisation code is rejected.
- A test per callback failure mode asserting the correct user message and reason code,
  and asserting no token or raw provider error is exposed.
- A test proving the client secret is absent from the client bundle.
- A test proving the callback is rate-limited.
- A test proving account creation and identity linking are atomic under an injected
  failure.
- Accessibility tests for the sign-in control and its failure states.

## Documentation Requirements

- `docs/oauth.md`: the provider configuration per environment, the linking decision
  procedure as a decision table, every failure mode with its user message and reason
  code, the audit events emitted, the unlink procedure, and the rate limits.
- An ADR recording the automatic-linking policy decision and its security rationale.

### Deployment variables

Required, and validated at startup and at deployment by Block 23:

```
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URL
SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED
```

`GOOGLE_OAUTH_CLIENT_SECRET` is server-side only. `GOOGLE_OAUTH_REDIRECT_URL` must
match the environment's public origin exactly and must be registered with the
provider. When `SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED` is false, the sign-in control
is absent rather than present-and-failing.

## Acceptance Criteria

- [ ] Google sign-in works through Supabase Auth with no bespoke OAuth client.
- [ ] New-user creation is atomic across auth user, profile, and identity row.
- [ ] Existing-user login matches on subject identifier, not email alone.
- [ ] Every branch of the linking decision procedure is implemented and tested.
- [ ] A subject identifier maps to at most one account, enforced by constraint.
- [ ] An unverified provider email neither links nor creates an account.
- [ ] Role resolution grants only the default role; linking never changes roles.
- [ ] All nine audit events are emitted with actor, IP, and request identifier.
- [ ] Every callback failure mode returns a specific message and reason code with no
      technical disclosure.
- [ ] Initiation and callback endpoints are rate-limited.
- [ ] The client secret is absent from all client output, proven by test.
- [ ] The sign-in control is accessible and email authentication remains available.
- [ ] All four environment variables are validated at startup and deployment.
- [ ] The automatic-linking policy ADR exists.
- [ ] `database-security-reviewer` has signed off.

## Completion Report

Report: the flow implemented, the linking decision procedure as built with its ADR
reference, the duplicate-prevention constraint, role resolution behaviour, audit
events emitted, failure modes handled with their reason codes, rate limits applied,
secret handling verification, environment variables and their validation,
accessibility results, tests added with results, and the independent reviewer
sign-off.
