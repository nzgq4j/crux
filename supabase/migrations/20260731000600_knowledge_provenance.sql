-- Block 16 — Claims and provenance (§45.1.7, §45.3.5)
-- The evidence layer: classified claims, sources, datasets, analysis methods and
-- figure provenance, so every quantitative finding Crux publishes is traceable to
-- the data and the method that produced it.
--
-- Nine tables exactly, all in the `knowledge` schema (created in Block 04):
--   claims, sources, claim_sources, datasets, dataset_versions, dataset_variables,
--   analysis_methods, analysis_runs, figure_provenance.
--
-- Reverse procedure (destructive; never run against production):
--   DROP VIEW  IF EXISTS knowledge.contradicted_claims;
--   DROP TABLE IF EXISTS knowledge.figure_provenance, knowledge.claim_sources,
--                        knowledge.claims, knowledge.analysis_runs,
--                        knowledge.analysis_methods, knowledge.dataset_variables,
--                        knowledge.dataset_versions, knowledge.datasets,
--                        knowledge.sources CASCADE;
--   DROP FUNCTION IF EXISTS private.claim_traceability_ok(uuid),
--                           private.figure_provenance_ok(uuid),
--                           private.evidence_standard_ok(uuid),
--                           private.dataset_version_is_locked(uuid),
--                           private.enforce_dataset_version_immutability(),
--                           private.enforce_dataset_variable_immutability(),
--                           private.validate_analysis_run_inputs(),
--                           private.validate_figure_provenance_refs();
-- The `knowledge` schema itself is owned by Block 04 and is not dropped here.

-- ---------------------------------------------------------------------------
-- knowledge.sources — bibliographic records (§45.1.7).
-- Deduplicated on the normalised external identifier and on the normalised
-- title/publisher/date triple, both computed as generated columns so the dedup
-- key cannot drift from the displayed values.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type         text NOT NULL DEFAULT 'other'
    CHECK (source_type IN ('journal_article', 'book', 'chapter', 'report', 'dataset',
                           'working_paper', 'standard', 'legislation', 'press_release',
                           'news_article', 'web_page', 'interview', 'internal_analysis',
                           'other')),
  -- Internal sources are Crux's own outputs; external ones are third-party.
  origin              text NOT NULL DEFAULT 'external'
    CHECK (origin IN ('external', 'internal')),
  title               text NOT NULL CHECK (length(btrim(title)) > 0),
  -- Authors as ordered display strings. Where an author is a known person, the
  -- link is made through identity.external_identifiers, not duplicated here.
  authors             text[] NOT NULL DEFAULT '{}',
  publisher           text,
  publication_date    date,
  -- Retrieval date, mandatory for anything reached over the network (§45.1.7).
  access_date         date,
  url                 text,
  identifier_scheme   text CHECK (identifier_scheme IN ('doi', 'isbn', 'issn', 'pmid',
                                                        'arxiv', 'handle', 'urn', 'oclc')),
  identifier_value    text,
  -- Editorial assessment of the source, recorded rather than implied.
  credibility         text NOT NULL DEFAULT 'unassessed'
    CHECK (credibility IN ('unassessed', 'authoritative', 'reliable', 'mixed', 'contested', 'unreliable')),
  credibility_notes   text,
  is_peer_reviewed    boolean NOT NULL DEFAULT false,
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Deduplication keys. Punctuation, case and spacing are not distinguishing.
  normalised_identifier text GENERATED ALWAYS AS (
    NULLIF(lower(regexp_replace(coalesce(identifier_value, ''), '[^a-zA-Z0-9]', '', 'g')), '')
  ) STORED,
  normalised_title text GENERATED ALWAYS AS (
    btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g'))
  ) STORED,
  -- Publishers are routinely written as acronyms with or without stops, so all
  -- punctuation and spacing is removed rather than word-separated: ONS = O.N.S.
  normalised_publisher text GENERATED ALWAYS AS (
    NULLIF(lower(regexp_replace(coalesce(publisher, ''), '[^a-zA-Z0-9]', '', 'g')), '')
  ) STORED,
  CONSTRAINT sources_identifier_pair CHECK (
    (identifier_scheme IS NULL) = (identifier_value IS NULL)
  ),
  CONSTRAINT sources_url_requires_access_date CHECK (
    url IS NULL OR access_date IS NOT NULL
  ),
  CONSTRAINT sources_credibility_notes_when_doubted CHECK (
    credibility NOT IN ('mixed', 'contested', 'unreliable') OR credibility_notes IS NOT NULL
  ),
  -- Title-level dedup. NULLS NOT DISTINCT so two untitled-publisher rows with the
  -- same title and date collide rather than silently duplicating.
  CONSTRAINT sources_dedup_title UNIQUE NULLS NOT DISTINCT
    (normalised_title, normalised_publisher, publication_date)
);

COMMENT ON TABLE knowledge.sources IS
  'Bibliographic records for external and internal sources (§45.1.7). Exists independently of content; readable by editorial roles before publication.';
COMMENT ON COLUMN knowledge.sources.normalised_identifier IS
  'Generated dedup key: the external identifier stripped of case and punctuation. Unique per scheme.';
COMMENT ON COLUMN knowledge.sources.credibility IS
  'Editorial credibility assessment, conveyed as text wherever rendered (never colour alone).';

