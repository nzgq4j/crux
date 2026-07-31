# Security Rules

## Least privilege

1. Grant the minimum privilege that works. Widen only with a recorded reason.
2. The privileged Supabase client is used only in server-only modules, only where RLS
   cannot express the operation, only after an explicit permission check, and always
   with an audit write.
3. Provider claims — including OAuth claims — are never an authorization input.
   Roles come from the platform's own role model.
4. No user may elevate their own roles. This is structural, not procedural.

## Secret isolation

5. Secrets come from the platform secret store. Never from the repository.
6. No secret in a `NEXT_PUBLIC_` variable, a client bundle, a log line, an error
   report, a test fixture, a seed, or a document.
7. `.env.example` contains variable names only, never values.
8. Every secret has a documented rotation procedure.

## Sessions

9. Cookies are `HttpOnly`, `Secure`, and use an appropriate `SameSite` value.
10. Enforce both absolute and idle session lifetimes.
11. Invalidate sessions on password change, email change, and role change.
12. Administrators can revoke a session; users can see their own sessions.

## Private content delivery

13. Private storage objects are never publicly readable and never served from a
    guessable path.
14. Private objects are delivered exclusively through short-lived signed URLs issued
    by the trusted server layer after a server-side entitlement check.
15. Signed URLs are issued per request, never cached, never stored, never logged.

## Uploads

16. Determine file type from the file signature, not the declared `Content-Type` or
    the extension.
17. Reject on a mismatch between declared and detected type.
18. Enforce size caps and image dimension caps.
19. Normalise filenames; never use a supplied filename directly as a storage path.
20. Quarantine before promotion; checksum on upload and verify on promotion.
21. Reject or sanitise active-content formats such as SVG. Record the choice.

## Abuse and rate limiting

22. Rate-limit sign-in, registration, password reset, verification resend, OAuth
    initiation and callback, subscription and confirmation, search, citation export,
    download issuance, and every public API endpoint.
23. Apply limits before expensive work. Return `429` with `Retry-After`.
24. Rate-limit state is shared across instances.
25. Prevent enumeration: an existing and a non-existing account, address, or resource
    must be indistinguishable in response and in timing where feasible.

## CSRF and headers

26. Analyse every state-changing route for CSRF and verify the chosen mitigation —
    same-site cookies, origin checking, or tokens. Document the mechanism.
27. Apply security headers centrally so new routes inherit them: HSTS, `nosniff`,
    `Referrer-Policy`, frame protection, `Permissions-Policy`, and COOP.
28. Enforce a CSP without `unsafe-inline` or `unsafe-eval` for scripts. Justify every
    allowed source.
29. Remove server and framework version headers.

## Testing

30. **Denied-access tests are mandatory** for every authorization boundary. A
    boundary with only a happy-path test is untested.
31. **Never bypass, weaken, or disable a control to make a test pass.** If a test
    requires disabling RLS, elevating a role, or removing a gate, the test is wrong —
    or the design is.
32. Verify that tests have teeth: inverting a control must fail its test.
33. High-risk security work is signed off by `database-security-reviewer`, not by the
    agent that implemented it.
