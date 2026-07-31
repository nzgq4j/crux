# Block 14 — Newsletter Subscriptions

## Objective

Implement newsletter subscription and preference management with double opt-in,
durable consent records, provider abstraction, and reliable failure handling —
independent of platform account state.

## Scope

### In scope

- The `subscriptions` schema, newsletter types, consent, preferences, unsubscribe,
  and suppression.
- The provider abstraction and its failure queue and retry behaviour.

### Out of scope

- Campaign authoring and sending schedules, which are provider responsibilities;
  this block owns the subscription record and the integration contract.

## Dependencies

Blocks 04, 06.

## Required Inputs

- `.claude/prompts/04-supabase-foundation.md`, `.claude/prompts/06-authentication-authorization.md`.
- `.claude/rules/backend.md`, `.claude/rules/security.md`.

## Required Outputs

- Migrations creating the `subscriptions` schema.
- The provider interface and one concrete adapter.
- Subscription, confirmation, preference, and unsubscribe routes.
- `docs/newsletter.md`.

## Functional Requirements

1. **Newsletter types.** A registry of newsletters, each with a name, description,
   cadence, and whether it requires a subscription tier. Newsletters are data, not
   hard-coded identifiers.
2. **Provider abstraction.** A typed interface covering subscribe, confirm, update
   preferences, unsubscribe, and suppression synchronisation. Feature code calls the
   interface only. Swapping providers must not require changes outside the adapter.
3. **Double opt-in.** Subscription creates a pending record and sends a confirmation
   containing a single-use, time-limited token. The subscription becomes active only
   on confirmation. Unconfirmed records expire after a defined period.
4. **Consent records.** Each consent event records the newsletter, the consent
   action, the timestamp, the source surface, the IP address where lawful to retain,
   and the user agent. Consent history is append-only and retained for the period
   required by the platform's privacy policy.
5. **Preferences.** Subscribers manage which newsletters they receive without
   requiring a platform account.
6. **Topic selections.** Subscribers select topics from the controlled taxonomy to
   scope their newsletters. Free-text topics are not permitted.
7. **Frequency.** Subscribers select a permitted frequency per newsletter where the
   newsletter supports more than one.
8. **Unsubscribe.** One-click unsubscribe from any message, honoured immediately,
   requiring no authentication, and using an unguessable token. A global unsubscribe
   applies to all newsletters.
9. **Suppression handling.** Ingest provider suppression signals — hard bounce, spam
   complaint, and manual suppression — and mark the address suppressed. A suppressed
   address is never re-subscribed without a fresh double opt-in.
10. **Account independence.** A subscription may exist without a platform account,
    and deleting a platform account does not silently delete the subscription record
    or its consent history. Where a user holds both, linking is explicit and
    recorded.
11. **Failure queues.** Provider calls that fail are enqueued with the payload, the
    attempt count, the last error, and the next attempt time. The user-facing outcome
    is never a silent failure.
12. **Retry behaviour.** Retries use bounded exponential backoff with a maximum
    attempt count. Exhausted items move to a dead-letter state visible in the Block 09
    newsletter manager. Retries are idempotent.

## Technical Requirements

- Confirmation and unsubscribe tokens are cryptographically random, single-use,
  time-limited, and stored hashed.
- Provider webhooks verify their signature before processing.
- All provider calls carry a request identifier for correlation.
- Subscription writes are idempotent on email plus newsletter.

## Data Requirements

- Email addresses are normalised before comparison and storage.
- Consent and suppression tables are append-only.
- Retention periods for pending, unsubscribed, and suppressed records are defined
  and enforced by a scheduled job.

## Security Requirements

- No enumeration: subscribing an already-subscribed address returns the same response
  as a new subscription.
- Subscription and confirmation endpoints are rate-limited per IP and per address.
- Provider API keys exist only server-side.
- Unsubscribe tokens grant only unsubscribe capability and expose no account data.
- Personal data in logs is redacted per Block 19.

## Accessibility Requirements

- Subscription forms have programmatic labels, inline associated error messaging,
  and announced success and failure states.
- Preference controls are keyboard-operable with grouped, labelled fieldsets.
- Confirmation and unsubscribe outcome pages state the result in text.
- No step depends on colour alone or on receiving an email to understand the current
  state.

## Testing Requirements

- A test proving an unconfirmed subscription never becomes active.
- A test proving a confirmation token is single-use and expires.
- A test proving unsubscribe requires no authentication and is immediate.
- A test proving a suppressed address cannot be re-subscribed without opt-in.
- A test proving no enumeration difference between new and existing addresses.
- A test proving provider failures enqueue and retry with backoff, and that
  exhausted items reach dead-letter state.
- A test proving webhook signature verification rejects an unsigned payload.
- A test proving account deletion does not destroy consent history.

## Documentation Requirements

- `docs/newsletter.md`: newsletter registry, the double opt-in flow, consent record
  contents, retention periods, suppression handling, the provider interface, and the
  retry and dead-letter policy.
- Document the operational procedure for draining the failure queue.

## Acceptance Criteria

- [ ] Newsletters are registry-driven, not hard-coded.
- [ ] The provider abstraction is the only integration point in feature code.
- [ ] Double opt-in is enforced; unconfirmed records never receive mail.
- [ ] Consent records are complete and append-only.
- [ ] Preferences, topics from the controlled taxonomy, and frequency all work.
- [ ] Unsubscribe is one-click, unauthenticated, tokenised, and immediate.
- [ ] Suppression is honoured and blocks silent re-subscription.
- [ ] Subscriptions function without a platform account.
- [ ] Failures enqueue, retry with backoff, and surface in dead-letter state.
- [ ] No address enumeration is possible.
- [ ] Webhook signatures are verified.

## Completion Report

Report: newsletter registry, provider interface and adapter, opt-in flow, consent
schema, preference and topic model, unsubscribe mechanism, suppression ingestion,
failure queue and retry policy, rate limits applied, tests added with results, and
documentation written.