-- Identifier-level dedup: one row per real-world identifier.
CREATE UNIQUE INDEX sources_dedup_identifier_idx
  ON knowledge.sources (identifier_scheme, normalised_identifier)
  WHERE normalised_identifier IS NOT NULL;

CREATE INDEX sources_title_trgm_idx    ON knowledge.sources USING gin (title gin_trgm_ops);
CREATE INDEX sources_type_idx          ON knowledge.sources (source_type);
CREATE INDEX sources_created_by_idx    ON knowledge.sources (created_by);
CREATE INDEX sources_publication_idx   ON knowledge.sources (publication_date DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- knowledge.datasets — the dataset record, independent of any content.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.datasets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  description           text NOT NULL,
  custodian             text NOT NULL,
  custodian_org_id      uuid REFERENCES identity.organisations(id) ON DELETE SET NULL,
  -- The dataset's own bibliographic record, where it has one.
  source_id             uuid REFERENCES knowledge.sources(id) ON DELETE SET NULL,
  licence               text NOT NULL,
  licence_url           text,
  coverage_description  text,
  coverage_geography    text,
  coverage_start        date,
  coverage_end          date,
  -- §45.1.7 security: restricted contents are not readable by unauthorised users,
  -- though the dataset's existence may still be advertised.
  access_classification text NOT NULL DEFAULT 'internal'
    CHECK (access_classification IN ('public', 'registered', 'internal', 'restricted')),
  existence_is_public   boolean NOT NULL DEFAULT true,
  access_notes          text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT datasets_coverage_ordered CHECK (
    coverage_start IS NULL OR coverage_end IS NULL OR coverage_end >= coverage_start
  ),
  CONSTRAINT datasets_restricted_needs_notes CHECK (
    access_classification <> 'restricted' OR access_notes IS NOT NULL
  )
);

COMMENT ON TABLE knowledge.datasets IS
  'Dataset records: custodian, licence, coverage and access classification (§45.1.7). Access classification governs who may read the version files and variable dictionary.';
COMMENT ON COLUMN knowledge.datasets.existence_is_public IS
  'A restricted dataset may still be advertised by name. False hides the record entirely from non-privileged roles.';

CREATE INDEX datasets_custodian_org_idx ON knowledge.datasets (custodian_org_id);
CREATE INDEX datasets_source_idx        ON knowledge.datasets (source_id);
CREATE INDEX datasets_created_by_idx    ON knowledge.datasets (created_by);
CREATE INDEX datasets_access_idx        ON knowledge.datasets (access_classification);

-- ---------------------------------------------------------------------------
-- knowledge.dataset_versions — one immutable row per dataset release.
-- Immutability is conditional on publication and enforced by trigger below.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.dataset_versions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id              uuid NOT NULL REFERENCES knowledge.datasets(id) ON DELETE RESTRICT,
  version_label           text NOT NULL,
  released_at             date,
  checksum                text NOT NULL CHECK (length(btrim(checksum)) > 0),
  checksum_algorithm      text NOT NULL DEFAULT 'sha256'
    CHECK (checksum_algorithm IN ('sha256', 'sha512', 'blake2b')),
  row_count               bigint CHECK (row_count IS NULL OR row_count >= 0),
  collection_period_start date,
  collection_period_end   date,
  -- The Block 13 asset version holding the file. The FK is added by the assets
  -- migration to keep migration order acyclic (same pattern as taxonomy.content_terms).
  asset_version_id        uuid,
  notes                   text,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version_label),
  CONSTRAINT dataset_versions_period_ordered CHECK (
    collection_period_start IS NULL OR collection_period_end IS NULL
    OR collection_period_end >= collection_period_start
  )
);

COMMENT ON TABLE knowledge.dataset_versions IS
  'An immutable release of a dataset (§45.1.7): checksum, row count, collection period and the asset version holding the file. Frozen once referenced by a published content version.';
COMMENT ON COLUMN knowledge.dataset_versions.asset_version_id IS
  'FK to the Block 13 asset version, added in the assets migration to keep migration order acyclic.';

CREATE INDEX dataset_versions_dataset_idx    ON knowledge.dataset_versions (dataset_id, released_at DESC NULLS LAST);
CREATE INDEX dataset_versions_asset_idx      ON knowledge.dataset_versions (asset_version_id);
CREATE INDEX dataset_versions_created_by_idx ON knowledge.dataset_versions (created_by);
CREATE INDEX dataset_versions_checksum_idx   ON knowledge.dataset_versions (checksum);

-- ---------------------------------------------------------------------------
-- knowledge.dataset_variables — the variable dictionary for a dataset version.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.dataset_variables (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES knowledge.dataset_versions(id) ON DELETE CASCADE,
  name               text NOT NULL,
  label              text NOT NULL,
  data_type          text NOT NULL
    CHECK (data_type IN ('integer', 'decimal', 'boolean', 'date', 'datetime',
                         'text', 'categorical', 'ordinal', 'geography', 'identifier')),
  unit               text,
  -- Permitted values for categorical and ordinal variables, as an ordered array
  -- of {value, label} objects.
  permitted_values   jsonb NOT NULL DEFAULT '[]'::jsonb,
  definition         text NOT NULL,
  missing_value_code text,
  is_derived         boolean NOT NULL DEFAULT false,
  derivation         text,
  position           integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_version_id, name),
  CONSTRAINT dataset_variables_permitted_values_array CHECK (
    jsonb_typeof(permitted_values) = 'array'
  ),
  CONSTRAINT dataset_variables_categorical_has_values CHECK (
    data_type NOT IN ('categorical', 'ordinal') OR jsonb_array_length(permitted_values) > 0
  ),
  CONSTRAINT dataset_variables_derived_has_derivation CHECK (
    NOT is_derived OR derivation IS NOT NULL
  )
);

