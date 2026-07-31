-- Block 05 — Database Content Model (§45.1.3)
-- Structured, versioned content with immutable published versions.
-- Reverse: DROP SCHEMA cms CASCADE;

-- ---------------------------------------------------------------------------
-- Content types. Carries the minimum evidence standard (§45.1.7).
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_types (
  key                      text PRIMARY KEY,
  name                     text NOT NULL,
  description              text,
  permitted_module_types   text[] NOT NULL DEFAULT '{}',
  requires_methodology     boolean NOT NULL DEFAULT false,
  requires_limitations     boolean NOT NULL DEFAULT false,
  -- §45.1.7: whether claim-to-source linkage is optional or mandatory is declared
  -- per content type. Quantitative traceability is absolute and not set here.
  minimum_evidence_standard text NOT NULL DEFAULT 'optional'
    CHECK (minimum_evidence_standard IN ('optional', 'recommended', 'mandatory')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN cms.content_types.minimum_evidence_standard IS
  '§45.1.7. Declared here, enforced by the Block 08 publication gate, semantics in Block 16.';

-- ---------------------------------------------------------------------------
-- Module catalogue. Payloads are validated JSON, never opaque HTML.
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_modules (
  key           text PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  json_schema   jsonb NOT NULL,
  -- A module rendering a visual must carry a text alternative field.
  is_visual     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cms.content_modules IS
  'Registered module types with their JSON schemas. A type must be registered before use.';

-- ---------------------------------------------------------------------------
-- Content items — the stable entity. The public identifier never changes.
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           text NOT NULL UNIQUE DEFAULT ('crux-' || encode(gen_random_bytes(6), 'hex')),
  content_type_key    text NOT NULL REFERENCES cms.content_types(key) ON DELETE RESTRICT,
  canonical_slug      text NOT NULL,
  locale              text NOT NULL DEFAULT 'en',
  current_version_id  uuid,
  lifecycle_state     text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_state IN ('draft', 'published', 'superseded', 'withdrawn')),
  withdrawn_at        timestamptz,
  withdrawal_reason   text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- §45.1.3: slug uniqueness per locale.
  UNIQUE (locale, canonical_slug),
  CONSTRAINT withdrawn_requires_reason CHECK (
    lifecycle_state <> 'withdrawn' OR (withdrawn_at IS NOT NULL AND withdrawal_reason IS NOT NULL)
  )
);

CREATE INDEX content_items_type_idx      ON cms.content_items (content_type_key);
CREATE INDEX content_items_state_idx     ON cms.content_items (lifecycle_state);
CREATE INDEX content_items_published_idx ON cms.content_items (lifecycle_state, updated_at DESC)
  WHERE lifecycle_state = 'published';

-- ---------------------------------------------------------------------------
-- Content versions. Published rows are immutable (§45.1.3).
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id     uuid NOT NULL REFERENCES cms.content_items(id) ON DELETE CASCADE,
  version_number      integer NOT NULL,
  public_version_id   text NOT NULL UNIQUE DEFAULT ('v-' || encode(gen_random_bytes(6), 'hex')),
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'changes_requested', 'approved',
                      'scheduled', 'published', 'correction_pending',
                      'superseded', 'withdrawn')),
  title               text NOT NULL,
  standfirst          text,
  executive_summary   text,
  methodology         text,
  limitations         text,
  -- Derived representations, maintained by trigger from the module payloads.
  plain_text          text,
  markdown            text,
  published_at        timestamptz,
  revised_at          timestamptz,
  scheduled_for       timestamptz,
  supersedes_id       uuid REFERENCES cms.content_versions(id) ON DELETE SET NULL,
  superseded_by_id    uuid REFERENCES cms.content_versions(id) ON DELETE SET NULL,
  correction_reason   text,
  correction_scope    text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, version_number),
  CONSTRAINT published_has_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT version_number_positive CHECK (version_number > 0),
  CONSTRAINT no_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX content_versions_item_idx      ON cms.content_versions (content_item_id, version_number DESC);
