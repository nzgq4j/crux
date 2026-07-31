-- Block 19 — Analytics and observability
-- The `analytics` schema (§45.1.2): one append-only event table with a single
-- consistent envelope covering the six event families, plus the retention policy
-- registry that the scheduled purge job reads.
--
-- Analytics is NOT audit. `audit.events` (§45.1.9, §45.3.6) records privileged
-- actions with actor, action, resource and decision, is administratively
-- restricted, and is never purged by this block. `analytics.events` records
-- product telemetry, is privacy-minimised, and expires on a schedule. Neither
-- table is a substitute for the other.
--
-- Reverse procedure, in this order (destructive; never run against production):
--   DROP TABLE analytics.events;
--   DROP TABLE analytics.retention_policies;
--   DROP FUNCTION private.purge_expired_analytics(timestamptz, integer);
--   DROP FUNCTION private.reject_analytics_mutation();
-- The `analytics` schema itself is owned by the foundation migration and is not
-- dropped here.

-- ---------------------------------------------------------------------------
-- analytics.retention_policies — retention declared as data, not as code.
-- A policy matches an event when the event type equals the prefix (a whole
-- family, e.g. 'search') or begins with the prefix followed by a dot (a single
-- event, e.g. 'search.zero_result'). The longest matching prefix wins, so a
-- per-event policy overrides its family policy. Created before analytics.events
-- because the purge function reads it.
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.retention_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Either a family ('account') or a fully qualified event ('account.sign_in').
  event_type_prefix text NOT NULL UNIQUE
    CONSTRAINT retention_prefix_is_known_family CHECK (
      event_type_prefix ~ '^(content|search|download|newsletter|account|oauth)(\.[a-z][a-z0-9_]*)?$'
    ),
  retention_period  interval NOT NULL
    CONSTRAINT retention_period_positive CHECK (retention_period > interval '0'),
  -- Block 19 security requirement: the stated purpose that justifies keeping
  -- this data for this long. A policy without a purpose is not a policy.
  purpose           text NOT NULL CHECK (btrim(purpose) <> ''),
  -- An inactive policy stops matching; its events then fall through to the
  -- family policy, or are retained indefinitely if none matches.
  active            boolean NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics.retention_policies IS
  'Retention periods for analytics event families, read by private.purge_expired_analytics(). Declared as data so the period is auditable and changeable without a code deploy (Block 19 data requirement; §45.1.2 analytics schema).';
COMMENT ON COLUMN analytics.retention_policies.event_type_prefix IS
  'Family (''search'') or fully qualified event (''search.zero_result''). Longest matching prefix wins, making the purge deterministic when both are present.';
COMMENT ON COLUMN analytics.retention_policies.purpose IS
  'Why this data is retained for this period. Block 19: personal data in analytics is minimised and the purpose is documented per policy.';
COMMENT ON COLUMN analytics.retention_policies.active IS
  'False suspends the policy. Events matching no active policy are never deleted — the purge deletes only what a policy explicitly expires.';

CREATE INDEX retention_policies_active_idx ON analytics.retention_policies (event_type_prefix)
  WHERE active;