COMMENT ON TABLE knowledge.dataset_variables IS
  'Variable dictionary per dataset version (§45.1.7): name, label, type, unit, permitted values and definition. Inherits the dataset''s access classification.';

CREATE INDEX dataset_variables_version_idx ON knowledge.dataset_variables (dataset_version_id, position);

-- ---------------------------------------------------------------------------
-- knowledge.analysis_methods — reusable method definitions.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.analysis_methods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  description       text NOT NULL,
  category          text NOT NULL DEFAULT 'other'
    CHECK (category IN ('descriptive', 'statistical', 'econometric', 'qualitative',
                        'simulation', 'index_construction', 'forecasting', 'other')),
  -- Stated premises the method depends on, and where it must not be applied.
  assumptions       text NOT NULL,
  limitations       text NOT NULL,
  -- JSON Schema describing the parameters an analysis run must supply.
  parameters_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_url     text,
  source_id         uuid REFERENCES knowledge.sources(id) ON DELETE SET NULL,
  retired_at        timestamptz,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_methods_schema_is_object CHECK (
    jsonb_typeof(parameters_schema) = 'object'
  )
);

COMMENT ON TABLE knowledge.analysis_methods IS
  'Reusable method definitions (§45.1.7): description, assumptions, parameters and limitations. Assumptions and limitations are mandatory, not optional prose.';

CREATE INDEX analysis_methods_source_idx     ON knowledge.analysis_methods (source_id);
CREATE INDEX analysis_methods_created_by_idx ON knowledge.analysis_methods (created_by);
CREATE INDEX analysis_methods_category_idx   ON knowledge.analysis_methods (category)
  WHERE retired_at IS NULL;

-- ---------------------------------------------------------------------------
-- knowledge.analysis_runs — one execution of a method over dataset versions.
-- The dataset-version set is an array rather than a junction table because the
-- nine-table list for this block is exact; referential integrity for the array
-- is enforced by trigger (validate_analysis_run_inputs) and by the delete guard
-- on knowledge.dataset_versions.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.analysis_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id             text NOT NULL UNIQUE DEFAULT ('run-' || encode(gen_random_bytes(6), 'hex')),
  method_id             uuid NOT NULL REFERENCES knowledge.analysis_methods(id) ON DELETE RESTRICT,
  dataset_version_ids   uuid[] NOT NULL,
  parameters            jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at                timestamptz NOT NULL DEFAULT now(),
  executed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Retained so the run remains attributable if the account is later removed.
  executed_by_label     text,
  output_summary        text NOT NULL CHECK (length(btrim(output_summary)) > 0),
  output_values         jsonb NOT NULL DEFAULT '{}'::jsonb,
  software_environment  text,
  code_reference        text,
  -- Where exact reproduction is not possible, the limitation is recorded rather
  -- than left implicit (§45.1.7 technical requirements).
  is_reproducible       boolean NOT NULL DEFAULT true,
  reproducibility_notes text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_runs_has_inputs CHECK (cardinality(dataset_version_ids) > 0),
  CONSTRAINT analysis_runs_parameters_object CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT analysis_runs_irreproducible_explained CHECK (
    is_reproducible OR reproducibility_notes IS NOT NULL
  ),
  -- §45.1.7 security: a run record must never embed credentials or a connection
  -- string. Deterministic pattern match over the free-form fields.
  CONSTRAINT analysis_runs_no_credentials CHECK (
    (parameters::text || ' ' || coalesce(software_environment, '') || ' ' || coalesce(code_reference, ''))
      !~* '(password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|connection[_-]?string|postgres(ql)?://|mysql://|mongodb(\+srv)?://)'
  )
);

COMMENT ON TABLE knowledge.analysis_runs IS
  'Execution record binding a method to specific dataset versions with specific parameters (§45.1.7). Records run time, executing actor, output summary and reproducibility limitations.';
COMMENT ON COLUMN knowledge.analysis_runs.dataset_version_ids IS
  'Input dataset versions. Element integrity is enforced by private.validate_analysis_run_inputs() and by the delete guard on knowledge.dataset_versions.';

CREATE INDEX analysis_runs_method_idx    ON knowledge.analysis_runs (method_id, run_at DESC);
CREATE INDEX analysis_runs_actor_idx     ON knowledge.analysis_runs (executed_by);
CREATE INDEX analysis_runs_datasets_idx  ON knowledge.analysis_runs USING gin (dataset_version_ids);
CREATE INDEX analysis_runs_run_at_idx    ON knowledge.analysis_runs (run_at DESC);