CREATE INDEX content_versions_status_idx    ON cms.content_versions (status);
CREATE INDEX content_versions_published_idx ON cms.content_versions (published_at DESC)
  WHERE status = 'published';
CREATE INDEX content_versions_scheduled_idx ON cms.content_versions (scheduled_for)
  WHERE status = 'scheduled';

ALTER TABLE cms.content_items
  ADD CONSTRAINT content_items_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES cms.content_versions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Version modules — the ordered structured body (§45.1.3).
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_version_modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  module_key    text NOT NULL REFERENCES cms.content_modules(key) ON DELETE RESTRICT,
  position      integer NOT NULL,
  -- Stable within its version, preserved across edits and reordering.
  fragment_id   text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, fragment_id),
  UNIQUE (version_id, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT position_non_negative CHECK (position >= 0)
);

CREATE INDEX cvm_version_idx ON cms.content_version_modules (version_id, position);

COMMENT ON COLUMN cms.content_version_modules.fragment_id IS
  'Stable fragment identifier, unique within the version, addressable by a citation and emitted as the section id in the public HTML.';

-- ---------------------------------------------------------------------------
-- Contributors, relationships, redirects
-- ---------------------------------------------------------------------------
CREATE TABLE cms.content_contributors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  person_id    uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  role         text NOT NULL CHECK (role IN ('author', 'reviewer', 'editor', 'data_analyst',
                                             'contributor', 'translator', 'illustrator')),
  affiliation  text,
  position     integer NOT NULL DEFAULT 0,
  -- Only citation-bearing roles appear in a rendered citation.
  in_citation  boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, person_id, role)
);

CREATE INDEX content_contributors_person_idx ON cms.content_contributors (person_id);

CREATE TABLE cms.content_relationships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_item_id  uuid NOT NULL REFERENCES cms.content_items(id) ON DELETE CASCADE,
  to_item_id    uuid NOT NULL REFERENCES cms.content_items(id) ON DELETE CASCADE,
  relationship  text NOT NULL CHECK (relationship IN ('supersedes', 'corrects', 'relates_to',
                                                      'part_of_collection', 'cites')),
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_item_id, to_item_id, relationship),
  CONSTRAINT no_self_relationship CHECK (from_item_id <> to_item_id)
);

CREATE INDEX content_relationships_to_idx ON cms.content_relationships (to_item_id, relationship);

CREATE TABLE cms.redirects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path  text NOT NULL UNIQUE,
  target_path  text NOT NULL,
  status_code  integer NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308)),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirect_not_circular CHECK (source_path <> target_path)
);

-- Deferred FK from taxonomy.content_terms, declared here to keep order acyclic.
ALTER TABLE taxonomy.content_terms
  ADD CONSTRAINT content_terms_item_fk
  FOREIGN KEY (content_item_id) REFERENCES cms.content_items(id) ON DELETE CASCADE;

ALTER TABLE identity.external_identifiers
  ADD CONSTRAINT external_identifiers_item_fk
  FOREIGN KEY (content_item_id) REFERENCES cms.content_items(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- IMMUTABILITY (§45.1.3). Enforced by trigger, not convention.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'published version % is immutable: DELETE is not permitted', OLD.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' THEN
    -- A published version may only transition to superseded or withdrawn, and may
    -- only have its supersession pointer set. Everything else is frozen.
    IF NEW.title              IS DISTINCT FROM OLD.title
    OR NEW.standfirst         IS DISTINCT FROM OLD.standfirst
    OR NEW.executive_summary  IS DISTINCT FROM OLD.executive_summary
    OR NEW.methodology        IS DISTINCT FROM OLD.methodology
    OR NEW.limitations        IS DISTINCT FROM OLD.limitations
    OR NEW.plain_text         IS DISTINCT FROM OLD.plain_text
    OR NEW.markdown           IS DISTINCT FROM OLD.markdown
    OR NEW.published_at       IS DISTINCT FROM OLD.published_at
    OR NEW.version_number     IS DISTINCT FROM OLD.version_number
    OR NEW.content_item_id    IS DISTINCT FROM OLD.content_item_id
    THEN
      RAISE EXCEPTION 'published version % is immutable: content and publication timestamp cannot change', OLD.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status NOT IN ('published', 'superseded', 'withdrawn') THEN
      RAISE EXCEPTION 'published version % cannot return to status %', OLD.id, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER content_versions_immutable
  BEFORE UPDATE OR DELETE ON cms.content_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_version_immutability();

-- Modules of a published version are frozen entirely.
CREATE OR REPLACE FUNCTION private.enforce_module_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM cms.content_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);

  IF v_status = 'published' THEN
    RAISE EXCEPTION 'modules of published version % are immutable (%)',
      COALESCE(NEW.version_id, OLD.version_id), TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER cvm_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON cms.content_version_modules
  FOR EACH ROW EXECUTE FUNCTION private.enforce_module_immutability();

