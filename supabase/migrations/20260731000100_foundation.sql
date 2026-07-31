-- Block 04 — Supabase Foundation
-- §45.1.1 extensions, §45.1.2 schemas, private helpers, §45.1.9 audit.events
--
-- Reverse procedure: DROP SCHEMA ... CASCADE for each schema created here, then
-- DROP EXTENSION for each extension. Destructive; never run against production.

-- ---------------------------------------------------------------------------
-- Extensions (§45.1.1). pgvector, pgcrypto and uuid-ossp are mandatory.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ---------------------------------------------------------------------------
-- Schemas (§45.1.2). Thirteen created here; `auth` is Supabase-managed.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS cms;
CREATE SCHEMA IF NOT EXISTS taxonomy;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS search;
CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS subscriptions;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS private;

-- `auth` is Supabase-managed in production. Created locally so the same
-- migrations apply against a plain PostgreSQL cluster for testing.
CREATE SCHEMA IF NOT EXISTS auth;

-- ---------------------------------------------------------------------------
-- Roles. Mirrors Supabase's role model so RLS behaves identically locally.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA cms, taxonomy, identity, workflow, assets, knowledge,
  search, accounts, subscriptions, analytics, audit, auth
  TO anon, authenticated, service_role;

-- `private` is never exposed. Only the definer functions reach it.
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

-- ---------------------------------------------------------------------------
-- auth.uid() / auth.jwt() — Supabase-compatible current-user accessors.
-- Locally driven by the `request.jwt.claims` GUC, exactly as Supabase does it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

COMMENT ON FUNCTION auth.uid() IS
  'Current authenticated user id, read from the request JWT claims. Returns NULL when anonymous.';

-- ---------------------------------------------------------------------------
-- Shared column conventions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.set_updated_at() IS
  'BEFORE UPDATE trigger maintaining updated_at. Deterministic; no external calls (rules/database.md 19a-19c).';

-- ---------------------------------------------------------------------------
-- Slug generation (§45.1.12). Deterministic, collision-suffixed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT trim(both '-' FROM
    regexp_replace(
      regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

COMMENT ON FUNCTION private.slugify(text) IS
  'Normalises a title to a URL slug (§45.1.12). Deterministic: same input always yields the same slug.';

-- ---------------------------------------------------------------------------
-- audit.events (§45.1.9) — created here because every later block writes to it.
-- Append-only; policies in the RLS migration enforce that.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid,
  actor_label   text,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text,
  decision      text NOT NULL CHECK (decision IN ('allowed', 'denied', 'performed', 'failed')),
  request_id    text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE audit.events IS
  'Append-only audit log (§45.1.9, §45.3.6). Records actor, action, resource, decision. No UPDATE or DELETE by any role.';

-- RLS on at creation, like every other table (rules/database.md rule 6). Without
-- this the policies in the RLS migration would be inert and the audit log would be
-- world-readable.
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS events_occurred_at_idx  ON audit.events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_actor_idx        ON audit.events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_resource_idx     ON audit.events (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS events_action_idx       ON audit.events (action, occurred_at DESC);

-- Append-only enforcement at the table level, independent of RLS, so it holds
-- even against a role that bypasses RLS.
CREATE OR REPLACE FUNCTION private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'audit.events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS events_no_update ON audit.events;
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION private.reject_audit_mutation();

DROP TRIGGER IF EXISTS events_no_delete ON audit.events;
CREATE TRIGGER events_no_delete
  BEFORE DELETE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION private.reject_audit_mutation();

CREATE OR REPLACE FUNCTION private.log_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   text DEFAULT NULL,
  p_decision      text DEFAULT 'performed',
  p_detail        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO audit.events (actor_id, action, resource_type, resource_id, decision, request_id, detail)
  VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_decision,
    NULLIF(current_setting('request.id', true), ''),
    coalesce(p_detail, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION private.log_audit(text, text, text, text, jsonb) IS
  'Writes an append-only audit row (§45.3.6). SECURITY DEFINER with a restricted search_path.';