-- ---------------------------------------------------------------------------
-- knowledge.claims — the classified claim record (§45.1.7).
--
-- Nine storage claim types; the five §45 evidence classes are DERIVED from them
-- by the generated column `evidence_class`, so the coarse public classification
-- can never disagree with the stored type.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.claims (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id             text NOT NULL UNIQUE DEFAULT ('claim-' || encode(gen_random_bytes(6), 'hex')),
  version_id            uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  -- The module the claim appears in. NULL means the claim sits in version-level
  -- prose (standfirst, summary) rather than a module.
  fragment_id           text,
  claim_type            text NOT NULL CHECK (claim_type IN (
                          'observed_fact', 'derived_finding', 'quantitative_finding',
                          'interpretation', 'forecast', 'recommendation',
                          'assumption', 'opinion', 'definition')),
  -- §45.1.7: the five evidence classes, derived not stored twice.
  evidence_class        text GENERATED ALWAYS AS (
                          CASE claim_type
                            WHEN 'observed_fact'        THEN 'observed'
                            WHEN 'definition'           THEN 'observed'
                            WHEN 'derived_finding'      THEN 'derived'
                            WHEN 'quantitative_finding' THEN 'derived'
                            WHEN 'interpretation'       THEN 'interpretive'
                            WHEN 'assumption'           THEN 'interpretive'
                            WHEN 'opinion'              THEN 'interpretive'
                            WHEN 'forecast'             THEN 'forecast'
                            WHEN 'recommendation'       THEN 'recommendation'
                          END
                        ) STORED,
  assertion             text NOT NULL CHECK (length(btrim(assertion)) > 0),
  confidence            text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high')),
  confidence_rationale  text,
  -- Scope of the claim.
  population            text,
  period_start          date,
  period_end            date,
  period_label          text,
  -- Quantitative payload.
  value                 numeric,
  value_upper           numeric,
  value_lower           numeric,
  unit                  text,
  -- Provenance links.
  analysis_run_id       uuid REFERENCES knowledge.analysis_runs(id) ON DELETE RESTRICT,
  -- The finding an interpretation reads, or the finding a recommendation rests on.
  basis_claim_id        uuid REFERENCES knowledge.claims(id) ON DELETE RESTRICT,
  -- Forecast fields.
  forecast_method_id    uuid REFERENCES knowledge.analysis_methods(id) ON DELETE RESTRICT,
  forecast_horizon      text,
  uncertainty_statement text,
  -- Opinion attribution.
  attributed_person_id  uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  attributed_label      text,
  -- Assumption labelling and definition provenance.
  is_unverified         boolean NOT NULL DEFAULT false,
  is_platform_definition boolean NOT NULL DEFAULT false,
  review_state          text NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'accepted', 'flagged', 'rejected')),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- The fragment must be a real module of the same version. MATCH SIMPLE: the
  -- constraint is not applied when fragment_id is NULL (version-level claims).
  CONSTRAINT claims_fragment_fk FOREIGN KEY (version_id, fragment_id)
    REFERENCES cms.content_version_modules (version_id, fragment_id)
    ON UPDATE CASCADE ON DELETE SET NULL (fragment_id),

  CONSTRAINT claims_period_ordered CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  ),
  CONSTRAINT claims_interval_ordered CHECK (
    value_lower IS NULL OR value_upper IS NULL OR value_upper >= value_lower
  ),
  CONSTRAINT claims_no_self_basis CHECK (basis_claim_id IS NULL OR basis_claim_id <> id),
  CONSTRAINT claims_evidence_class_known CHECK (
    evidence_class IN ('observed', 'derived', 'interpretive', 'forecast', 'recommendation')
  ),

  -- Per-type requirements (§45.1.7). Enforced, not advisory.
  CONSTRAINT claims_quantitative_requires_measurement CHECK (
    claim_type <> 'quantitative_finding' OR (
      value IS NOT NULL
      AND unit IS NOT NULL AND length(btrim(unit)) > 0
      AND period_start IS NOT NULL AND period_end IS NOT NULL
      AND analysis_run_id IS NOT NULL
    )
  ),
  CONSTRAINT claims_derived_requires_run CHECK (
    claim_type <> 'derived_finding' OR analysis_run_id IS NOT NULL
  ),
  CONSTRAINT claims_forecast_requires_horizon_and_uncertainty CHECK (
    claim_type <> 'forecast' OR (
      forecast_horizon IS NOT NULL AND length(btrim(forecast_horizon)) > 0
      AND uncertainty_statement IS NOT NULL AND length(btrim(uncertainty_statement)) > 0
    )
  ),
  CONSTRAINT claims_opinion_requires_attribution CHECK (
    claim_type <> 'opinion' OR (
      attributed_person_id IS NOT NULL
      OR (attributed_label IS NOT NULL AND length(btrim(attributed_label)) > 0)
    )
  ),
  CONSTRAINT claims_interpretation_requires_basis CHECK (
    claim_type <> 'interpretation' OR basis_claim_id IS NOT NULL
  ),
  CONSTRAINT claims_recommendation_requires_basis CHECK (
    claim_type <> 'recommendation' OR basis_claim_id IS NOT NULL
  ),
  CONSTRAINT claims_assumption_is_labelled_unverified CHECK (
    claim_type <> 'assumption' OR is_unverified
  ),
  -- A definition either carries a source (checked by the traceability function,
  -- which can see across tables) or declares itself the platform's own.
  CONSTRAINT claims_platform_definition_only_on_definitions CHECK (
    NOT is_platform_definition OR claim_type = 'definition'
  )
);

COMMENT ON TABLE knowledge.claims IS
  'Classified claims attached to a content version and, where applicable, a module fragment (§45.1.7). Nine storage types; the five §45 evidence classes derive from them via the generated evidence_class column.';
COMMENT ON COLUMN knowledge.claims.evidence_class IS
  '§45.1.7 coarse public classification, GENERATED ALWAYS from claim_type: observed <- observed_fact|definition; derived <- derived_finding|quantitative_finding; interpretive <- interpretation|assumption|opinion; forecast <- forecast; recommendation <- recommendation. The two cannot drift.';
