# Backend Rules

## Input validation

1. Validate every input at the trust boundary with a schema, before use. **Zod** is
   the named validation library (§45.3.1); do not introduce a second one.
2. Validate type, range, length, format, and permitted values. Reject rather than
   coerce ambiguous input.
3. Validate on the server always. Client validation is a convenience, never the
   authority.
4. Bound every collection parameter: page size, batch size, and upload size have
   maximums.

## Authorization

5. Every mutation re-verifies permission server-side, regardless of what middleware
   or the UI already checked.
6. Authorization decisions come from the database-backed permission functions, not
   from a value supplied by the caller.
7. Use the privileged client only in server-only modules, only where RLS cannot
   express the operation, only after an explicit permission check, and always with an
   audit write.
8. Never trust browser-supplied role, entitlement, or ownership state.

## Observability

9. Generate a request identifier at the edge of every request, propagate it through
   server actions, database calls, and Edge Functions, and return it in a response
   header.
10. Use structured logging with the fixed field set. No free-text-only logging in
    server code.
11. Never log a secret, token, signed URL, session identifier, cookie, or
    authorization header. Route everything through the central redaction utility.

## Idempotency and transactions

12. Operations that a client may retry — publication, subscription, download
    issuance, queue processing, webhook handling — are idempotent.
13. Multi-step operations that must not partially apply run in a single transaction.
    Publication is the canonical example: all steps succeed or none do.
14. Do not perform a third-party call inside a transaction that must not fail.
    Enqueue instead.
15. Queue consumers retry with bounded exponential backoff and dead-letter on
    exhaustion. A silent drop is a defect.

## Errors

16. Errors returned to a client are sanitised: a machine-readable code, a
    human-readable message, and the request identifier. Never a stack trace, a SQL
    fragment, an internal path, or a provider's raw payload.
17. Distinguish 400, 401, 403, 404, 409, 422, and 429 correctly.
18. A restricted resource and a non-existent resource must be indistinguishable to an
    unauthorised caller.

## External services

19. Every external provider sits behind an interface defined in Block 03. Feature
    code never imports a provider SDK directly.
20. Every external call has a timeout, a retry policy, and a defined failure
    behaviour. A provider outage must degrade a feature, not fail the platform.
