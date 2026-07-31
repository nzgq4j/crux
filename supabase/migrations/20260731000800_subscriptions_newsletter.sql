-- Block 14 — Newsletter subscriptions
-- The `subscriptions` schema (§45.1.2): newsletter registry, subscribers, double
-- opt-in subscriptions, append-only consent ledger, controlled-vocabulary topic
-- preferences (§45.1.4), suppression ledger, and the provider failure queue.
-- All trigger logic here is deterministic with no external calls (§45.1.12).
--
-- Reverse procedure, in this order (destructive; never run against production):
--   DROP SCHEMA subscriptions CASCADE;
--   DROP FUNCTION private.reject_consent_event_mutation();
--   DROP FUNCTION private.reject_suppression_mutation();
--   DROP FUNCTION private.reject_suppressed_activation();
--   DROP FUNCTION private.enforce_permitted_frequency();
--   DROP FUNCTION private.active_suppression_reason(text);
--   DROP FUNCTION private.delivery_backoff(integer, interval, interval);
--   DROP FUNCTION private.normalise_email(text);
-- The schema must be dropped before private.normalise_email(text) because the
-- generated normalised_email columns depend on it.

-- ---------------------------------------------------------------------------
-- Email normalisation. Deterministic and lossless: case folding and whitespace
-- trimming only. Provider-specific tricks (gmail dot stripping, plus-address
-- removal) are deliberately NOT applied — they merge addresses that the
-- subscriber considers distinct and would silently transfer consent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.normalise_email(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT lower(btrim(coalesce(input, '')));
$$;

COMMENT ON FUNCTION private.normalise_email(text) IS
  'Canonical form of an email address for comparison and storage (Block 14 data requirement). IMMUTABLE: used by generated columns.';

-- ---------------------------------------------------------------------------
-- subscriptions.newsletters — the registry. Newsletters are DATA. No feature
-- code may hard-code a newsletter identifier; it resolves one by slug.
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.newsletters (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text NOT NULL UNIQUE,
  name                   text NOT NULL,
  description            text,
  -- Editorial publication rhythm, distinct from the subscriber's chosen frequency.
  cadence                text NOT NULL
    CHECK (cadence IN ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'ad_hoc')),
  -- Who may hold an active subscription. 'subscriber_tier' is the §45.1.11
  -- entitlement gate: requirement 1's "requires a subscription tier".
  audience               text NOT NULL DEFAULT 'public'
    CHECK (audience IN ('public', 'registered', 'subscriber_tier')),
  -- Frequencies this newsletter supports. A subscriber chooses one of these
  -- (requirement 7); a single-element array means the choice is not offered.
  permitted_frequencies  text[] NOT NULL DEFAULT ARRAY['weekly']::text[],
  default_frequency      text NOT NULL DEFAULT 'weekly',
  active                 boolean NOT NULL DEFAULT true,
  -- Retention and expiry, declared as data so the scheduled job reads them
  -- rather than embedding periods in code (Block 14 data requirement).
  confirmation_ttl       interval NOT NULL DEFAULT interval '72 hours',
  pending_retention      interval NOT NULL DEFAULT interval '30 days',
  unsubscribed_retention interval NOT NULL DEFAULT interval '3 years',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletters_frequencies_known CHECK (
    permitted_frequencies <@ ARRAY['immediate', 'daily', 'weekly', 'fortnightly', 'monthly']::text[]
  ),
  CONSTRAINT newsletters_frequencies_not_empty CHECK (cardinality(permitted_frequencies) >= 1),
  CONSTRAINT newsletters_default_frequency_permitted CHECK (default_frequency = ANY (permitted_frequencies)),
  CONSTRAINT newsletters_ttl_positive CHECK (
    confirmation_ttl > interval '0'
    AND pending_retention > interval '0'
    AND unsubscribed_retention > interval '0'
  )
);

COMMENT ON TABLE subscriptions.newsletters IS
  'Registry of newsletters (§45.1.2 subscriptions schema). Newsletters are data, never hard-coded identifiers: feature code resolves one by slug.';
COMMENT ON COLUMN subscriptions.newsletters.audience IS
  'subscriber_tier marks a newsletter gated on an entitlement, evaluated by the §45.1.11 subscription policy class.';
COMMENT ON COLUMN subscriptions.newsletters.confirmation_ttl IS
  'Lifetime of a double opt-in confirmation token. Unconfirmed records expire after this period (requirement 3).';