COMMENT ON COLUMN knowledge.claims.fragment_id IS
  'The cms.content_version_modules fragment the claim appears in. NULL for a claim in version-level prose.';
COMMENT ON COLUMN knowledge.claims.basis_claim_id IS
  'The finding an interpretation reads, or that a recommendation rests on. RESTRICT: a claim supporting another cannot be deleted out from under it.';

CREATE INDEX claims_version_idx        ON knowledge.claims (version_id);
CREATE INDEX claims_fragment_idx       ON knowledge.claims (version_id, fragment_id);
CREATE INDEX claims_type_idx           ON knowledge.claims (claim_type);
CREATE INDEX claims_evidence_class_idx ON knowledge.claims (evidence_class);
CREATE INDEX claims_run_idx            ON knowledge.claims (analysis_run_id);
CREATE INDEX claims_basis_idx          ON knowledge.claims (basis_claim_id);
CREATE INDEX claims_forecast_method_idx ON knowledge.claims (forecast_method_id);
CREATE INDEX claims_attributed_idx     ON knowledge.claims (attributed_person_id);
CREATE INDEX claims_created_by_idx     ON knowledge.claims (created_by);
-- Access path for the Block 09 evidence review and the Block 08 gate: the
-- high-confidence claims of a version, which must resolve to evidence.
CREATE INDEX claims_high_confidence_idx ON knowledge.claims (version_id)
  WHERE confidence = 'high';
CREATE INDEX claims_review_state_idx   ON knowledge.claims (review_state)
  WHERE review_state IN ('pending', 'flagged');

-- ---------------------------------------------------------------------------
-- knowledge.claim_sources — the support relationship (§45.1.7).
-- Contradictions are recorded, never omitted.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.claim_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       uuid NOT NULL REFERENCES knowledge.claims(id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES knowledge.sources(id) ON DELETE RESTRICT,
  relationship   text NOT NULL CHECK (relationship IN
                   ('supports', 'partially_supports', 'contradicts', 'provides_context')),
  -- Where inside the source: page, section, table, figure, timestamp.
  location       text,
  location_type  text CHECK (location_type IN ('page', 'page_range', 'section', 'table',
                                               'figure', 'paragraph', 'timestamp', 'other')),
  quotation      text,
  note           text,
  -- Set when a partially-supporting or contradicting relationship has been
  -- reviewed and consciously retained.
  reviewed_at    timestamptz,
  reviewed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, source_id, relationship),
  CONSTRAINT claim_sources_location_pair CHECK (
    (location IS NULL) = (location_type IS NULL)
  ),
  CONSTRAINT claim_sources_divergence_explained CHECK (
    relationship NOT IN ('contradicts', 'partially_supports') OR note IS NOT NULL
  )
);

COMMENT ON TABLE knowledge.claim_sources IS
  'Claim-to-source link recording the location within the source and the support relationship (§45.1.7). Contradicting sources are recorded rather than omitted and surfaced in the Block 09 evidence review.';

CREATE INDEX claim_sources_source_idx     ON knowledge.claim_sources (source_id);
CREATE INDEX claim_sources_reviewed_by_idx ON knowledge.claim_sources (reviewed_by);
CREATE INDEX claim_sources_created_by_idx ON knowledge.claim_sources (created_by);
-- Access path: the supporting-evidence test run by the publication gate.
CREATE INDEX claim_sources_supporting_idx ON knowledge.claim_sources (claim_id)
  WHERE relationship IN ('supports', 'partially_supports');
-- Access path: the contradiction surface in the Block 09 evidence review.
CREATE INDEX claim_sources_contradicts_idx ON knowledge.claim_sources (claim_id)
  WHERE relationship = 'contradicts';

-- ---------------------------------------------------------------------------
-- knowledge.figure_provenance — §45.3.5. Every published figure has a traceable
-- origin: a data figure through its analysis run and dataset versions, a
-- non-data figure through its Block 13 asset origin record.
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge.figure_provenance (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id           uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  fragment_id          text NOT NULL,
  figure_kind          text NOT NULL CHECK (figure_kind IN ('data', 'illustrative')),
  analysis_run_id      uuid REFERENCES knowledge.analysis_runs(id) ON DELETE RESTRICT,
  dataset_version_ids  uuid[] NOT NULL DEFAULT '{}',
  dataset_variable_ids uuid[] NOT NULL DEFAULT '{}',
  -- Block 13 asset carrying the uploading actor, licence and attribution. The FK
  -- is added by the assets migration to keep migration order acyclic.
  asset_id             uuid,
  caption              text,
  -- Recorded where the figure aggregates a restricted dataset: the metadata must
  -- not disclose the restricted contents (§45.1.7 security).
  discloses_restricted boolean NOT NULL DEFAULT false,
  aggregation_note     text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, fragment_id),
  CONSTRAINT figure_provenance_fragment_fk FOREIGN KEY (version_id, fragment_id)
    REFERENCES cms.content_version_modules (version_id, fragment_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT figure_provenance_data_is_traceable CHECK (
    figure_kind <> 'data' OR (
      analysis_run_id IS NOT NULL AND cardinality(dataset_version_ids) > 0
    )
  ),
  CONSTRAINT figure_provenance_illustrative_has_asset CHECK (
    figure_kind <> 'illustrative' OR asset_id IS NOT NULL
  ),
  CONSTRAINT figure_provenance_variables_need_versions CHECK (
    cardinality(dataset_variable_ids) = 0 OR cardinality(dataset_version_ids) > 0
  )
);

