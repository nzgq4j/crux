-- Batch A — content metadata the corpus demonstrated is missing.
--
-- This migration is the single freeze lift described in
-- docs/corpus/11-implementation-sequence.md §5. Every change here is justified by a
-- named finding against the fourteen-document validation corpus, and each is additive:
-- no column is dropped, no constraint is loosened, no policy is changed.
--
-- Reverse:
--   ALTER TABLE cms.content_versions
--     DROP COLUMN subtitle,
--     DROP COLUMN stated_date,
--     DROP COLUMN stated_date_precision,
--     DROP COLUMN distribution_marking_key;
--   ALTER TABLE cms.content_contributors
--     DROP CONSTRAINT contributor_is_person_xor_organisation,
--     DROP COLUMN organisation_id,
--     ALTER COLUMN person_id SET NOT NULL;          -- fails if any organisational row exists
--   DROP INDEX cms.content_contributors_org_unique_idx;
--   ALTER TABLE knowledge.claims DROP CONSTRAINT claims_value_requires_unit;
--   DROP TABLE cms.distribution_markings;
--   -- The immutability trigger reverts by re-running the previous definition in
--   -- 20260731000400_cms_content.sql.
-- Reversing after content exists loses the subtitle, marking and stated date of every
-- version that carries one. That is a data-loss reversal, not a clean one, and it is
-- recorded here rather than implied.

-- ---------------------------------------------------------------------------
-- S1 — Subtitle (F1: 14 of 14 documents carry one, and it is not a lede).
-- ---------------------------------------------------------------------------
ALTER TABLE cms.content_versions ADD COLUMN subtitle text;

COMMENT ON COLUMN cms.content_versions.subtitle IS
  'Part of the document''s name, distinct from standfirst, which is a lede (F1). Rendered inside the h1 block and included in citation exports. Nullable: a page or a collection has no natural subtitle.';

-- ---------------------------------------------------------------------------
-- S3 — Stated date and its precision (F4: every corpus date is month precision).
--
-- `published_at` records when the platform published. `stated_date` records the date
-- the document states. They are different facts and the first cannot substitute for
-- the second: the first page published showed "31 July 2026" for an April 2026
-- assessment (docs/corpus/12 §12.6).
-- ---------------------------------------------------------------------------
ALTER TABLE cms.content_versions
  ADD COLUMN stated_date date,
  ADD COLUMN stated_date_precision text
    CHECK (stated_date_precision IN ('day', 'month', 'year')),
  ADD CONSTRAINT stated_date_precision_pair CHECK (
    (stated_date IS NULL) = (stated_date_precision IS NULL)
  );

COMMENT ON COLUMN cms.content_versions.stated_date IS
  'The date the document itself states. Stored as a date; render only to the precision recorded in stated_date_precision, or a day is fabricated (F4).';
COMMENT ON COLUMN cms.content_versions.stated_date_precision IS
  'How much of stated_date the document actually stated. Month for every document in the validation corpus.';