-- Public listing reads only the active rows.
CREATE INDEX newsletters_active_idx ON subscriptions.newsletters (slug) WHERE active;

-- ---------------------------------------------------------------------------
-- subscriptions.subscribers — an address, not an account. user_id is nullable
-- by design: a subscription may exist with no platform account (requirement 10).
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.subscribers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The address exactly as supplied, retained for correspondence.
  email            text NOT NULL,
  -- Derived, never client-supplied: a generated column cannot be bypassed.
  normalised_email text GENERATED ALWAYS AS (private.normalise_email(email)) STORED,
  -- Deleting a platform account must NOT destroy the subscription or its consent
  -- history, so the link is severed rather than cascaded (requirement 10).
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at        timestamptz,
  link_source      text CHECK (link_source IN ('signup', 'account_settings', 'admin', 'import')),
  locale           text NOT NULL DEFAULT 'en',
  -- Set when the subscriber unsubscribes from everything at once (requirement 8).
  global_unsubscribed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscribers_email_shape CHECK (
    private.normalise_email(email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  -- Linking a platform account is explicit and recorded, never implied
  -- (requirement 10). One-directional by design: when ON DELETE SET NULL clears
  -- user_id on account deletion, linked_at and link_source remain as the record
  -- that a link once existed. A constraint requiring them to clear together
  -- would make the FK action fail and block account deletion outright.
  CONSTRAINT subscribers_link_recorded CHECK (
    user_id IS NULL OR (linked_at IS NOT NULL AND link_source IS NOT NULL)
  )
);

CREATE UNIQUE INDEX subscribers_normalised_email_key ON subscriptions.subscribers (normalised_email);
CREATE UNIQUE INDEX subscribers_user_key ON subscriptions.subscribers (user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE subscriptions.subscribers IS
  'One row per email address (§45.1.2 subscriptions schema). Independent of auth.users: user_id is nullable and cleared, not cascaded, on account deletion (requirement 10).';
COMMENT ON COLUMN subscriptions.subscribers.normalised_email IS
  'Generated from email; the unique key for all comparison. Addresses are normalised before comparison and storage (Block 14 data requirement).';
COMMENT ON COLUMN subscriptions.subscribers.email IS
  'Lawful erasure replaces this with a tombstone address rather than deleting the row, so the append-only consent ledger survives without retaining the address.';

-- ---------------------------------------------------------------------------
-- subscriptions.subscriptions — one subscriber to one newsletter. Double
-- opt-in: a row is created 'pending' and only becomes 'active' on confirmation.
-- Tokens are stored as their SHA-256 digest; the raw token never reaches the
-- database (Block 14 technical requirement).
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.subscriptions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id                 uuid NOT NULL REFERENCES subscriptions.subscribers(id) ON DELETE CASCADE,
  -- A newsletter is deactivated, never deleted while subscriptions reference it.
  newsletter_id                 uuid NOT NULL REFERENCES subscriptions.newsletters(id) ON DELETE RESTRICT,
  status                        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'unsubscribed')),
  frequency                     text NOT NULL
    CHECK (frequency IN ('immediate', 'daily', 'weekly', 'fortnightly', 'monthly')),
  confirmation_token_hash       bytea,
  confirmation_token_expires_at timestamptz,
  confirmation_sent_at          timestamptz,
  confirmed_at                  timestamptz,
  unsubscribe_token_hash        bytea,
  unsubscribe_token_issued_at   timestamptz,
  unsubscribed_at               timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  -- Subscription writes are idempotent on address plus newsletter.
  UNIQUE (subscriber_id, newsletter_id),
  -- An unconfirmed record can never be active: the invariant is in the database,
  -- not in the route handler.
  CONSTRAINT subscriptions_active_requires_confirmation CHECK (
    status <> 'active' OR confirmed_at IS NOT NULL
  ),
  CONSTRAINT subscriptions_pending_is_unconfirmed CHECK (
    status <> 'pending' OR confirmed_at IS NULL
  ),
  CONSTRAINT subscriptions_unsubscribed_has_timestamp CHECK (
    status <> 'unsubscribed' OR unsubscribed_at IS NOT NULL
  ),
  -- A confirmation token is always time-limited.
  CONSTRAINT subscriptions_confirmation_token_expires CHECK (
    (confirmation_token_hash IS NULL) = (confirmation_token_expires_at IS NULL)
  ),
  CONSTRAINT subscriptions_unsubscribe_token_issued CHECK (
    (unsubscribe_token_hash IS NULL) = (unsubscribe_token_issued_at IS NULL)
  ),
  -- Exactly a SHA-256 digest. A raw token would not be 32 bytes of bytea.
  CONSTRAINT subscriptions_confirmation_hash_is_sha256 CHECK (
    confirmation_token_hash IS NULL OR octet_length(confirmation_token_hash) = 32
  ),
  CONSTRAINT subscriptions_unsubscribe_hash_is_sha256 CHECK (
    unsubscribe_token_hash IS NULL OR octet_length(unsubscribe_token_hash) = 32
  )
);

