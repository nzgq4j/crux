-- Block 06 — Abuse limiting for authentication endpoints (rules/security.md 22–25)
--
-- Reverse: DROP FUNCTION private.check_rate_limit(text, text, integer, interval);
--          DROP FUNCTION private.purge_rate_limit_events(interval);
--          DROP TABLE private.rate_limit_events;
--
-- Why this exists as database state rather than process memory: rules/security.md 24
-- requires rate-limit state to be shared across instances. A Map in a Next.js server
-- process is per-instance and resets on every deploy, which is a limiter that reports
-- success and enforces nothing.
--
-- Why `private`: the API roles hold no USAGE on this schema, so no client can read the
-- limiter's state, count another subject's attempts, or clear its own. The trusted
-- server layer reaches it on the platform's own connection.

CREATE TABLE private.rate_limit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The endpoint class being limited: sign_in, register, password_reset, and so on.
  bucket      text NOT NULL CHECK (length(btrim(bucket)) > 0),
  -- A salted hash of the identifying value, never the value itself. An email address
  -- in a rate-limit table is a list of who holds an account, readable by anyone who
  -- reaches the row (rules/security.md 6, and the enumeration concern in 25).
  subject_key text NOT NULL CHECK (length(subject_key) = 64),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.rate_limit_events IS
  'Sliding-window attempt log for abuse limiting (rules/security.md 22). Subjects are hashed, never stored in the clear. Not exposed to any API role.';
COMMENT ON COLUMN private.rate_limit_events.subject_key IS
  'sha256 hex of (salt || bucket || normalised subject). Correlating this to an address requires the server-side salt.';

-- The access path is always (bucket, subject_key, recent). Descending time so the
-- window scan stops early.
CREATE INDEX rate_limit_events_lookup_idx
  ON private.rate_limit_events (bucket, subject_key, occurred_at DESC);
-- The access path for the purge.
CREATE INDEX rate_limit_events_occurred_idx
  ON private.rate_limit_events (occurred_at);

ALTER TABLE private.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- No policy is created, deliberately. RLS enabled with no policy denies every role
-- except the table owner and BYPASSRLS holders, which is precisely the intent: this
-- table has no legitimate reader among the API roles. rules/database.md 6 requires RLS
-- at creation; the absence of a policy here is the control, not an omission.

-- ---------------------------------------------------------------------------
-- private.check_rate_limit — record an attempt and report whether it is allowed.
--
-- Purpose:      count attempts for (bucket, subject) inside a sliding window and
--               decide whether this one may proceed.
-- Inputs:       p_bucket      endpoint class
--               p_subject_key hashed subject (64 hex characters)
--               p_limit       maximum attempts permitted within the window
--               p_window      the sliding window
-- Returns:      allowed, remaining, retry_after_seconds
-- Side effects: inserts one row per call, including refused calls. A refused attempt
--               is an attempt; not counting it would let a caller hold the gate open
--               indefinitely by continuing to knock.
-- Security:     SECURITY DEFINER with a pinned search_path. It must write to a table
--               the caller cannot reach, which is the whole point of the table living
--               in `private`. It takes no free text into statement text and performs
--               no dynamic SQL.
-- Determinism:  reads now(); deterministic given the same clock and state
--               (rules/database.md 19a admits time as database state).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.check_rate_limit(
  p_bucket      text,
  p_subject_key text,
  p_limit       integer,
  p_window      interval
)
  RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_cutoff  timestamptz := now() - p_window;
  v_count   integer;
  v_oldest  timestamptz;
BEGIN
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'rate limit must be at least 1, got %', p_limit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF length(p_subject_key) <> 64 THEN
    RAISE EXCEPTION 'subject key must be a 64-character digest'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO private.rate_limit_events (bucket, subject_key)
  VALUES (p_bucket, p_subject_key);

  SELECT count(*), min(e.occurred_at)
    INTO v_count, v_oldest
    FROM private.rate_limit_events e
   WHERE e.bucket = p_bucket
     AND e.subject_key = p_subject_key
     AND e.occurred_at > v_cutoff;

  allowed := v_count <= p_limit;
  remaining := GREATEST(p_limit - v_count, 0);
  -- When refused, the caller may retry once the oldest attempt in the window ages out.
  retry_after_seconds := CASE
    WHEN allowed THEN 0
    ELSE GREATEST(CEIL(EXTRACT(EPOCH FROM (v_oldest + p_window - now())))::integer, 1)
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.check_rate_limit(text, text, integer, interval) FROM PUBLIC;

COMMENT ON FUNCTION private.check_rate_limit(text, text, integer, interval) IS
  'Sliding-window rate limiter (rules/security.md 22-24). Records every attempt including refused ones. Called by the trusted server layer only; EXECUTE is revoked from PUBLIC and the API roles have no USAGE on the schema.';

-- ---------------------------------------------------------------------------
-- private.purge_rate_limit_events — bounded retention.
--
-- Purpose:      delete attempt rows older than the retention interval.
-- Side effects: deletes rows; returns the count.
-- Security:     SECURITY DEFINER, pinned search_path. Operational, not user-facing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.purge_rate_limit_events(p_older_than interval DEFAULT interval '24 hours')
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM private.rate_limit_events WHERE occurred_at < now() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_rate_limit_events(interval) FROM PUBLIC;

COMMENT ON FUNCTION private.purge_rate_limit_events(interval) IS
  'Retention for the abuse-limiting log. Attempt records are operational data with no reason to persist beyond the longest window.';