COMMENT ON TABLE knowledge.figure_provenance IS
  'Links a figure in a content version to the analysis run, dataset versions and variables that produced it (§45.3.5). A non-data figure is traced instead through its Block 13 asset origin record; a figure with neither is not publishable.';
COMMENT ON COLUMN knowledge.figure_provenance.asset_id IS
  'FK to the Block 13 asset, added in the assets migration to keep migration order acyclic.';

CREATE INDEX figure_provenance_version_idx   ON knowledge.figure_provenance (version_id);
CREATE INDEX figure_provenance_run_idx       ON knowledge.figure_provenance (analysis_run_id);
CREATE INDEX figure_provenance_asset_idx     ON knowledge.figure_provenance (asset_id);
CREATE INDEX figure_provenance_created_by_idx ON knowledge.figure_provenance (created_by);
CREATE INDEX figure_provenance_datasets_idx  ON knowledge.figure_provenance USING gin (dataset_version_ids);
CREATE INDEX figure_provenance_variables_idx ON knowledge.figure_provenance USING gin (dataset_variable_ids);

-- ---------------------------------------------------------------------------
-- Referential integrity for the uuid[] input sets. These stand in for the
-- foreign keys a junction table would carry; the block's table list is exact.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.validate_analysis_run_inputs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  missing uuid;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM unnest(NEW.dataset_version_ids) AS t(id)
     GROUP BY t.id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'analysis run % lists a dataset version more than once', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.id INTO missing
    FROM unnest(NEW.dataset_version_ids) AS t(id)
   WHERE NOT EXISTS (SELECT 1 FROM knowledge.dataset_versions dv WHERE dv.id = t.id)
   LIMIT 1;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'analysis run references unknown dataset version %', missing
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.validate_analysis_run_inputs() IS
  'BEFORE INSERT/UPDATE on knowledge.analysis_runs. Sole responsibility: referential integrity of the dataset_version_ids array. Deterministic; no external calls.';

CREATE TRIGGER analysis_runs_validate_inputs
  BEFORE INSERT OR UPDATE OF dataset_version_ids ON knowledge.analysis_runs
  FOR EACH ROW EXECUTE FUNCTION private.validate_analysis_run_inputs();

CREATE OR REPLACE FUNCTION private.validate_figure_provenance_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  missing uuid;
BEGIN
  SELECT t.id INTO missing
    FROM unnest(NEW.dataset_version_ids) AS t(id)
   WHERE NOT EXISTS (SELECT 1 FROM knowledge.dataset_versions dv WHERE dv.id = t.id)
   LIMIT 1;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'figure provenance references unknown dataset version %', missing
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- A cited variable must belong to one of the cited dataset versions, so the
  -- provenance chain resolves end to end.
  SELECT t.id INTO missing
    FROM unnest(NEW.dataset_variable_ids) AS t(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM knowledge.dataset_variables dv
      WHERE dv.id = t.id
        AND dv.dataset_version_id = ANY (NEW.dataset_version_ids)
   )
   LIMIT 1;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'figure provenance variable % does not belong to a cited dataset version', missing
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- The run's inputs must cover the dataset versions the figure claims.
  IF NEW.analysis_run_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM unnest(NEW.dataset_version_ids) AS t(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM knowledge.analysis_runs ar
        WHERE ar.id = NEW.analysis_run_id AND t.id = ANY (ar.dataset_version_ids)
     )
  ) THEN
    RAISE EXCEPTION 'figure provenance cites a dataset version that analysis run % did not consume',
      NEW.analysis_run_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.validate_figure_provenance_refs() IS
  'BEFORE INSERT/UPDATE on knowledge.figure_provenance. Sole responsibility: the dataset version and variable arrays resolve, and agree with the analysis run. Deterministic; no external calls.';

CREATE TRIGGER figure_provenance_validate_refs
  BEFORE INSERT OR UPDATE ON knowledge.figure_provenance
  FOR EACH ROW EXECUTE FUNCTION private.validate_figure_provenance_refs();