-- Contributors of a published version are frozen.
CREATE OR REPLACE FUNCTION private.enforce_contributor_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM cms.content_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'contributors of published version % are immutable (%)',
      COALESCE(NEW.version_id, OLD.version_id), TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER content_contributors_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON cms.content_contributors
  FOR EACH ROW EXECUTE FUNCTION private.enforce_contributor_immutability();

-- ---------------------------------------------------------------------------
-- Derived text generation. Deterministic; no external calls.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.render_version_text(p_version_id uuid)
RETURNS TABLE (plain text, md text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    string_agg(
      COALESCE(m.payload ->> 'text', m.payload ->> 'heading', m.payload ->> 'caption', ''),
      E'\n\n' ORDER BY m.position
    ),
    string_agg(
      CASE m.module_key
        WHEN 'heading' THEN repeat('#', LEAST(GREATEST(COALESCE((m.payload ->> 'level')::int, 2), 1), 6))
                            || ' ' || COALESCE(m.payload ->> 'heading', '')
        WHEN 'prose'   THEN COALESCE(m.payload ->> 'text', '')
        WHEN 'quote'   THEN '> ' || COALESCE(m.payload ->> 'text', '')
        ELSE COALESCE(m.payload ->> 'text', m.payload ->> 'caption', '')
      END,
      E'\n\n' ORDER BY m.position
    )
  FROM cms.content_version_modules m
  WHERE m.version_id = p_version_id;
$$;

CREATE OR REPLACE FUNCTION private.refresh_version_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid := COALESCE(NEW.version_id, OLD.version_id);
  r    record;
BEGIN
  SELECT * INTO r FROM private.render_version_text(v_id);
  UPDATE cms.content_versions
     SET plain_text = r.plain, markdown = r.md
   WHERE id = v_id AND status <> 'published';
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER cvm_refresh_text
  AFTER INSERT OR UPDATE OR DELETE ON cms.content_version_modules
  FOR EACH ROW EXECUTE FUNCTION private.refresh_version_text();

-- Slug defaulting via the deterministic generator (§45.1.12).
CREATE OR REPLACE FUNCTION private.default_content_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.canonical_slug IS NOT NULL AND NEW.canonical_slug <> '' THEN
    RETURN NEW;
  END IF;
  base := private.slugify(COALESCE(NEW.public_id, 'item'));
  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM cms.content_items
     WHERE locale = NEW.locale AND canonical_slug = candidate
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  NEW.canonical_slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_items_default_slug
  BEFORE INSERT ON cms.content_items
  FOR EACH ROW EXECUTE FUNCTION private.default_content_slug();

CREATE TRIGGER content_items_updated_at BEFORE UPDATE ON cms.content_items
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER content_versions_updated_at BEFORE UPDATE ON cms.content_versions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER cvm_updated_at BEFORE UPDATE ON cms.content_version_modules
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE cms.content_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_version_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_contributors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.content_relationships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.redirects                ENABLE ROW LEVEL SECURITY;