CREATE TRIGGER retention_policies_updated_at BEFORE UPDATE ON analytics.retention_policies
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE analytics.retention_policies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- analytics.events — the single event table. One envelope, six families.
--
-- A bigint identity key rather than a uuid: this is a high-volume, insert-only,
-- time-ordered log read by range scan and never referenced by another table, so
-- a narrow monotonic key keeps the indexes small. Same reasoning as
-- audit.events, which is keyed the same way.
--
-- Events store references, not copies. The payload carries content ids, version
-- ids, term slugs and asset ids — never titles, bodies, email addresses,
-- tokens, signed URLs or full IP addresses.
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Envelope ---------------------------------------------------------------
  event_type   text NOT NULL
    CONSTRAINT events_event_type_is_known CHECK (event_type IN (
      -- 1. Content
      'content.viewed',
      'content.section_reached',
      'content.reference_clicked',
      'content.citation_copied',
      -- 2. Search
      'search.submitted',
      'search.result_selected',
      'search.filter_applied',
      'search.zero_result',
      -- 3. Download
      'download.requested',
      'download.gate_displayed',
      'download.url_issued',
      'download.completed',
      'download.failed',
      -- 4. Newsletter
      'newsletter.subscribe_started',
      'newsletter.confirmation_sent',
      'newsletter.confirmed',
      'newsletter.preferences_changed',
      'newsletter.unsubscribed',
      'newsletter.suppression_received',
      -- 5. Account
      'account.registered',
      'account.verified',
      'account.signed_in',
      'account.sign_in_failed',
      'account.password_reset_requested',
      'account.password_changed',
      'account.role_assigned',
      'account.deletion_requested',
      -- 6. OAuth
      'oauth.authorization_started',
      'oauth.callback_succeeded',
      'oauth.callback_failed',
      'oauth.identity_linked',
      'oauth.link_refused_other_account',
      'oauth.identity_unlinked'
    )),

  -- Derived family, so dashboard aggregation and retention grouping never
  -- re-parse the event type in application code. Deterministic and immutable.
  event_family text GENERATED ALWAYS AS (split_part(event_type, '.', 1)) STORED,

  -- When the event happened, which is not when it was written: ingestion is
  -- asynchronous and batched, so created_at may lag occurred_at.
  occurred_at  timestamptz NOT NULL DEFAULT now(),

  -- Correlates the event with the structured log line and any error report for
  -- the same request (Block 19 requirement 8).
  request_id   text NOT NULL
    CONSTRAINT events_request_id_bounded CHECK (length(request_id) BETWEEN 1 AND 128),

  -- Pseudonymous, rotating analytics session reference. NOT the authentication
  -- session identifier and not derived from it — no session token, cookie value
  -- or full IP address is ever retained here. Non-interactive origins (provider
  -- webhooks, scheduled jobs) use a 'system:' prefixed correlation reference so
  -- the envelope is always complete.
  session_ref  text NOT NULL
    CONSTRAINT events_session_ref_bounded CHECK (length(session_ref) BETWEEN 1 AND 128),

  -- Nullable: most events are anonymous, and an account deletion de-identifies
  -- future reporting rather than rewriting history. Deliberately NOT a foreign
  -- key to auth.users, for the same reason audit.events.actor_id is not: an
  -- append-only log must survive deletion of the account it references, and a
  -- CASCADE or SET NULL action would itself be a mutation this table's
  -- append-only trigger is required to reject.
  actor_id     uuid,

  -- Sampling rate in force when the event was emitted, so a sampled metric
  -- remains interpretable (Block 19 technical requirement).
  sample_rate  numeric NOT NULL DEFAULT 1
    CONSTRAINT events_sample_rate_range CHECK (sample_rate > 0 AND sample_rate <= 1),

  payload      jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT events_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
    -- Backstop for the application redaction utility: these key names may never
    -- reach the table, so a redaction regression fails loudly instead of
    -- silently retaining personal data.
    CONSTRAINT events_payload_excludes_sensitive_keys CHECK (
      NOT (payload ?| ARRAY[
        'email', 'email_address', 'password', 'token', 'access_token',
        'refresh_token', 'authorization', 'cookie', 'signed_url', 'signature',
        'ip', 'ip_address', 'session_token'
      ])
    ),

  -- Write time. Distinct from occurred_at because ingestion is batched.
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics.events IS
  'Append-only product telemetry for the six Block 19 event families, under one envelope (§45.1.2 analytics schema). Distinct from audit.events (§45.1.9, §45.3.6), which records privileged actions and is never purged. Rows expire under analytics.retention_policies; UPDATE and DELETE are rejected by trigger except for the documented purge path.';
COMMENT ON COLUMN analytics.events.event_type IS
  'Family-qualified event name. The CHECK is the event catalogue: an unlisted event type is rejected rather than stored as free text.';
COMMENT ON COLUMN analytics.events.event_family IS
  'Generated from event_type. One of content, search, download, newsletter, account, oauth.';
COMMENT ON COLUMN analytics.events.occurred_at IS
  'Event time, supplied by the emitter. Retention is measured from this column.';
COMMENT ON COLUMN analytics.events.request_id IS
  'Request identifier generated at the edge and propagated through the request (Block 19 requirement 8). The join key between an event, its log lines and its error reports.';
COMMENT ON COLUMN analytics.events.session_ref IS
  'Pseudonymous analytics session reference. Never the authentication session identifier, a cookie value, or an IP address.';
COMMENT ON COLUMN analytics.events.actor_id IS
  'auth.users id where the actor is signed in, else NULL. Intentionally unconstrained by a foreign key so account deletion cannot mutate an append-only row.';
COMMENT ON COLUMN analytics.events.sample_rate IS
  'Fraction of eligible events that were recorded, 0 < rate <= 1. Divide counts by this to estimate population totals.';