-- ---------------------------------------------------------------------------
-- DATASET VERSION IMMUTABILITY (§45.1.7). A dataset version referenced by a
-- published content version is frozen — the evidence behind published content
-- cannot be rewritten. Enforced by trigger; convention is not enforcement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.dataset_version_is_locked(p_dataset_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Superseded and withdrawn versions count: they were published, and the
  -- evidence record must survive withdrawal (§45.1.7 data requirements).
  SELECT EXISTS (
    SELECT 1
      FROM knowledge.figure_provenance fp
      JOIN cms.content_versions cv ON cv.id = fp.version_id
     WHERE p_dataset_version_id = ANY (fp.dataset_version_ids)
       AND cv.status IN ('published', 'superseded', 'withdrawn')
  )
  OR EXISTS (
    SELECT 1
      FROM knowledge.analysis_runs ar
      JOIN knowledge.claims c        ON c.analysis_run_id = ar.id
      JOIN cms.content_versions cv   ON cv.id = c.version_id
     WHERE p_dataset_version_id = ANY (ar.dataset_version_ids)
       AND cv.status IN ('published', 'superseded', 'withdrawn')
  )
  OR EXISTS (
    SELECT 1
      FROM knowledge.analysis_runs ar
      JOIN knowledge.figure_provenance fp ON fp.analysis_run_id = ar.id
      JOIN cms.content_versions cv        ON cv.id = fp.version_id
     WHERE p_dataset_version_id = ANY (ar.dataset_version_ids)
       AND cv.status IN ('published', 'superseded', 'withdrawn')
  );
$$;

COMMENT ON FUNCTION private.dataset_version_is_locked(uuid) IS
  'True once a dataset version is reachable from a published (or once-published) content version, through a figure''s provenance or through a claim''s analysis run. SECURITY DEFINER: the immutability trigger must see every referencing row regardless of the caller''s RLS visibility.';

CREATE OR REPLACE FUNCTION private.enforce_dataset_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF private.dataset_version_is_locked(OLD.id) THEN
      RAISE EXCEPTION 'dataset version % is referenced by published content: DELETE is not permitted', OLD.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Stands in for the ON DELETE RESTRICT that a junction table would give the
    -- dataset_version_ids arrays.
    IF EXISTS (SELECT 1 FROM knowledge.analysis_runs ar WHERE OLD.id = ANY (ar.dataset_version_ids))
    OR EXISTS (SELECT 1 FROM knowledge.figure_provenance fp WHERE OLD.id = ANY (fp.dataset_version_ids)) THEN
      RAISE EXCEPTION 'dataset version % is referenced by an analysis run or figure provenance record', OLD.id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF private.dataset_version_is_locked(OLD.id) THEN
    RAISE EXCEPTION 'dataset version % is referenced by published content and is immutable', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_dataset_version_immutability() IS
  'BEFORE UPDATE/DELETE on knowledge.dataset_versions. Sole responsibility: freeze a version once published content depends on it, and refuse deletion while any run or figure cites it.';

CREATE TRIGGER dataset_versions_immutable
  BEFORE UPDATE OR DELETE ON knowledge.dataset_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_dataset_version_immutability();

-- The variable dictionary is part of the version, so it freezes with it.
CREATE OR REPLACE FUNCTION private.enforce_dataset_variable_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version uuid := COALESCE(NEW.dataset_version_id, OLD.dataset_version_id);
BEGIN
  -- A cascade from a permitted dataset_version DELETE has already passed the
  -- version-level guard, so only direct mutation reaches this check.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM knowledge.dataset_versions dv WHERE dv.id = v_version) THEN
    RETURN OLD;
  END IF;

  IF private.dataset_version_is_locked(v_version) THEN
    RAISE EXCEPTION 'dataset version % is referenced by published content: its variables are immutable (%)',
      v_version, TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM knowledge.figure_provenance fp WHERE OLD.id = ANY (fp.dataset_variable_ids)
  ) THEN
    RAISE EXCEPTION 'dataset variable % is cited by a figure provenance record', OLD.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION private.enforce_dataset_variable_immutability() IS
  'BEFORE INSERT/UPDATE/DELETE on knowledge.dataset_variables. Sole responsibility: the variable dictionary of a published-referenced dataset version cannot change, and a cited variable cannot be deleted.';

CREATE TRIGGER dataset_variables_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON knowledge.dataset_variables
  FOR EACH ROW EXECUTE FUNCTION private.enforce_dataset_variable_immutability();