CREATE INDEX subscriptions_newsletter_idx ON subscriptions.subscriptions (newsletter_id, status);
CREATE INDEX subscriptions_active_idx ON subscriptions.subscriptions (newsletter_id, subscriber_id)
  WHERE status = 'active';
-- Token lookup is the confirmation and unsubscribe access path; unique so a
-- digest collision surfaces as an error rather than an ambiguous match.
CREATE UNIQUE INDEX subscriptions_confirmation_token_key ON subscriptions.subscriptions (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_unsubscribe_token_key ON subscriptions.subscriptions (unsubscribe_token_hash)
  WHERE unsubscribe_token_hash IS NOT NULL;
-- The expiry job scans only unconfirmed rows.
CREATE INDEX subscriptions_pending_expiry_idx ON subscriptions.subscriptions (confirmation_token_expires_at)
  WHERE status = 'pending';

COMMENT ON TABLE subscriptions.subscriptions IS
  'Subscriber-to-newsletter records with double opt-in state (§45.1.2 subscriptions schema). Unique on (subscriber, newsletter) so writes are idempotent on address plus newsletter.';
COMMENT ON COLUMN subscriptions.subscriptions.confirmation_token_hash IS
  'SHA-256 digest of a single-use, time-limited confirmation token. The raw token is never stored or logged.';
COMMENT ON COLUMN subscriptions.subscriptions.unsubscribe_token_hash IS
  'SHA-256 digest of the one-click unsubscribe token. Grants unsubscribe only and exposes no account data.';

-- ---------------------------------------------------------------------------
-- subscriptions.consent_events — the append-only consent ledger. A bigint
-- identity key is used deliberately: this is an ordered, insert-only log, the
-- same shape as audit.events (§45.1.9), and ordering matters more than a
-- client-generatable identifier.
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.consent_events (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  -- RESTRICT: consent history is never destroyed as a side effect of deleting
  -- the subscriber it describes (requirement 10).
  subscriber_id          uuid NOT NULL REFERENCES subscriptions.subscribers(id) ON DELETE RESTRICT,
  -- NULL for a global action that spans every newsletter.
  newsletter_id          uuid REFERENCES subscriptions.newsletters(id) ON DELETE RESTRICT,
  subscription_id        uuid REFERENCES subscriptions.subscriptions(id) ON DELETE SET NULL,
  action                 text NOT NULL CHECK (action IN (
                           'opt_in_requested', 'opt_in_confirmed', 'opt_in_expired',
                           'frequency_changed', 'topics_updated', 'preferences_updated',
                           'unsubscribed', 'global_unsubscribed',
                           'suppressed', 'suppression_cleared', 'resubscribe_blocked',
                           'account_linked', 'account_unlinked')),
  source_surface         text NOT NULL CHECK (source_surface IN (
                           'web_form', 'account_settings', 'email_link', 'admin',
                           'api', 'import', 'provider_webhook', 'scheduled_job')),
  -- Nullable: recorded only where retention is lawful for this subscriber.
  ip_address             inet,
  user_agent             text,
  consent_version        text NOT NULL,
  privacy_policy_version text NOT NULL,
  request_id             text,
  detail                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_events_subscriber_idx ON subscriptions.consent_events (subscriber_id, occurred_at DESC);
CREATE INDEX consent_events_newsletter_idx ON subscriptions.consent_events (newsletter_id, occurred_at DESC);
CREATE INDEX consent_events_subscription_idx ON subscriptions.consent_events (subscription_id);
CREATE INDEX consent_events_action_idx ON subscriptions.consent_events (action, occurred_at DESC);

COMMENT ON TABLE subscriptions.consent_events IS
  'Append-only consent ledger (requirement 4), enforced by trigger in the manner of audit.events (§45.1.9). Records newsletter, action, timestamp, source surface, IP where lawful, user agent, and both policy versions.';
COMMENT ON COLUMN subscriptions.consent_events.ip_address IS
  'Retained only where lawful for this subscriber; NULL otherwise. Redacted in logs per Block 19.';

-- ---------------------------------------------------------------------------
-- subscriptions.topic_preferences — controlled vocabulary only. There is no
-- text column here: a free-text topic is structurally impossible (requirement 6).
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.topic_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscriptions.subscribers(id) ON DELETE CASCADE,
  -- RESTRICT mirrors taxonomy.content_terms: a term in use is merged or
  -- deprecated, never deleted out from under a subscriber's selection.
  term_id       uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, term_id)
);

