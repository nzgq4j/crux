# Block 19 — Analytics and Observability

## Objective

Instrument the platform with privacy-safe event analytics and operational
observability, so that both editorial performance and system health are measurable
without retaining unnecessary personal data.

## Scope

### In scope

- The `analytics` schema and the six event families.
- Structured logging, request identifiers, error monitoring, job and queue
  monitoring, health and readiness endpoints.
- Privacy-safe redaction.

### Out of scope

- Administrative presentation of metrics (Block 09) and alerting policy (Block 23).

## Dependencies

Blocks 03, 04.

## Required Inputs

- `docs/architecture.md`, `.claude/prompts/04-supabase-foundation.md`.
- `.claude/rules/backend.md`, `.claude/rules/security.md`.

## Required Outputs

- Migrations creating the `analytics` event tables.
- The logging, request-identifier, and error-reporting modules.
- Health and readiness endpoints.
- `docs/observability.md`.

## Functional Requirements

### Event families

Record, with a consistent envelope of event type, timestamp, request identifier,
session reference, and payload:

1. **Content events** — view, section reach, scroll depth thresholds, outbound
   reference click, and citation copy.
2. **Search events** — query issued, normalised query, result count, result clicked
   with its position, facet applied, and zero-result occurrence.
3. **Download events** — download requested, entitlement outcome, signed URL issued,
   and download completed where observable.
4. **Newsletter events** — subscribe requested, confirmation sent, confirmed,
   preferences changed, unsubscribed, and suppression received.
5. **Account events** — registration, verification, sign-in, sign-in failure,
   password reset requested, password changed, role assigned, and account deletion
   requested.
6. **OAuth events** — provider authorisation started, callback succeeded, callback
   failed with a reason code, identity linked, identity link refused because it
   belongs to another account, and identity unlinked.

### Operational observability

7. **Structured logging.** JSON logs with a fixed field set: timestamp, level,
   message, request identifier, route, actor identifier where present, duration, and
   outcome. No free-text-only logging in server code.
8. **Request identifiers.** Generated at the edge of every request, propagated
   through server actions, database calls where supported, and Edge Functions, and
   returned to the client in a response header for support correlation.
9. **Error monitoring.** Unhandled and handled-but-reportable errors are sent to the
   error monitor with the request identifier, release version, and redacted context.
10. **Job monitoring.** Every scheduled job records start, end, duration, outcome,
    and items processed. A job that has not run within its expected window is
    detectable.
11. **Queue monitoring.** Depth, oldest item age, retry counts, and dead-letter
    counts for the indexing, embedding, and newsletter queues.
12. **Health endpoints.** A liveness endpoint reporting that the process is running,
    with no dependency checks.
13. **Readiness endpoints.** A readiness endpoint checking database connectivity,
    storage reachability, and required configuration, returning a per-dependency
    status. Readiness must not expose internal hostnames, versions, or credentials.
14. **Privacy-safe redaction.** A single redaction utility applied to all logs,
    error reports, and retained analytics. It removes or hashes email addresses,
    tokens, authorization headers, cookies, signed URLs, and any field marked
    sensitive. Full IP addresses are truncated or hashed before retention.

## Technical Requirements

- Analytics writes are asynchronous and must never block or fail a user request.
- Event ingestion is batched and rate-limited; a burst cannot exhaust the database.
- Analytics providers sit behind the Block 03 abstraction.
- Sampling, where applied, is recorded so that metrics are interpretable.

## Data Requirements

- Analytics tables are append-only with defined retention periods and a scheduled
  purge job.
- Events store references, not copies, of content and account records.
- Aggregations used by the Block 09 dashboard are defined once and documented.

## Security Requirements

- No secret, token, signed URL, session identifier, or full authorization header is
  ever logged or retained.
- Personal data in analytics is minimised: store what a stated purpose requires and
  nothing more, and document the purpose per field.
- Health and readiness endpoints disclose no internal topology and are rate-limited.
- Audit logging in the `audit` schema is distinct from analytics and remains
  append-only and administratively restricted; analytics is never a substitute for it.
- Access to raw analytics is limited to `analytics_viewer` and administrative roles.

## Accessibility Requirements

Analytics instrumentation must not degrade accessibility: no tracking script may
block rendering, steal focus, or introduce unannounced DOM changes. Any consent
interface is keyboard-operable, focus-managed, and dismissible.

## Testing Requirements

- A test per event family asserting the event is emitted with its full envelope.
- A test proving the request identifier propagates end to end and is returned.
- A test proving the redaction utility removes every sensitive field class, including
  a case with a signed URL and a case with an authorization header.
- A test proving analytics failure does not fail the user request.
- A test proving readiness reports per-dependency status and fails when a dependency
  is unavailable.
- A test proving retention purge removes records past their period.

## Documentation Requirements

- `docs/observability.md`: event catalogue with field definitions and purposes, log
  field reference, request identifier propagation, health and readiness contracts,
  queue and job monitoring, retention periods, and the redaction policy.
- Document the metric definitions consumed by Block 09.

## Acceptance Criteria

- [ ] All six event families are instrumented with a consistent envelope.
- [ ] Structured logging is used throughout server code.
- [ ] Request identifiers are generated, propagated, and returned.
- [ ] Errors reach the monitor with redacted context and a request identifier.
- [ ] Jobs and queues are monitored, including dead-letter counts.
- [ ] Liveness and readiness endpoints behave correctly and leak no internals.
- [ ] Redaction is centralised and proven by test across all sensitive field classes.
- [ ] Analytics failures cannot fail a user request.
- [ ] Retention periods are defined and enforced by a purge job.
- [ ] Raw analytics access is role-restricted.

## Completion Report

Report: event families instrumented, event schema, logging implementation, request
identifier propagation path, error monitoring integration, job and queue monitoring,
health and readiness contracts, redaction rules, retention periods, tests added with
results, and documentation written.
