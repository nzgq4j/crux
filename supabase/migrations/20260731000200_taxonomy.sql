-- Block 05 — Controlled taxonomy (§45.1.4)
-- Reverse: DROP SCHEMA taxonomy CASCADE;

CREATE TABLE taxonomy.vocabularies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  -- A closed vocabulary rejects terms not already present; an open one permits
  -- governed additions. Neither permits free-text assignment (§45.1.4).
  is_closed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE taxonomy.vocabularies IS 'Registry of controlled vocabularies (§45.1.4).';

CREATE TABLE taxonomy.terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vocabulary_id uuid NOT NULL REFERENCES taxonomy.vocabularies(id) ON DELETE RESTRICT,
  slug          text NOT NULL,
  name          text NOT NULL,
  description   text,
  -- Set when this term has been merged into another; readers follow the pointer.
  merged_into_id uuid REFERENCES taxonomy.terms(id) ON DELETE RESTRICT,
  deprecated_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vocabulary_id, slug),
  CONSTRAINT terms_not_merged_into_self CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE INDEX terms_vocabulary_idx ON taxonomy.terms (vocabulary_id);
CREATE INDEX terms_merged_idx     ON taxonomy.terms (merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX terms_name_trgm_idx  ON taxonomy.terms USING gin (name gin_trgm_ops);

-- Hierarchy as explicit broader/narrower relationships (§45.1.4).
CREATE TABLE taxonomy.term_relationships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broader_id     uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE CASCADE,
  narrower_id    uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broader_id, narrower_id),
  CONSTRAINT term_rel_no_self_loop CHECK (broader_id <> narrower_id)
);

CREATE INDEX term_rel_narrower_idx ON taxonomy.term_relationships (narrower_id);

CREATE TABLE taxonomy.content_terms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL,
  term_id         uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE RESTRICT,
  assigned_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, term_id)
);

CREATE INDEX content_terms_term_idx ON taxonomy.content_terms (term_id);
COMMENT ON COLUMN taxonomy.content_terms.content_item_id IS
  'FK to cms.content_items, added in the cms migration to keep migration order acyclic.';

CREATE TABLE taxonomy.synonyms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id    uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE CASCADE,
  synonym    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, synonym)
);

CREATE INDEX synonyms_lookup_idx ON taxonomy.synonyms (lower(synonym));
COMMENT ON TABLE taxonomy.synonyms IS
  'Synonym resolution layer (§45.1.4). The single synonym store; Block 15 consumes it and creates no other.';

CREATE TABLE taxonomy.external_mappings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id    uuid NOT NULL REFERENCES taxonomy.terms(id) ON DELETE CASCADE,
  scheme     text NOT NULL,
  identifier text NOT NULL,
  uri        text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, scheme, identifier)
);

COMMENT ON TABLE taxonomy.external_mappings IS
  'Mappings to external vocabularies and schemes (§45.1.4).';

-- ---------------------------------------------------------------------------
-- Governance: merge with redirect, and orphan detection (§45.1.4)
-- ---------------------------------------------------------------------------

-- Cycle guard for the hierarchy: a term may not become its own ancestor.
CREATE OR REPLACE FUNCTION private.term_relationship_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  cyclic boolean;
BEGIN
  WITH RECURSIVE ancestors AS (
    SELECT broader_id FROM taxonomy.term_relationships WHERE narrower_id = NEW.broader_id
    UNION
    SELECT tr.broader_id
      FROM taxonomy.term_relationships tr
      JOIN ancestors a ON tr.narrower_id = a.broader_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE broader_id = NEW.narrower_id) INTO cyclic;

  IF cyclic THEN
    RAISE EXCEPTION 'taxonomy hierarchy cycle: % cannot be broader than %',
      NEW.broader_id, NEW.narrower_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER term_relationships_no_cycle
  BEFORE INSERT OR UPDATE ON taxonomy.term_relationships
  FOR EACH ROW EXECUTE FUNCTION private.term_relationship_guard();

-- Orphan terms: no content assignment and no narrower term (§45.1.4).
CREATE OR REPLACE VIEW taxonomy.orphan_terms AS
  SELECT t.id, t.vocabulary_id, t.slug, t.name
    FROM taxonomy.terms t
   WHERE t.merged_into_id IS NULL
     AND t.deprecated_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM taxonomy.content_terms ct WHERE ct.term_id = t.id)
     AND NOT EXISTS (SELECT 1 FROM taxonomy.term_relationships tr WHERE tr.broader_id = t.id);

COMMENT ON VIEW taxonomy.orphan_terms IS
  'Terms with no content assignment and no child term (§45.1.4 orphan detection).';

CREATE TRIGGER vocabularies_updated_at BEFORE UPDATE ON taxonomy.vocabularies
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER terms_updated_at BEFORE UPDATE ON taxonomy.terms
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- RLS on from creation; policies live in the RLS migration (rules/database.md 6).
ALTER TABLE taxonomy.vocabularies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy.terms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy.term_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy.content_terms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy.synonyms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy.external_mappings  ENABLE ROW LEVEL SECURITY;