-- ---------------------------------------------------------------------------
-- VALIDATION FUNCTIONS consumed by the Block 08 publication gate.
-- All are read-only, deterministic for a given database state, and make no
-- external calls. SECURITY DEFINER because the gate must see every claim,
-- source and run attached to the version, not only the rows the caller may read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.claim_traceability_ok(version_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version_id uuid := claim_traceability_ok.version_id;
  v_untraceable_quantitative boolean;
  v_orphan_high_confidence   boolean;
BEGIN
  IF v_version_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. A quantitative finding must resolve to an analysis run, which must in
  --    turn resolve to dataset versions and their variables (§45.1.7).
  SELECT EXISTS (
    SELECT 1
      FROM knowledge.claims c
     WHERE c.version_id = v_version_id
       AND c.claim_type = 'quantitative_finding'
       AND NOT EXISTS (
         SELECT 1
           FROM knowledge.analysis_runs ar
          WHERE ar.id = c.analysis_run_id
            AND cardinality(ar.dataset_version_ids) > 0
            AND EXISTS (
              SELECT 1 FROM knowledge.dataset_variables dv
               WHERE dv.dataset_version_id = ANY (ar.dataset_version_ids)
            )
       )
  ) INTO v_untraceable_quantitative;

  -- 2. No orphaned high-confidence claims: a claim published at high confidence
  --    must resolve to a supporting source or to an analysis run (§45.1.7).
  SELECT EXISTS (
    SELECT 1
      FROM knowledge.claims c
     WHERE c.version_id = v_version_id
       AND c.confidence = 'high'
       AND NOT EXISTS (
         SELECT 1 FROM knowledge.analysis_runs ar WHERE ar.id = c.analysis_run_id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM knowledge.claim_sources cs
           JOIN knowledge.sources s ON s.id = cs.source_id
          WHERE cs.claim_id = c.id
            AND cs.relationship IN ('supports', 'partially_supports')
       )
  ) INTO v_orphan_high_confidence;

  RETURN NOT (v_untraceable_quantitative OR v_orphan_high_confidence);
END;
$$;

COMMENT ON FUNCTION private.claim_traceability_ok(uuid) IS
  'Block 08 publication gate (§45.1.7). False when any quantitative_finding on the version lacks an analysis run resolving to dataset versions and variables, or any high-confidence claim lacks a resolvable supporting source or analysis run. SECURITY DEFINER so the gate sees all evidence rows; restricted search_path.';

CREATE OR REPLACE FUNCTION private.figure_provenance_ok(version_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version_id uuid := figure_provenance_ok.version_id;
BEGIN
  IF v_version_id IS NULL THEN
    RETURN false;
  END IF;

  -- §45.3.5: every visual module must carry a provenance row. A data figure is
  -- traced through its run; an illustrative one through its Block 13 asset.
  RETURN NOT EXISTS (
    SELECT 1
      FROM cms.content_version_modules m
      JOIN cms.content_modules cm ON cm.key = m.module_key
     WHERE m.version_id = v_version_id
       AND cm.is_visual
       AND NOT EXISTS (
         SELECT 1 FROM knowledge.figure_provenance fp
          WHERE fp.version_id = m.version_id
            AND fp.fragment_id = m.fragment_id
       )
  );
END;
$$;

COMMENT ON FUNCTION private.figure_provenance_ok(uuid) IS
  'Block 08 publication gate (§45.3.5). False when a visual module of the version has no knowledge.figure_provenance row. The row''s own CHECK constraints decide whether the data or asset-origin path is satisfied.';

CREATE OR REPLACE FUNCTION private.evidence_standard_ok(version_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version_id uuid := evidence_standard_ok.version_id;
  v_standard   text;
BEGIN
  IF v_version_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT ct.minimum_evidence_standard
    INTO v_standard
    FROM cms.content_versions cv
    JOIN cms.content_items ci  ON ci.id = cv.content_item_id
    JOIN cms.content_types ct  ON ct.key = ci.content_type_key
   WHERE cv.id = v_version_id;

  IF v_standard IS NULL THEN
    RETURN false;
  END IF;

  -- §45.1.7: source linkage is configurable per content type. Only 'mandatory'
  -- blocks publication; quantitative traceability is handled separately and is
  -- never configurable downward.
  IF v_standard <> 'mandatory' THEN
    RETURN true;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM knowledge.claims c
     WHERE c.version_id = v_version_id
       AND c.claim_type IN ('observed_fact', 'definition', 'interpretation',
                            'recommendation', 'forecast')
       -- A platform definition states its own basis and needs no external source.
       AND NOT (c.claim_type = 'definition' AND c.is_platform_definition)
       -- An interpretation or recommendation may rest on another claim instead.
       AND NOT (c.claim_type IN ('interpretation', 'recommendation') AND c.basis_claim_id IS NOT NULL)
       AND c.analysis_run_id IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM knowledge.claim_sources cs
          WHERE cs.claim_id = c.id
            AND cs.relationship IN ('supports', 'partially_supports')
       )
  );
END;
$$;

COMMENT ON FUNCTION private.evidence_standard_ok(uuid) IS
  'Block 08 publication gate (§45.1.7). Enforces the content type''s declared minimum_evidence_standard: under ''mandatory'', every source-requiring claim must resolve to a supporting source, an analysis run, or a basis claim. Permissive for ''optional'' and ''recommended''.';

-- ---------------------------------------------------------------------------
-- Contradiction surface for the Block 09 evidence review. security_invoker so
-- the reader's RLS applies to the underlying tables (rules/database.md 10).
-- ---------------------------------------------------------------------------
CREATE VIEW knowledge.contradicted_claims WITH (security_invoker = true) AS
  SELECT c.id            AS claim_id,
         c.public_id     AS claim_public_id,
         c.version_id,
         c.fragment_id,
         c.claim_type,
         c.evidence_class,
         c.confidence,
         c.assertion,
         cs.id           AS claim_source_id,
         cs.source_id,
         s.title         AS source_title,
         cs.location,
         cs.note,
         cs.reviewed_at
    FROM knowledge.claims c
    JOIN knowledge.claim_sources cs ON cs.claim_id = c.id
    JOIN knowledge.sources s        ON s.id = cs.source_id
   WHERE cs.relationship = 'contradicts';

COMMENT ON VIEW knowledge.contradicted_claims IS
  'Claims with at least one contradicting source (§45.1.7 contradiction visibility). Surfaced by the Block 09 evidence review; security_invoker so claim visibility follows the underlying tables.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE TRIGGER sources_updated_at BEFORE UPDATE ON knowledge.sources
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER datasets_updated_at BEFORE UPDATE ON knowledge.datasets
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER dataset_versions_updated_at BEFORE UPDATE ON knowledge.dataset_versions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER dataset_variables_updated_at BEFORE UPDATE ON knowledge.dataset_variables
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER analysis_methods_updated_at BEFORE UPDATE ON knowledge.analysis_methods
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER analysis_runs_updated_at BEFORE UPDATE ON knowledge.analysis_runs
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER claims_updated_at BEFORE UPDATE ON knowledge.claims
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER claim_sources_updated_at BEFORE UPDATE ON knowledge.claim_sources
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER figure_provenance_updated_at BEFORE UPDATE ON knowledge.figure_provenance
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS on from creation. Policies belong to the RLS migration
-- (rules/database.md 6); none are declared here.
-- ---------------------------------------------------------------------------
ALTER TABLE knowledge.sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.datasets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.dataset_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.dataset_variables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.analysis_methods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.analysis_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.claim_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.figure_provenance  ENABLE ROW LEVEL SECURITY;
