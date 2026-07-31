# Block 27 — Security Hardening

## Objective

Apply the application-layer and operational security controls that sit above the
database policy layer, and verify them by testing rather than by configuration review
alone.

## Scope

### In scope

- Headers, CSP, rate limiting, abuse controls, upload controls, secret handling,
  dependency security, session controls, lockout, audit monitoring, privileged
  operation protection, escalation, security testing, and the production hardening
  checklist.

### Out of scope

- RLS policy authoring, which is owned by Block 07. This block assumes it and
  strengthens the layers around it.

## Dependencies

Blocks 04, 06, 07, 13, 19.

## Required Inputs

- `.claude/prompts/07-rls-security.md`, `docs/threat-model.md`.
- `.claude/prompts/13-assets-downloads.md`, `.claude/prompts/19-analytics-observability.md`.
- `.claude/rules/security.md`.

## Required Outputs

- Header and CSP configuration, rate limiting middleware, and abuse controls.
- `docs/security-hardening.md` including the production hardening checklist.
- A security test suite extension.

## Functional Requirements

1. **Secure headers.** Set on every response: `Strict-Transport-Security` with a long
   max-age and preload consideration, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy`, `X-Frame-Options` or a frame-ancestors directive,
   `Permissions-Policy` disabling unused features, and `Cross-Origin-Opener-Policy`.
   Server and framework version headers are removed.
2. **CSP.** A Content Security Policy without `unsafe-inline` and without
   `unsafe-eval` for scripts, using nonces or hashes. Start in report-only, collect
   violations, then enforce. Document every source allowed and why. A CSP that
   permits arbitrary script sources is not acceptable.
3. **Rate limiting.** Per-endpoint limits keyed by user and by IP for: sign-in,
   registration, password reset, email verification resend, OAuth callback,
   subscription and confirmation, search, citation export, download issuance, and all
   public API endpoints. Limits return `429` with `Retry-After`. Limits are applied
   before expensive work.
4. **Abuse controls.** Detection and response for credential stuffing, scraping,
   enumeration attempts, and automated subscription abuse. Responses may include
   progressive delay, challenge, or block, each recorded.
5. **File-upload controls.** Reinforce Block 13: signature-based type detection, size
   caps, image dimension caps, filename normalisation, quarantine before promotion,
   and rejection or sanitisation of active-content formats. Uploads are never served
   from the application origin in a way that allows script execution.
6. **Secret handling.** All secrets come from the platform secret store. No secret in
   the repository, in build output, in client bundles, in logs, or in error reports.
   A documented rotation procedure exists for every secret, with rotation tested for
   the cron secret and the webhook signing secret.
7. **Dependency security.** Automated vulnerability scanning with a severity
   threshold that fails the build, lockfile integrity enforcement, and a documented
   exception process requiring justification and an expiry date.
8. **Session controls.** Absolute and idle session lifetimes, secure cookie
   attributes — `HttpOnly`, `Secure`, and an appropriate `SameSite` — session
   invalidation on password change, email change, and role change, session revocation
   by an administrator, and a session list visible to the user.
9. **Account lockout strategy.** Progressive delay followed by temporary lockout after
   a threshold of failed attempts, keyed to resist both single-account brute force and
   distributed credential stuffing. Lockout must not become a denial-of-service
   vector against a legitimate user; document the chosen trade-off and the recovery
   path.
10. **Audit monitoring.** Alerting on: role assignment, privileged client usage,
    publication and withdrawal, bulk download, audit read by an unexpected actor, and
    repeated authorization failures by one actor.
11. **Privileged-operation protection.** Every use of the privileged client is behind
    an explicit permission check, is audited, and is enumerable by a static check so
    that a new unguarded use is detected in review.
12. **Incident escalation.** Severity criteria, the escalation path, containment
    actions per incident class, and the communication procedure. Aligned with
    `docs/incident-response.md` from Block 23.
13. **Security testing.** Authorization bypass, privilege escalation, insecure direct
    object reference, injection against search and API parameters, CSRF analysis of
    every state-changing route with the chosen mitigation verified, header and CSP
    verification, rate-limit verification, and OAuth identity collision attempts.
14. **Production hardening checklist.** A checklist executed before production
    release covering every control in this block, with evidence per item.

## Technical Requirements

- Headers and CSP are applied centrally, not per route, so a new route inherits them.
- Rate limiting state is shared across instances; per-instance counters are not
  acceptable in a multi-instance deployment.
- CSRF mitigation is verified for every state-changing route, whether by same-site
  cookies, origin checking, or tokens; the mechanism is documented.

## Data Requirements

- Abuse and lockout state is stored with a defined retention period.
- Security events feed the `audit` schema, not only the analytics tables.

## Security Requirements

This block is the security requirement. Additionally:

- No control introduced here may be disabled in any environment reachable by the
  public.
- Where staging relaxes a control for testing, the relaxation is explicit,
  documented, and impossible in production configuration.
- This block requires independent review by `database-security-reviewer`; the
  implementing agent may not approve it.

## Accessibility Requirements

- Session timeout warnings are announced, allow extension, and meet the WCAG 2.2
  timing requirements.
- Lockout, rate-limit, and challenge messages are perceivable, keyboard-operable, and
  clearly worded, stating the recovery path.
- Any challenge mechanism provides an accessible alternative.

## Testing Requirements

- A test asserting every required header is present on public, administrative, and
  API responses.
- A test asserting the CSP blocks inline script and an unlisted source.
- A test per rate-limited endpoint asserting `429` with `Retry-After`.
- Tests asserting lockout engages, and that the recovery path works.
- A test asserting session invalidation on password, email, and role change.
- A test asserting cookie attributes are correct.
- A test asserting an unauthenticated or cross-origin state-changing request is
  rejected.
- A test asserting a planted secret fails the secret scan.
- A static check enumerating privileged client usage and asserting each is guarded.
- Tests for the OAuth identity collision cases defined in Block 28.

## Documentation Requirements

- `docs/security-hardening.md`: every header and its value, the CSP with each source
  justified, rate limits per endpoint, abuse controls, upload controls, the secret
  inventory by name with its rotation procedure, session policy, lockout policy,
  audit alerting rules, and the production hardening checklist.
- Document accepted residual risk explicitly.

## Acceptance Criteria

- [ ] All required headers are present on every response class, proven by test.
- [ ] CSP is enforced without `unsafe-inline` or `unsafe-eval` for scripts.
- [ ] Rate limits are applied to every listed endpoint and return correct responses.
- [ ] Abuse controls are implemented and recorded.
- [ ] Upload controls reject signature mismatches and active-content risks.
- [ ] No secret is present in repository, build output, client bundle, or logs.
- [ ] Every secret has a documented, tested rotation procedure.
- [ ] Dependency scanning fails the build above the threshold.
- [ ] Session lifetimes, cookie attributes, and invalidation rules are enforced.
- [ ] Account lockout engages with a documented, working recovery path.
- [ ] Audit alerting is configured for every listed event.
- [ ] Every privileged client usage is guarded, audited, and statically enumerable.
- [ ] CSRF mitigation is verified on every state-changing route.
- [ ] The production hardening checklist is complete with evidence.
- [ ] `database-security-reviewer` has signed off.

## Completion Report

Report: headers applied, the CSP and each justified source, rate limits per endpoint,
abuse controls implemented, upload controls, secret inventory and rotation
procedures, dependency scan configuration and current findings, session and lockout
policy, audit alerting rules, privileged usage enumeration result, CSRF verification,
security tests added with results, the production hardening checklist state, accepted
residual risk, and the independent reviewer sign-off.