COMMENT ON COLUMN analytics.events.payload IS
  'Family-specific fields: references only (content_item_id, version_id, term slug, asset_id, position, reason_code). Sensitive key names are rejected by CHECK.';
COMMENT ON COLUMN analytics.events.created_at IS
  'Ingestion time. Lags occurred_at because analytics writes are asynchronous and batched.';

-- Documented access paths -----------------------------------------------------
-- Dashboard aggregation and the retention purge both scan one event type over a
-- time range.
CREATE INDEX events_type_occurred_idx  ON analytics.events (event_type, occurred_at DESC);
-- Per-actor history: subject access requests and signed-in funnel analysis.
CREATE INDEX events_actor_occurred_idx ON analytics.events (actor_id, occurred_at DESC);
-- Session funnel reconstruction (search -> content -> download).
CREATE INDEX events_session_idx        ON analytics.events (session_ref, occurred_at);
-- Support correlation from a request identifier quoted by a user.
CREATE INDEX events_request_idx        ON analytics.events (request_id);
-- Family-wide reporting over a window, without re-parsing the event type.
CREATE INDEX events_family_occurred_idx ON analytics.events (event_family, occurred_at DESC);

ALTER TABLE analytics.events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Append-only enforcement, with one deliberate escape hatch.
--
-- ESCAPE HATCH — READ THIS BEFORE USING IT.
-- The table is append-only, but retention requires deletion. Rather than grant
-- a role the right to delete arbitrary rows, the trigger permits DELETE only
-- while the transaction-local GUC `crux.purge` is set to 'on'. The only
-- supported way to set it is private.purge_expired_analytics(), which sets it
-- with set_config(..., is_local => true) so it dies with the transaction and
-- clears it again before returning.
--
-- Consequences to accept knowingly:
--   * Anyone able to execute `SET LOCAL crux.purge = 'on'` in a session that can
--     also DELETE from analytics.events can bypass the append-only rule. That is
--     table owner, BYPASSRLS roles, and whatever the RLS migration grants. The
--     GUC is a guard against accident and against a stray ORM delete, not a
--     privilege boundary. The privilege boundary is RLS plus role grants.
--   * UPDATE is never permitted, under any GUC. A retained event is either
--     present exactly as written, or gone.
--   * TRUNCATE is never permitted, because it would bypass row triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.reject_analytics_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- The retention purge, and nothing else, may delete.
  IF TG_OP = 'DELETE' AND current_setting('crux.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'analytics.events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT    = 'Retention deletion runs only through private.purge_expired_analytics(), which sets crux.purge locally.';
END;
$$;

COMMENT ON FUNCTION private.reject_analytics_mutation() IS
  'Append-only guard for analytics.events. Rejects UPDATE and TRUNCATE unconditionally. Rejects DELETE unless the transaction-local GUC crux.purge = ''on'', which only private.purge_expired_analytics() sets — the documented retention escape hatch. Deterministic; no external calls (rules/database.md 19a-19c).';

DROP TRIGGER IF EXISTS events_no_update ON analytics.events;
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON analytics.events
  FOR EACH ROW EXECUTE FUNCTION private.reject_analytics_mutation();

DROP TRIGGER IF EXISTS events_no_delete ON analytics.events;
CREATE TRIGGER events_no_delete
  BEFORE DELETE ON analytics.events
  FOR EACH ROW EXECUTE FUNCTION private.reject_analytics_mutation();

DROP TRIGGER IF EXISTS events_no_truncate ON analytics.events;
CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON analytics.events
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_analytics_mutation();

COMMENT ON TRIGGER events_no_delete ON analytics.events IS
  'Blocks DELETE unless crux.purge = ''on'' for the current transaction. See private.reject_analytics_mutation() for the full escape-hatch rationale and its limits.';

-- ---------------------------------------------------------------------------
-- private.purge_expired_analytics() — the scheduled retention job.
--
-- Deterministic: for a given p_now, the same database state always selects the
-- same rows. Policy selection is longest-prefix-wins with a text tie-break;
-- deletion order is (occurred_at, id), so a bounded run always removes the
-- oldest expired rows first and repeated runs converge.
--
-- SECURITY DEFINER because the scheduler's role must be able to run the purge
-- without holding a standing DELETE grant on analytics.events, and because RLS
-- policies (added by the RLS migration) must not make retention partial.
-- search_path is pinned per rules/database.md 9.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.purge_expired_analytics(
  p_now      timestamptz DEFAULT now(),
  p_max_rows integer     DEFAULT NULL
)
RETURNS TABLE (event_type text, deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_max_rows IS NOT NULL AND p_max_rows <= 0 THEN
    RAISE EXCEPTION 'p_max_rows must be positive when supplied, got %', p_max_rows
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Open the append-only escape hatch for this transaction only.
  PERFORM set_config('crux.purge', 'on', true);

  RETURN QUERY
  WITH expired AS (
    SELECT e.id, e.event_type
      FROM analytics.events e
      JOIN LATERAL (
        SELECT p.retention_period
          FROM analytics.retention_policies p
         WHERE p.active
           AND (e.event_type = p.event_type_prefix
                OR starts_with(e.event_type, p.event_type_prefix || '.'))
         -- Longest prefix wins; the text tie-break keeps the choice stable.
         ORDER BY length(p.event_type_prefix) DESC, p.event_type_prefix
         LIMIT 1
      ) pol ON true
     WHERE e.occurred_at < p_now - pol.retention_period
     ORDER BY e.occurred_at, e.id
     LIMIT p_max_rows
  ),
  removed AS (
    DELETE FROM analytics.events e
     USING expired x
     WHERE e.id = x.id
    RETURNING e.event_type
  )
  SELECT r.event_type, count(*)::bigint
    FROM removed r
   GROUP BY r.event_type
   ORDER BY r.event_type;

  -- Close it again, so nothing later in the same transaction inherits it.
  PERFORM set_config('crux.purge', 'off', true);
END;
$$;

COMMENT ON FUNCTION private.purge_expired_analytics(timestamptz, integer) IS
  'Scheduled retention purge for analytics.events (Block 19 data requirement). Deletes rows older than the longest-matching active analytics.retention_policies period; events matching no active policy are never deleted. Returns rows deleted per event type for the job log. ESCAPE HATCH: sets the transaction-local GUC crux.purge = ''on'' so private.reject_analytics_mutation() permits the DELETE, and resets it before returning; set_config is local, so an aborted transaction cannot leave the hatch open. Pass p_now to make a test reproducible and p_max_rows to bound a single run (oldest first). SECURITY DEFINER with a pinned search_path; deterministic and free of external calls.';

REVOKE ALL ON FUNCTION private.purge_expired_analytics(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.purge_expired_analytics(timestamptz, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Seed retention periods. One policy per family so nothing is retained
-- indefinitely by omission, plus three per-event overrides where the purpose
-- justifies a different period. Idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO analytics.retention_policies (event_type_prefix, retention_period, purpose, notes) VALUES
  ('content', interval '24 months',
   'Editorial performance reporting: which content is read, how far, and which references are followed.',
   'Two years supports year-on-year comparison. Carries content references only, no personal data.'),

  ('search', interval '24 months',
   'Search quality measurement: result selection position, facet use and query volume.',
   'Normalised queries only; raw query strings are redacted before ingestion.'),

  ('search.zero_result', interval '36 months',
   'Content-gap analysis: what readers looked for and the platform did not have.',
   'Longer than the search family because gap analysis is a multi-year editorial input and the event carries no personal data.'),

  ('download', interval '36 months',
   'Asset demand reporting and licence-term review across a full publication cycle.',
   'Entitlement decisions themselves are evidenced in audit.events, not here.'),

  ('newsletter', interval '24 months',
   'Subscription funnel measurement: start, confirmation, preference change and churn rates.',
   'Consent evidence lives in subscriptions.consent_events and is governed separately; this is funnel telemetry only.'),

  ('account', interval '12 months',
   'Registration and sign-in funnel health.',
   'Shortest family period: account events reference an identified user, so minimisation applies.'),

  ('account.sign_in_failed', interval '90 days',
   'Security triage of credential-stuffing and lockout patterns.',
   'Ninety days is the incident investigation window; keeping failure telemetry longer serves no stated purpose.'),

  ('oauth', interval '12 months',
   'Provider sign-in reliability and link/unlink funnel health.',
   'Matches the account family: OAuth events reference an identified user.'),

  ('oauth.callback_failed', interval '180 days',
   'Diagnosing provider callback failures by reason code across a release cycle.',
   'Longer than the oauth family for trend analysis of reason codes, shorter than a year because it is operational data.')
ON CONFLICT (event_type_prefix) DO UPDATE
  SET retention_period = EXCLUDED.retention_period,
      purpose          = EXCLUDED.purpose,
      notes            = EXCLUDED.notes;