CREATE INDEX topic_preferences_term_idx ON subscriptions.topic_preferences (term_id);

COMMENT ON TABLE subscriptions.topic_preferences IS
  'Subscriber topic selections drawn from the controlled taxonomy (§45.1.4). The FK to taxonomy.terms is the only permitted source; free-text topics are not representable. Readers follow taxonomy.terms.merged_into_id.';

-- ---------------------------------------------------------------------------
-- subscriptions.suppressions — provider suppression signals. Append-only: the
-- substantive record can never be edited or deleted. A clearance is recordable
-- (cleared_at) because the lawful re-subscription path is an explicit, audited
-- operator action followed by a fresh double opt-in; that clearance is itself
-- write-once and cannot be withdrawn.
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.suppressions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  normalised_email  text GENERATED ALWAYS AS (private.normalise_email(email)) STORED,
  reason            text NOT NULL CHECK (reason IN ('hard_bounce', 'spam_complaint', 'manual')),
  received_at       timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'provider_webhook'
    CHECK (source IN ('provider_webhook', 'provider_sync', 'admin')),
  -- Webhook idempotency: replaying a verified provider event is a no-op.
  provider_event_id text,
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  cleared_at        timestamptz,
  cleared_reason    text CHECK (cleared_reason IN ('fresh_opt_in', 'operator_review', 'provider_correction')),
  cleared_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppressions_email_shape CHECK (
    private.normalise_email(email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT suppressions_clearance_recorded CHECK ((cleared_at IS NULL) = (cleared_reason IS NULL))
);

-- The activation guard's access path: active suppressions for an address.
CREATE INDEX suppressions_active_idx ON subscriptions.suppressions (normalised_email, received_at DESC)
  WHERE cleared_at IS NULL;
CREATE INDEX suppressions_email_idx ON subscriptions.suppressions (normalised_email);
CREATE UNIQUE INDEX suppressions_provider_event_key ON subscriptions.suppressions (source, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX suppressions_cleared_by_idx ON subscriptions.suppressions (cleared_by) WHERE cleared_by IS NOT NULL;

COMMENT ON TABLE subscriptions.suppressions IS
  'Append-only ledger of hard bounces, spam complaints and manual suppressions (requirement 9). The substantive record is immutable; only a write-once clearance may be added, and clearance alone does not resubscribe — a fresh double opt-in is still required.';

-- ---------------------------------------------------------------------------
-- subscriptions.delivery_queue — the provider failure queue (requirements 11
-- and 12). Rows are enqueued by the trusted server layer when a provider call
-- fails; the drain worker performs the retry. Nothing in the database ever
-- calls a provider (rules/database.md 19b).
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions.delivery_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The five operations of the provider interface (requirement 2).
  operation        text NOT NULL CHECK (operation IN (
                     'subscribe', 'confirm', 'update_preferences',
                     'unsubscribe', 'suppression_sync')),
  subscriber_id    uuid REFERENCES subscriptions.subscribers(id) ON DELETE CASCADE,
  subscription_id  uuid REFERENCES subscriptions.subscriptions(id) ON DELETE CASCADE,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Retries are idempotent: the adapter replays this key to the provider.
  idempotency_key  text NOT NULL UNIQUE,
  -- Correlation identifier carried on every provider call.
  request_id       text,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_flight', 'succeeded', 'dead_lettered')),
  attempt_count    integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 8,
  last_error       text,
  last_attempt_at  timestamptz,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  dead_lettered    boolean NOT NULL DEFAULT false,
  dead_lettered_at timestamptz,
  succeeded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_queue_attempts_bounded CHECK (
    attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts
  ),
  -- The flag and the status cannot disagree.
  CONSTRAINT delivery_queue_dead_letter_consistent CHECK (
    dead_lettered = (status = 'dead_lettered')
  ),
  CONSTRAINT delivery_queue_dead_letter_timestamped CHECK (
    dead_lettered = (dead_lettered_at IS NOT NULL)
  ),
  CONSTRAINT delivery_queue_success_timestamped CHECK (
    (status = 'succeeded') = (succeeded_at IS NOT NULL)
  ),
  CONSTRAINT delivery_queue_attempt_timestamped CHECK (
    attempt_count = 0 OR last_attempt_at IS NOT NULL
  )
);

-- Drain order: the worker claims due pending rows oldest-first.
CREATE INDEX delivery_queue_due_idx ON subscriptions.delivery_queue (next_attempt_at)
  WHERE status = 'pending';
-- The Block 09 newsletter manager lists the dead-letter state.
CREATE INDEX delivery_queue_dead_letter_idx ON subscriptions.delivery_queue (dead_lettered_at DESC)
  WHERE dead_lettered;
CREATE INDEX delivery_queue_subscriber_idx ON subscriptions.delivery_queue (subscriber_id);
CREATE INDEX delivery_queue_subscription_idx ON subscriptions.delivery_queue (subscription_id);

COMMENT ON TABLE subscriptions.delivery_queue IS
  'Failure queue for provider calls (requirements 11 and 12): payload, attempt count, last error, next attempt time, and dead-letter state. Drained by the server-layer worker; the database never calls a provider (rules/database.md 19b).';
COMMENT ON COLUMN subscriptions.delivery_queue.idempotency_key IS
  'Stable across retries so a replayed call is a no-op at the provider. Unique, so double enqueue of the same operation is rejected.';

-- ---------------------------------------------------------------------------
-- Retry schedule. Deterministic and bounded, shared by the drain worker so the
-- backoff policy has exactly one definition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.delivery_backoff(
  p_attempt integer,
  p_base    interval DEFAULT interval '30 seconds',
  p_cap     interval DEFAULT interval '6 hours'
)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  -- The exponent is clamped at 20 before multiplication: LEAST evaluates both
  -- arguments, so an unclamped 2^n would raise "interval out of range" for a
  -- large attempt count before the cap could ever apply.
  SELECT LEAST(p_base * (2 ^ LEAST(GREATEST(p_attempt - 1, 0), 20))::double precision, p_cap);
$$;

COMMENT ON FUNCTION private.delivery_backoff(integer, interval, interval) IS
  'Bounded exponential backoff for subscriptions.delivery_queue (requirement 12). Deterministic; the drain worker computes next_attempt_at from it.';

-- ---------------------------------------------------------------------------
-- Consent ledger is append-only. Enforced at table level so it holds even
-- against a role that bypasses RLS (as audit.events does, §45.1.9).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.reject_consent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'subscriptions.consent_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMENT ON FUNCTION private.reject_consent_event_mutation() IS
  'Blocks UPDATE and DELETE on the consent ledger (requirement 4). No side effects; raises only.';

CREATE TRIGGER consent_events_no_update
  BEFORE UPDATE ON subscriptions.consent_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_consent_event_mutation();

CREATE TRIGGER consent_events_no_delete
  BEFORE DELETE ON subscriptions.consent_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_consent_event_mutation();

-- ---------------------------------------------------------------------------
-- Suppression ledger is append-only apart from the write-once clearance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.reject_suppression_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subscriptions.suppressions is append-only: DELETE is not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.email             IS DISTINCT FROM OLD.email
  OR NEW.reason            IS DISTINCT FROM OLD.reason
  OR NEW.received_at       IS DISTINCT FROM OLD.received_at
  OR NEW.source            IS DISTINCT FROM OLD.source
  OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
  OR NEW.detail            IS DISTINCT FROM OLD.detail
  OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'subscriptions.suppressions is append-only: only a clearance may be recorded on row %', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.cleared_at IS NOT NULL
     AND (NEW.cleared_at     IS DISTINCT FROM OLD.cleared_at
       OR NEW.cleared_reason IS DISTINCT FROM OLD.cleared_reason
       OR NEW.cleared_by     IS DISTINCT FROM OLD.cleared_by)
  THEN
    RAISE EXCEPTION 'suppression clearance on row % is write-once and cannot be altered or withdrawn', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.reject_suppression_mutation() IS
  'Keeps subscriptions.suppressions append-only: DELETE is refused, the substantive record is frozen, and a recorded clearance cannot be altered or withdrawn.';

CREATE TRIGGER suppressions_append_only
  BEFORE UPDATE OR DELETE ON subscriptions.suppressions
  FOR EACH ROW EXECUTE FUNCTION private.reject_suppression_mutation();

-- ---------------------------------------------------------------------------
-- Suppression lookup. SECURITY DEFINER because the guard below must see every
-- suppression regardless of the calling role's RLS visibility; a role that
-- could not read the ledger would otherwise observe "not suppressed" and
-- activate a suppressed address. Read-only, single table, no dynamic SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.active_suppression_reason(p_normalised_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.reason
    FROM subscriptions.suppressions s
   WHERE s.normalised_email = p_normalised_email
     AND s.cleared_at IS NULL
   ORDER BY s.received_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION private.active_suppression_reason(text) IS
  'Reason of the most recent uncleared suppression for an address, or NULL. SECURITY DEFINER so the activation guard cannot be defeated by a role that cannot read the suppression ledger.';

-- A suppressed address is never re-subscribed silently (requirement 9).
CREATE OR REPLACE FUNCTION private.reject_suppressed_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email  text;
  v_reason text;
BEGIN
  -- Only activation is guarded. Creating or amending a pending record is fine;
  -- it simply never becomes active while the suppression stands.
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT s.normalised_email INTO v_email
    FROM subscriptions.subscribers s
   WHERE s.id = NEW.subscriber_id;

  v_reason := private.active_suppression_reason(v_email);

  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'address is suppressed (%): activation requires the suppression to be cleared and a fresh double opt-in', v_reason
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.reject_suppressed_activation() IS
  'Refuses to let a subscription reach status active while the address holds an uncleared suppression (requirement 9). SECURITY DEFINER: the check must not depend on the caller''s RLS visibility.';

CREATE TRIGGER subscriptions_suppression_guard
  BEFORE INSERT OR UPDATE ON subscriptions.subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.reject_suppressed_activation();

-- The chosen frequency must be one the newsletter offers (requirement 7).
CREATE OR REPLACE FUNCTION private.enforce_permitted_frequency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_permitted text[];
BEGIN
  SELECT n.permitted_frequencies INTO v_permitted
    FROM subscriptions.newsletters n
   WHERE n.id = NEW.newsletter_id;

  IF NOT (NEW.frequency = ANY (v_permitted)) THEN
    RAISE EXCEPTION 'frequency % is not permitted for this newsletter (permitted: %)',
      NEW.frequency, v_permitted
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_permitted_frequency() IS
  'Constrains subscriptions.frequency to the owning newsletter''s permitted_frequencies. SECURITY DEFINER so the registry lookup is not narrowed by the caller''s RLS visibility.';

CREATE TRIGGER subscriptions_frequency_permitted
  BEFORE INSERT OR UPDATE OF frequency, newsletter_id ON subscriptions.subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_permitted_frequency();

-- ---------------------------------------------------------------------------
-- Work list for the scheduled expiry job (requirement 3). A view, not a job:
-- the database schedules nothing.
-- ---------------------------------------------------------------------------
CREATE VIEW subscriptions.expired_pending_subscriptions
WITH (security_invoker = true) AS
  SELECT s.id,
         s.subscriber_id,
         s.newsletter_id,
         s.confirmation_token_expires_at,
         s.created_at
    FROM subscriptions.subscriptions s
   WHERE s.status = 'pending'
     AND s.confirmation_token_expires_at IS NOT NULL
     AND s.confirmation_token_expires_at < now();

COMMENT ON VIEW subscriptions.expired_pending_subscriptions IS
  'Unconfirmed subscriptions whose confirmation token has expired (requirement 3). security_invoker so the view cannot widen the reader''s RLS visibility (rules/database.md 10).';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE TRIGGER newsletters_updated_at BEFORE UPDATE ON subscriptions.newsletters
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER subscribers_updated_at BEFORE UPDATE ON subscriptions.subscribers
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions.subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER suppressions_updated_at BEFORE UPDATE ON subscriptions.suppressions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER delivery_queue_updated_at BEFORE UPDATE ON subscriptions.delivery_queue
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS on from creation; policies live in the RLS migration (rules/database.md 6).
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions.newsletters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.subscribers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.consent_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.topic_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.suppressions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions.delivery_queue     ENABLE ROW LEVEL SECURITY;
