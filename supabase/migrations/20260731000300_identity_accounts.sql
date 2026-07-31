-- Block 06 — Identity, accounts, roles and permissions (§45.1.5, §45.2)
--
-- The `identity` schema carries TWO distinct table families:
--   * authorization  — roles, permissions, user_roles, role_permissions (§45.1.5)
--   * bibliographic  — people, organisations, expert_profiles, external_identifiers
-- A platform user and a cited author are different entities. They are linked only
-- through accounts.profiles.person_id.
--
-- Reverse: DROP SCHEMA identity CASCADE; DROP SCHEMA accounts CASCADE;

-- ---------------------------------------------------------------------------
-- auth.users — Supabase-managed in production, defined locally for testing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE NOT NULL,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Authorization family (§45.1.5)
-- ---------------------------------------------------------------------------
CREATE TABLE identity.roles (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  rank        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.permissions (
  key         text PRIMARY KEY,
  resource    text NOT NULL,
  action      text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource, action)
);

COMMENT ON TABLE identity.permissions IS
  'Granular verbs over resources. Spans the four §45.2.3 action families: content, taxonomy, asset, admin.';

CREATE TABLE identity.role_permissions (
  role_key       text NOT NULL REFERENCES identity.roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES identity.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE identity.user_roles (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key    text NOT NULL REFERENCES identity.roles(key) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key)
);

CREATE INDEX user_roles_role_idx ON identity.user_roles (role_key);

-- ---------------------------------------------------------------------------
-- Bibliographic identity family (Block 05)
-- ---------------------------------------------------------------------------
CREATE TABLE identity.people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  family_name  text,
  given_name   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.organisations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  url        text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.expert_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL UNIQUE REFERENCES identity.people(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES identity.organisations(id) ON DELETE SET NULL,
  job_title       text,
  biography       text,
  disclosures     text,
  portrait_url    text,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN identity.expert_profiles.published_at IS
  'A person record may exist without a public profile. Only published profiles are publicly readable.';

CREATE TABLE identity.external_identifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme          text NOT NULL CHECK (scheme IN ('orcid', 'ror', 'doi', 'issn', 'isni', 'wikidata')),
  identifier      text NOT NULL,
  person_id       uuid REFERENCES identity.people(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES identity.organisations(id) ON DELETE CASCADE,
  content_item_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme, identifier),
  CONSTRAINT external_identifier_has_exactly_one_subject CHECK (
    (person_id IS NOT NULL)::int
  + (organisation_id IS NOT NULL)::int
  + (content_item_id IS NOT NULL)::int = 1
  )
);

COMMENT ON TABLE identity.external_identifiers IS
  'ORCID, ROR, DOI, ISSN and similar. An unrecognised scheme is rejected, never stored as free text.';

-- ---------------------------------------------------------------------------
-- Accounts (§45.1.5)
-- ---------------------------------------------------------------------------
CREATE TABLE accounts.profiles (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  person_id     uuid REFERENCES identity.people(id) ON DELETE SET NULL,
  country       text,
  organisation  text,
  job_title     text,
  seniority     text,
  personalisation_enabled boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN accounts.profiles.person_id IS
  'The only link between a platform account and a bibliographic identity record. Nullable: most users are not authors.';

CREATE TABLE accounts.external_identities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text NOT NULL CHECK (provider IN ('google')),
  provider_subject    text NOT NULL,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_email      text NOT NULL,
  linked_at           timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  UNIQUE (provider, provider_subject)
);

COMMENT ON TABLE accounts.external_identities IS
  'Block 28. One provider subject maps to at most one account, enforced by the unique constraint, not by application logic. Written only by the trusted server layer.';

-- ---------------------------------------------------------------------------
-- Permission resolution (§45.2.3). Database-backed; usable inside RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM identity.user_roles ur
      JOIN identity.role_permissions rp ON rp.role_key = ur.role_key
     WHERE ur.user_id = auth.uid()
       AND rp.permission_key = p_permission
  );
$$;

COMMENT ON FUNCTION private.has_permission(text) IS
  'Authoritative permission check (§45.2.3). Reads only server-side role state; never a client claim.';

CREATE OR REPLACE FUNCTION private.has_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.user_roles
     WHERE user_id = auth.uid() AND role_key = p_role
  );
$$;

-- Self-elevation is structurally impossible (§45.1.5): only a user administrator
-- or platform administrator may write user_roles, and never to their own row.
CREATE OR REPLACE FUNCTION private.guard_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  -- Seeding and trusted server operations run without a JWT; they are permitted.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF target = auth.uid() THEN
    RAISE EXCEPTION 'self role assignment is not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (private.has_role('user_administrator') OR private.has_role('platform_administrator')) THEN
    RAISE EXCEPTION 'role assignment requires user_administrator or platform_administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER user_roles_guard
  BEFORE INSERT OR UPDATE OR DELETE ON identity.user_roles
  FOR EACH ROW EXECUTE FUNCTION private.guard_role_assignment();

-- Profile row for every auth user.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO accounts.profiles (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON accounts.profiles
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER people_updated_at BEFORE UPDATE ON identity.people
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER organisations_updated_at BEFORE UPDATE ON identity.organisations
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER expert_profiles_updated_at BEFORE UPDATE ON identity.expert_profiles
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE identity.roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.people                ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.organisations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.expert_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.external_identifiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.external_identities   ENABLE ROW LEVEL SECURITY;