-- ---------------------------------------------------------------------------
-- S2 — Distribution markings (F3: 13 of 14, in five distinct forms).
--
-- A controlled table rather than free text: a marking that can be mistyped is a
-- marking that can be silently weakened, and the observed set is closed and governed
-- by editorial.
--
-- This is metadata and rendering, NOT access control. Nothing in the corpus indicates
-- a marking restricts who may read a document on this platform — these are documents
-- the author intends to publish. No policy references this column, deliberately. If
-- marking-driven access is ever wanted it is a feature with its own denial tests, not
-- a side effect of this column existing (docs/corpus/10 R3).
-- ---------------------------------------------------------------------------
CREATE TABLE cms.distribution_markings (
  key                  text PRIMARY KEY,
  -- Rendered verbatim, including the double slash. The difference between
  -- "FOR OFFICIAL USE ONLY" and "FOR OFFICIAL DISCUSSION" is the author's to make.
  label                text NOT NULL CHECK (length(btrim(label)) > 0),
  description          text NOT NULL,
  -- Whether the marking must repeat in page furniture and in print (F3: two documents
  -- repeat theirs in the footer or on every page).
  repeats_in_furniture boolean NOT NULL DEFAULT true,
  position             integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cms.distribution_markings IS
  'Controlled vocabulary of author-applied distribution markings (F3). Metadata and a rendering obligation; never an access-control input. No RLS policy grants write access — markings are governed by migration.';

ALTER TABLE cms.distribution_markings ENABLE ROW LEVEL SECURITY;

-- Readable by everyone: a marking is rendered on a public page, so withholding the
-- label from an anonymous reader would break the page it belongs on.
CREATE POLICY distribution_markings_read ON cms.distribution_markings
  FOR SELECT USING (true);

-- No insert, update or delete policy. The vocabulary changes by migration, which is
-- the governance this table is for.

-- The grant, which the policy does not imply.
--
-- `GRANT SELECT ON ALL TABLES IN SCHEMA cms ...` in 20260731001100_rls_core.sql applied
-- to the tables that existed then; a table created later inherits nothing from it. A
-- policy without a grant is a table nobody can read, and the failure mode is quiet:
-- the policy looks correct in every review. This is the same class of defect as the
-- missing service_role grants found during the foundation remediation.
GRANT SELECT ON cms.distribution_markings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cms.distribution_markings TO service_role;

ALTER TABLE cms.content_versions
  ADD COLUMN distribution_marking_key text
    REFERENCES cms.distribution_markings(key) ON DELETE RESTRICT;

COMMENT ON COLUMN cms.content_versions.distribution_marking_key IS
  'The marking the author applied, rendered verbatim at the head of the document, in the footer where repeats_in_furniture, and in print. Not an authorization input.';

CREATE INDEX content_versions_marking_idx ON cms.content_versions (distribution_marking_key);

-- The five forms observed across the validation corpus, and nothing else.
INSERT INTO cms.distribution_markings (key, label, description, repeats_in_furniture, position) VALUES
  ('unclassified', 'UNCLASSIFIED',
   'Unclassified with no further distribution restriction stated.', false, 10),
  ('unclassified_fouo', 'UNCLASSIFIED // FOR OFFICIAL USE ONLY',
   'Unclassified, marked for official use only by the author.', true, 20),
  ('unclassified_official_discussion', 'UNCLASSIFIED // FOR OFFICIAL DISCUSSION',
   'Unclassified, marked by the author as for official discussion.', true, 30),
  ('distribution_advertising_industry', 'For Distribution to Advertising Industry Professionals',
   'Author''s stated audience restriction for commercial research.', true, 40),
  ('distribution_adtech_policy', 'For Distribution to Advertising Technology and Policy Professionals',
   'Author''s stated audience restriction for commercial research.', true, 50)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- S4 — Organisational authorship (F5: 13 of 14 documents name no individual).
--
-- The alternatives were to leave thirteen documents unattributed — which is false,
-- they are attributed, just not to a person — or to invent people, which
-- rules/content-modeling.md 24 forbids outright.
--
-- person_id loses NOT NULL, and an XOR check takes its place, so a contributor row is
-- never less attributed than before: exactly one of the two is always present.
-- ---------------------------------------------------------------------------
ALTER TABLE cms.content_contributors
  ALTER COLUMN person_id DROP NOT NULL,
  ADD COLUMN organisation_id uuid REFERENCES identity.organisations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT contributor_is_person_xor_organisation CHECK (
    (person_id IS NULL) <> (organisation_id IS NULL)
  );

COMMENT ON COLUMN cms.content_contributors.organisation_id IS
  'The organisation credited where no individual is named (F5). Exactly one of person_id and organisation_id is set.';

CREATE INDEX content_contributors_org_idx ON cms.content_contributors (organisation_id);

-- The existing UNIQUE (version_id, person_id, role) does not constrain organisational
-- rows, because NULL person_id makes every such row distinct. This restores the
-- intent for the organisational case.
CREATE UNIQUE INDEX content_contributors_org_unique_idx
  ON cms.content_contributors (version_id, organisation_id, role)
  WHERE organisation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- S6 — A numeric claim must carry a unit (F24).
--
-- `claims_quantitative_requires_measurement` already requires a unit for a
-- quantitative_finding. Cited figures are observed_facts (docs/corpus/02 T1), and
-- nothing required a unit for those. A value of 39254 with no unit is not a fact.
-- ---------------------------------------------------------------------------
ALTER TABLE knowledge.claims ADD CONSTRAINT claims_value_requires_unit CHECK (
  value IS NULL OR (unit IS NOT NULL AND length(btrim(unit)) > 0)
);

-- ---------------------------------------------------------------------------
-- Immutability must cover the new columns.
--
-- This is the part of Batch A that is easy to forget and expensive to miss: a
-- published version's subtitle, stated date and marking are part of what was
-- published. Without this the trigger would let all three change after publication
-- while continuing to refuse a title change, which is a worse failure than having no
-- trigger, because it looks protected.
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
    OR NEW.subtitle           IS DISTINCT FROM OLD.subtitle
    OR NEW.standfirst         IS DISTINCT FROM OLD.standfirst
    OR NEW.executive_summary  IS DISTINCT FROM OLD.executive_summary
    OR NEW.methodology        IS DISTINCT FROM OLD.methodology
    OR NEW.limitations        IS DISTINCT FROM OLD.limitations
    OR NEW.plain_text         IS DISTINCT FROM OLD.plain_text
    OR NEW.markdown           IS DISTINCT FROM OLD.markdown
    OR NEW.published_at       IS DISTINCT FROM OLD.published_at
    OR NEW.stated_date        IS DISTINCT FROM OLD.stated_date
    OR NEW.stated_date_precision IS DISTINCT FROM OLD.stated_date_precision
    OR NEW.distribution_marking_key IS DISTINCT FROM OLD.distribution_marking_key
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
