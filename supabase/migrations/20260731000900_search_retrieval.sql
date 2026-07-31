-- Block 15 — Search and retrieval (§45.1.8)
-- Weighted lexical documents, semantic chunks, pgvector embeddings, editorial
-- ranking controls, zero-result analysis and the asynchronous index/embed queue.
--
-- This block creates NO synonym store. Synonyms live in taxonomy.synonyms
-- (Block 05, §45.1.4) and are resolved at query time by private.taxonomy_match_score().
--
-- Reverse procedure (destructive; never run against production):
--   DROP TRIGGER content_versions_enqueue_index_on_insert ON cms.content_versions;
--   DROP TRIGGER content_versions_enqueue_index_on_publish ON cms.content_versions;
--   DROP TRIGGER content_versions_purge_search_document   ON cms.content_versions;
--   DROP TABLE search.embeddings, search.chunks, search.documents,
--              search.boosts, search.suppressions,
--              search.zero_result_queries, search.index_queue CASCADE;
--   DROP TEXT SEARCH CONFIGURATION search.crux_english CASCADE;
--   DROP FUNCTION private.hybrid_rank(double precision, double precision, double precision,
--        timestamptz, double precision, double precision, double precision, double precision,
--        double precision, double precision, double precision, timestamptz);
--   DROP FUNCTION private.taxonomy_match_score(uuid, text, double precision);
--   DROP FUNCTION private.search_editorial_boost(uuid);
--   DROP FUNCTION private.search_is_suppressed(uuid);
--   DROP FUNCTION private.record_zero_result_query(text, text);
--   DROP FUNCTION private.normalise_search_query(text);
--   DROP FUNCTION private.enqueue_search_index_job();
--   DROP FUNCTION private.enqueue_search_embed_job();
--   DROP FUNCTION private.purge_search_document();
--   DROP FUNCTION private.guard_search_document_published();
-- The `search` schema itself belongs to Block 04 and is not dropped here.

-- ---------------------------------------------------------------------------
-- Text search configuration (§45.1.8 requirement 2).
--
-- `english` plus the `unaccent` dictionary, so "Bogotá" and "Bogota" collide.
-- to_tsvector(regconfig, text) is IMMUTABLE, which is what makes the generated
-- tsvector column below legal. The dictionary schema is resolved from the
-- catalogue rather than assumed, because Supabase installs extensions into
-- `extensions` while a plain cluster installs them into `public`. This is the
-- only dynamic SQL in the block: identifiers are quoted with %I and no user
-- input reaches it (rules/database.md 20).
--
-- Known limitation: if the unaccent rule file ever changes, already-stored
-- tsvectors are stale until rewritten. The re-index runbook covers this by
-- enqueuing an `index` job for every document.
-- ---------------------------------------------------------------------------
CREATE TEXT SEARCH CONFIGURATION search.crux_english ( COPY = pg_catalog.english );

DO $$
DECLARE
  v_nsp text;
BEGIN
  SELECT n.nspname INTO v_nsp
    FROM pg_ts_dict d
    JOIN pg_namespace n ON n.oid = d.dictnamespace
   WHERE d.dictname = 'unaccent'
   ORDER BY n.nspname
   LIMIT 1;

  IF v_nsp IS NULL THEN
    RAISE EXCEPTION 'the unaccent dictionary is required by search.crux_english (§45.1.1 installs it)';
  END IF;

  EXECUTE format(
    'ALTER TEXT SEARCH CONFIGURATION search.crux_english
       ALTER MAPPING FOR hword, hword_part, word WITH %I.unaccent, english_stem',
    v_nsp
  );
END
$$;

COMMENT ON TEXT SEARCH CONFIGURATION search.crux_english IS
  'english + unaccent (§45.1.8). The single configuration used for both document construction and query parsing, so indexing and querying can never disagree.';

-- ---------------------------------------------------------------------------
-- search.documents — one row per PUBLISHED cms.content_versions row (§45.1.8).
--
-- WEIGHT ASSIGNMENT AND RATIONALE (§45.1.8 requirement 2):
--   A  title                       — the strongest statement of what the piece is about.
--   B  summary, key findings       — the authored abstraction of the piece; a query
--                                    matching a finding should outrank one matching prose.
--   C  headings, taxonomy terms,
--      author names                — navigational and controlled metadata: precise,
--                                    but narrower than the summary.
--   D  body text, claim text       — the long tail. Present and searchable, but a body
--                                    match alone must not outrank a title match.
-- Title and summary therefore outrank headings, which outrank body text, exactly
-- as required.
--
-- The vector is GENERATED ALWAYS ... STORED over the stored text columns rather
-- than maintained by a trigger, so it is structurally impossible for it to be
-- stale. This satisfies the §45.1.12 "search vector update trigger" requirement
-- synchronously: lexical indexing depends on no external provider, so it happens
-- in the write transaction. Only embedding is asynchronous (see search.index_queue).
-- ---------------------------------------------------------------------------
CREATE TABLE search.documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id        uuid NOT NULL UNIQUE REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  content_item_id   uuid NOT NULL REFERENCES cms.content_items(id) ON DELETE CASCADE,
  content_type_key  text NOT NULL REFERENCES cms.content_types(key) ON DELETE RESTRICT,
  locale            text NOT NULL DEFAULT 'en',
  published_at      timestamptz NOT NULL,

  -- Stored source text. Flattened at index time by the queue worker from the
  -- version, its modules, its claims, its terms and its contributors.
  title             text NOT NULL,
  summary_text      text NOT NULL DEFAULT '',
  key_findings_text text NOT NULL DEFAULT '',
  headings_text     text NOT NULL DEFAULT '',
  taxonomy_text     text NOT NULL DEFAULT '',
  authors_text      text NOT NULL DEFAULT '',
  body_text         text NOT NULL DEFAULT '',
  claims_text       text NOT NULL DEFAULT '',

  search_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('search.crux_english', coalesce(title, '')),             'A')
   || setweight(to_tsvector('search.crux_english', coalesce(summary_text, '')),      'B')
   || setweight(to_tsvector('search.crux_english', coalesce(key_findings_text, '')), 'B')
   || setweight(to_tsvector('search.crux_english', coalesce(headings_text, '')),     'C')
   || setweight(to_tsvector('search.crux_english', coalesce(taxonomy_text, '')),     'C')
   || setweight(to_tsvector('search.crux_english', coalesce(authors_text, '')),      'C')
   || setweight(to_tsvector('search.crux_english', coalesce(body_text, '')),         'D')
   || setweight(to_tsvector('search.crux_english', coalesce(claims_text, '')),       'D')
  ) STORED,

  -- When the queue worker last rebuilt this row's source text.
  indexed_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT documents_locale_shape    CHECK (locale ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})*$')
);

COMMENT ON TABLE search.documents IS
  'One lexical search document per published content version (§45.1.8). Weighted tsvector is a generated stored column, so it can never be stale; §45.1.12 lexical half is therefore synchronous with the write.';
COMMENT ON COLUMN search.documents.search_vector IS
  'Weighted tsvector: A title; B summary and key findings; C headings, taxonomy terms and author names; D body and claim text (§45.1.8 requirement 2).';
COMMENT ON COLUMN search.documents.claims_text IS
  'Flattened claim assertion text for the version. Claim-level SEMANTIC retrieval uses search.embeddings with target_kind = claim; this column only makes claims lexically findable.';

CREATE INDEX documents_search_vector_idx ON search.documents USING gin (search_vector);
CREATE INDEX documents_item_idx          ON search.documents (content_item_id);
CREATE INDEX documents_type_idx          ON search.documents (content_type_key);
CREATE INDEX documents_published_idx     ON search.documents (published_at DESC);
CREATE INDEX documents_locale_idx        ON search.documents (locale, published_at DESC);
-- Trigram on title: powers "did you mean" and prefix suggestions for queries the
-- stemmed tsvector cannot match (typos, partial words).
CREATE INDEX documents_title_trgm_idx    ON search.documents USING gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search.chunks — semantic chunks at module boundaries (§45.1.8 requirement 4).
-- Each chunk keeps the module fragment_id so a hit deep-links to the section.
-- ---------------------------------------------------------------------------
CREATE TABLE search.chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES search.documents(id) ON DELETE CASCADE,
  -- The module the chunk was cut from. NULL for chunks cut from version-level
  -- fields (title, summary, methodology) that belong to no module.
  module_id      uuid REFERENCES cms.content_version_modules(id) ON DELETE CASCADE,
  -- Copied, not joined: the deep link must survive even if the module row is
  -- reorganised, and modules of a published version are immutable anyway.
  fragment_id    text,
  chunk_index    integer NOT NULL,
  content        text NOT NULL,
  token_count    integer NOT NULL,
  -- Recorded overlap with the preceding chunk, in tokens (requirement 4).
  overlap_tokens integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index),
  CONSTRAINT chunks_index_non_negative CHECK (chunk_index >= 0),
  CONSTRAINT chunks_token_count_bounded CHECK (token_count > 0 AND token_count <= 1024),
  CONSTRAINT chunks_overlap_bounded     CHECK (overlap_tokens >= 0 AND overlap_tokens < token_count),
  CONSTRAINT chunks_content_not_blank   CHECK (btrim(content) <> ''),
  CONSTRAINT chunks_module_has_fragment CHECK (module_id IS NULL OR fragment_id IS NOT NULL)
);

COMMENT ON TABLE search.chunks IS
  'Version content chunked at module and section boundaries (§45.1.8 requirement 4). Bounded to 1024 tokens with a recorded overlap; retains the module fragment_id so a result deep-links to the section.';
COMMENT ON COLUMN search.chunks.fragment_id IS
  'cms.content_version_modules.fragment_id of the source module, copied so the deep link is stable independently of the module row.';

CREATE INDEX chunks_document_idx ON search.chunks (document_id, chunk_index);
CREATE INDEX chunks_module_idx   ON search.chunks (module_id) WHERE module_id IS NOT NULL;
CREATE INDEX chunks_fragment_idx ON search.chunks (document_id, fragment_id) WHERE fragment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- search.embeddings — pgvector store (§45.1.8 requirements 3, 5, 6).
--
-- One row can embed a chunk, a claim, or a finding; target_kind is the
-- discriminator. Claims and findings are both rows of knowledge.claims (a
-- finding is a claim of type derived_finding or quantitative_finding, §45.1.7),
-- but they are embedded under distinct kinds so a summary-level query can be
-- restricted to findings without matching general claim prose.
--
-- model_id is NOT NULL on every row: a model change is then a single query
-- (SELECT DISTINCT model_id) and re-embedding can be scoped to the stale subset
-- without corpus downtime.
-- ---------------------------------------------------------------------------
CREATE TABLE search.embeddings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind    text NOT NULL CHECK (target_kind IN ('chunk', 'claim', 'finding')),
  chunk_id       uuid REFERENCES search.chunks(id) ON DELETE CASCADE,
  -- Soft reference to knowledge.claims(id). The FK is attached below only when
  -- the knowledge schema is present, so this migration applies both to a full
  -- stack and to a search-only test database. See the DO block after the table.
  claim_id       uuid,
  model_id       text NOT NULL,
  dimensions     integer NOT NULL DEFAULT 1536,
  embedding      vector(1536) NOT NULL,
  -- Digest of the exact text embedded. Lets a re-embedding pass skip rows whose
  -- source text has not changed, and makes a partially completed pass resumable.
  source_hash    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embeddings_dimensions_fixed CHECK (dimensions = 1536),
  CONSTRAINT embeddings_model_not_blank  CHECK (btrim(model_id) <> ''),
  CONSTRAINT embeddings_one_target CHECK (
    (chunk_id IS NOT NULL)::int + (claim_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT embeddings_target_kind_matches CHECK (
    (target_kind = 'chunk'                  AND chunk_id IS NOT NULL)
    OR (target_kind IN ('claim', 'finding') AND claim_id IS NOT NULL)
  ),
  -- NULLS NOT DISTINCT: exactly one embedding per target per model.
  CONSTRAINT embeddings_target_model_unique
    UNIQUE NULLS NOT DISTINCT (target_kind, chunk_id, claim_id, model_id)
);

COMMENT ON TABLE search.embeddings IS
  'Semantic vectors for chunks, claims and findings (§45.1.8 requirements 3, 5, 6). Fixed 1536 dimensions; model_id recorded on every row so a model change is detectable and re-embedding is scoped.';
COMMENT ON COLUMN search.embeddings.claim_id IS
  'knowledge.claims(id). FK attached conditionally at migration time because Block 15 must also apply to a database without the knowledge schema.';
COMMENT ON COLUMN search.embeddings.target_kind IS
  'chunk | claim | finding. finding is a knowledge.claims row of type derived_finding or quantitative_finding, embedded separately so a summary-level query can match a finding without matching the body.';

DO $$
BEGIN
  IF to_regclass('knowledge.claims') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE search.embeddings
               ADD CONSTRAINT embeddings_claim_fk
               FOREIGN KEY (claim_id) REFERENCES knowledge.claims(id) ON DELETE CASCADE';
  END IF;
END
$$;

CREATE INDEX embeddings_chunk_idx ON search.embeddings (chunk_id) WHERE chunk_id IS NOT NULL;
CREATE INDEX embeddings_claim_idx ON search.embeddings (claim_id) WHERE claim_id IS NOT NULL;
-- Access path: "which rows are on an outdated model?" during a re-embedding pass.
CREATE INDEX embeddings_model_idx ON search.embeddings (model_id, target_kind);

-- HNSW, not IVFFlat: pgvector 0.6.0 supports HNSW, it needs no training set (an
-- IVFFlat index built on an empty corpus is useless until rebuilt), and it holds
-- recall as the corpus grows. Cosine, matching the normalised embeddings the
-- Block 03 provider abstraction returns.
CREATE INDEX embeddings_hnsw_cosine_idx ON search.embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- search.boosts / search.suppressions — editorial ranking controls
-- (§45.1.8 requirements 11, 12).
-- ---------------------------------------------------------------------------
CREATE TABLE search.boosts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL UNIQUE REFERENCES cms.content_items(id) ON DELETE CASCADE,
  -- Signed editorial adjustment fed to private.hybrid_rank as the fifth signal.
  -- Negative demotes without hiding; use a suppression to remove entirely.
  boost_factor    numeric(4,3) NOT NULL DEFAULT 0.200,
  reason          text NOT NULL,
  expires_at      timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boosts_factor_bounded  CHECK (boost_factor >= -1.000 AND boost_factor <= 1.000),
  CONSTRAINT boosts_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT boosts_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);

COMMENT ON TABLE search.boosts IS
  'Administrative ranking boosts (§45.1.8 requirement 11). Content item, recorded reason, optional expiry. One row per item; superseded values are recoverable from audit.events.';
COMMENT ON COLUMN search.boosts.boost_factor IS
  'Signed adjustment in [-1, 1] consumed by private.hybrid_rank. Default 0.200 raises an item by 5% of a perfect score at the default editorial weight.';

CREATE INDEX boosts_active_idx ON search.boosts (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE search.suppressions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL UNIQUE REFERENCES cms.content_items(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  expires_at      timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppressions_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT suppressions_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);

COMMENT ON TABLE search.suppressions IS
  'Administrative removal of content from search results (§45.1.8 requirement 12). SUPPRESSION IS A RANKING CONTROL AND NEVER AN ACCESS CONTROL: a suppressed item remains readable at its canonical URL and through the API, and a row here grants and revokes nothing. Anything that must not be readable is governed by RLS and the §45.2 permission model, never by this table.';

CREATE INDEX suppressions_active_idx ON search.suppressions (expires_at) WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- search.zero_result_queries (§45.1.8 requirement 9).
-- Only the normalised, redacted query text is retained — never the raw string,
-- never the requesting user.
-- ---------------------------------------------------------------------------
CREATE TABLE search.zero_result_queries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale           text NOT NULL DEFAULT 'en',
  normalised_query text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale, normalised_query),
  CONSTRAINT zrq_count_positive     CHECK (occurrence_count > 0),
  CONSTRAINT zrq_query_not_blank    CHECK (btrim(normalised_query) <> ''),
  CONSTRAINT zrq_query_bounded      CHECK (length(normalised_query) <= 200),
  CONSTRAINT zrq_seen_order         CHECK (last_seen_at >= first_seen_at)
);

COMMENT ON TABLE search.zero_result_queries IS
  'Queries that returned nothing, normalised and counted (§45.1.8 requirement 9). Surfaced in the Block 09 search-quality manager. Stores no actor and no raw query: personal data is redacted by private.normalise_search_query before the row is written.';

CREATE INDEX zrq_frequency_idx ON search.zero_result_queries (occurrence_count DESC, last_seen_at DESC);
CREATE INDEX zrq_last_seen_idx ON search.zero_result_queries (last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- search.index_queue — asynchronous indexing and embedding (§45.3.3).
-- Populated by the publication transaction. A provider outage dead-letters a
-- job; it never fails publication.
-- Identity bigint rather than uuid: this is a high-churn FIFO whose ordering is
-- meaningful and whose rows are never externally addressed.
-- ---------------------------------------------------------------------------
CREATE TABLE search.index_queue (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id     uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  job_type       text NOT NULL CHECK (job_type IN ('index', 'embed')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead_lettered')),
  attempts       integer NOT NULL DEFAULT 0,
  max_attempts   integer NOT NULL DEFAULT 5,
  last_error     text,
  dead_lettered  boolean NOT NULL DEFAULT false,
  available_at   timestamptz NOT NULL DEFAULT now(),
  locked_at      timestamptz,
  locked_by      text,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT index_queue_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT index_queue_max_attempts_positive CHECK (max_attempts > 0),
  -- The flag and the state cannot drift apart.
  CONSTRAINT index_queue_dead_letter_consistent CHECK (dead_lettered = (status = 'dead_lettered')),
  CONSTRAINT index_queue_dead_letter_has_error  CHECK (NOT dead_lettered OR last_error IS NOT NULL),
  CONSTRAINT index_queue_running_is_locked      CHECK (status <> 'running' OR locked_at IS NOT NULL)
);

COMMENT ON TABLE search.index_queue IS
  'Asynchronous index and embed jobs (§45.3.3, §45.1.12). Enqueued by the publication transaction; drained by the Block 03 provider worker. Records attempts, last error and dead-letter state so a provider outage degrades retrieval freshness and never publication.';
COMMENT ON COLUMN search.index_queue.job_type IS
  'index = rebuild search.documents source text and chunks (no external provider). embed = call the embedding provider through the Block 03 abstraction.';

CREATE INDEX index_queue_ready_idx ON search.index_queue (available_at, id)
  WHERE status = 'pending';
CREATE INDEX index_queue_version_idx ON search.index_queue (version_id);
CREATE INDEX index_queue_dead_idx ON search.index_queue (updated_at DESC)
  WHERE dead_lettered;
-- At most one outstanding job of a kind per version: re-publishing twice in a
-- row must not queue the same work twice.
CREATE UNIQUE INDEX index_queue_active_job_idx ON search.index_queue (version_id, job_type)
  WHERE status IN ('pending', 'running');

-- ---------------------------------------------------------------------------
-- Query normalisation and zero-result logging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.normalise_search_query(p_query text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(
    left(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(unaccent(coalesce(p_query, ''))),
              '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', '[email]', 'g'),
            '[0-9]{6,}', '[number]', 'g'),
          '\s+', ' ', 'g')
      ),
      200),
    '');
$$;

COMMENT ON FUNCTION private.normalise_search_query(text) IS
  'Lower-cases, unaccents and collapses whitespace, redacts email addresses and long digit runs, truncates to 200 characters. Deterministic. The only form of a query permitted into retention (§45.1.8 requirement 9).';

CREATE OR REPLACE FUNCTION private.record_zero_result_query(
  p_query  text,
  p_locale text DEFAULT 'en'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_norm text := private.normalise_search_query(p_query);
BEGIN
  -- A blank or fully redacted query carries no search-quality signal.
  IF v_norm IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO search.zero_result_queries (locale, normalised_query)
  VALUES (p_locale, v_norm)
  ON CONFLICT (locale, normalised_query) DO UPDATE
    SET occurrence_count = search.zero_result_queries.occurrence_count + 1,
        last_seen_at     = now();
END;
$$;

COMMENT ON FUNCTION private.record_zero_result_query(text, text) IS
  'Upserts a zero-result observation. SECURITY DEFINER with a restricted search_path because an anonymous searcher must be able to contribute the counter without holding INSERT on search.zero_result_queries; the function writes only the redacted normal form and no actor identity, so it cannot be used to write arbitrary rows.';

-- ---------------------------------------------------------------------------
-- Ranking signal helpers
-- ---------------------------------------------------------------------------

-- Signal 3: taxonomy match, resolved through taxonomy.synonyms (Block 05).
-- PRECEDENCE: synonym resolution is applied to the controlled label BEFORE and
-- INDEPENDENTLY of stemming. A synonym hit is exact-match evidence about the
-- subject of the item; the stemmed tsvector only contributes to signal 1. A
-- synonym therefore never has to survive the stemmer to count.
CREATE OR REPLACE FUNCTION private.taxonomy_match_score(
  p_content_item_id uuid,
  p_query           text,
  p_saturation      double precision DEFAULT 2.0
)
RETURNS double precision
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH q AS (
    SELECT ' ' || regexp_replace(lower(unaccent(coalesce(p_query, ''))), '\s+', ' ', 'g') || ' ' AS text
  ),
  item_terms AS (
    SELECT t.id, lower(unaccent(t.name)) AS label
      FROM taxonomy.content_terms ct
      JOIN taxonomy.terms t ON t.id = ct.term_id
     WHERE ct.content_item_id = p_content_item_id
       AND t.deprecated_at IS NULL
  ),
  labels AS (
    SELECT id, label FROM item_terms
    UNION
    SELECT it.id, lower(unaccent(s.synonym))
      FROM item_terms it
      JOIN taxonomy.synonyms s ON s.term_id = it.id
  ),
  matched AS (
    SELECT DISTINCT l.id
      FROM labels l, q
     WHERE btrim(l.label) <> ''
       AND position(' ' || btrim(l.label) || ' ' IN q.text) > 0
  )
  SELECT LEAST(
           (SELECT count(*) FROM matched)::double precision
             / GREATEST(coalesce(p_saturation, 2.0), 1.0),
           1.0
         );
$$;

COMMENT ON FUNCTION private.taxonomy_match_score(uuid, text, double precision) IS
  'Signal 3 of the §45.1.8 hybrid rank, in [0,1]. Counts the item''s controlled terms whose label or taxonomy.synonyms alias appears as a whole phrase in the query, saturating at p_saturation terms (default 2: one matched term scores 0.5, two or more score 1.0). SECURITY INVOKER, so taxonomy RLS applies to the caller.';

-- Signal 5: editorial boost, expiry-aware.
CREATE OR REPLACE FUNCTION private.search_editorial_boost(p_content_item_id uuid)
RETURNS double precision
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    (SELECT b.boost_factor::double precision
       FROM search.boosts b
      WHERE b.content_item_id = p_content_item_id
        AND (b.expires_at IS NULL OR b.expires_at > now())),
    0.0);
$$;

COMMENT ON FUNCTION private.search_editorial_boost(uuid) IS
  'Signal 5 of the §45.1.8 hybrid rank: the active (unexpired) editorial boost for a content item, 0 when none. SECURITY INVOKER; the RLS migration must grant the retrieval path SELECT on search.boosts or every item scores 0.';

CREATE OR REPLACE FUNCTION private.search_is_suppressed(p_content_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM search.suppressions s
     WHERE s.content_item_id = p_content_item_id
       AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

COMMENT ON FUNCTION private.search_is_suppressed(uuid) IS
  'True when an unexpired suppression exists for the item. A RANKING predicate only: it must be applied in addition to, and never instead of, the RLS permission predicate.';

-- ---------------------------------------------------------------------------
-- private.hybrid_rank — the §45.1.8 fusion function.
--
-- FUSION METHOD: weighted linear combination of five signals, each normalised
-- into [0,1] (editorial into [-1,1]) before weighting. A linear combination was
-- chosen over reciprocal rank fusion because every signal here is already a
-- score rather than a rank, and because a linear form makes the contribution of
-- each signal individually inspectable and individually tunable — which is what
-- §45.1.8 requires. Any sixth signal requires an ADR.
--
-- DEFAULT WEIGHTS (sum to 1.0):
--   lexical    0.40  precision anchor; an exact-term match is the strongest evidence
--   vector     0.30  recall for paraphrase and concept queries
--   taxonomy   0.15  controlled-vocabulary confirmation, synonym-resolved
--   recency    0.10  freshness matters, but never enough to outrank relevance
--   editorial  0.05  deliberate ceiling: an editor nudges, never overrides
--
-- NORMALISATION:
--   lexical    x/(1+x) — ts_rank_cd is unbounded above; saturating keeps one
--              enormous body match from swamping the other four signals.
--   vector     1 - cosine distance, clamped to [0,1].
--   taxonomy   already [0,1] from private.taxonomy_match_score.
--   recency    exponential half-life decay, default 180 days.
--   editorial  clamped to [-1,1].
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.hybrid_rank(
  p_lexical_rank           double precision,
  p_vector_distance        double precision,
  p_taxonomy_score         double precision,
  p_published_at           timestamptz,
  p_editorial_boost        double precision DEFAULT 0.0,
  p_weight_lexical         double precision DEFAULT 0.40,
  p_weight_vector          double precision DEFAULT 0.30,
  p_weight_taxonomy        double precision DEFAULT 0.15,
  p_weight_recency         double precision DEFAULT 0.10,
  p_weight_editorial       double precision DEFAULT 0.05,
  p_recency_half_life_days double precision DEFAULT 180.0,
  p_now                    timestamptz DEFAULT now()
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  WITH s AS (
    SELECT
      GREATEST(coalesce(p_lexical_rank, 0.0), 0.0)
        / (1.0 + GREATEST(coalesce(p_lexical_rank, 0.0), 0.0))          AS lexical,
      LEAST(GREATEST(1.0 - coalesce(p_vector_distance, 1.0), 0.0), 1.0) AS vector_sim,
      LEAST(GREATEST(coalesce(p_taxonomy_score, 0.0), 0.0), 1.0)        AS taxonomy,
      CASE
        WHEN p_published_at IS NULL THEN 0.0
        ELSE exp(
          -ln(2.0)
          * GREATEST(EXTRACT(epoch FROM (p_now - p_published_at))::double precision, 0.0)
          / 86400.0
          / GREATEST(coalesce(p_recency_half_life_days, 180.0), 1.0)
        )
      END                                                               AS recency,
      LEAST(GREATEST(coalesce(p_editorial_boost, 0.0), -1.0), 1.0)      AS editorial
  )
  SELECT coalesce(p_weight_lexical,   0.0) * s.lexical
       + coalesce(p_weight_vector,    0.0) * s.vector_sim
       + coalesce(p_weight_taxonomy,  0.0) * s.taxonomy
       + coalesce(p_weight_recency,   0.0) * s.recency
       + coalesce(p_weight_editorial, 0.0) * s.editorial
    FROM s;
$$;

COMMENT ON FUNCTION private.hybrid_rank(double precision, double precision, double precision, timestamptz, double precision, double precision, double precision, double precision, double precision, double precision, double precision, timestamptz) IS
  'The §45.1.8 hybrid ranking function: weighted linear fusion of lexical score, vector similarity, synonym-resolved taxonomy match, recency and editorial boost. Every weight is a parameter with a documented default (0.40 / 0.30 / 0.15 / 0.10 / 0.05, summing to 1.0) so ranking is tunable without a code change and reproducible from the parameters alone. SECURITY INVOKER, pure arithmetic, no table access.';

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- A search document may only describe a published version (§45.1.8 requirement 1).
CREATE OR REPLACE FUNCTION private.guard_search_document_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM cms.content_versions WHERE id = NEW.version_id;

  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'search.documents may only index a published version; version % is %',
      NEW.version_id, coalesce(v_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.guard_search_document_published() IS
  'BEFORE INSERT/UPDATE on search.documents. Single responsibility: refuse a document for a version that is not published. Deterministic, no external calls.';

CREATE TRIGGER documents_published_only
  BEFORE INSERT OR UPDATE OF version_id ON search.documents
  FOR EACH ROW EXECUTE FUNCTION private.guard_search_document_published();

-- Publication enqueues indexing (§45.3.3). The transaction that publishes must
-- not wait on, or fail because of, an indexing or embedding provider.
CREATE OR REPLACE FUNCTION private.enqueue_search_index_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO search.index_queue (version_id, job_type)
  VALUES (NEW.id, 'index')
  ON CONFLICT (version_id, job_type) WHERE status IN ('pending', 'running') DO NOTHING;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.enqueue_search_index_job() IS
  'AFTER INSERT/UPDATE on cms.content_versions. Single responsibility: enqueue an index job on publication (§45.3.3). Never performs the work inline.';

CREATE TRIGGER content_versions_enqueue_index_on_publish
  AFTER UPDATE ON cms.content_versions
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
  EXECUTE FUNCTION private.enqueue_search_index_job();

CREATE TRIGGER content_versions_enqueue_index_on_insert
  AFTER INSERT ON cms.content_versions
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION private.enqueue_search_index_job();

-- §45.1.12, embedding half: the trigger enqueues, it never computes. Lexical
-- indexing already happened synchronously in the generated column above.
CREATE OR REPLACE FUNCTION private.enqueue_search_embed_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO search.index_queue (version_id, job_type)
  VALUES (NEW.version_id, 'embed')
  ON CONFLICT (version_id, job_type) WHERE status IN ('pending', 'running') DO NOTHING;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.enqueue_search_embed_job() IS
  'AFTER INSERT/UPDATE on search.documents. Single responsibility: enqueue the embedding job for the document''s version (§45.1.12). No external call is made in the database (rules/database.md 19b).';

CREATE TRIGGER documents_enqueue_embed_on_insert
  AFTER INSERT ON search.documents
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_search_embed_job();

CREATE TRIGGER documents_enqueue_embed_on_text_change
  AFTER UPDATE ON search.documents
  FOR EACH ROW
  WHEN (
    NEW.title             IS DISTINCT FROM OLD.title
    OR NEW.summary_text      IS DISTINCT FROM OLD.summary_text
    OR NEW.key_findings_text IS DISTINCT FROM OLD.key_findings_text
    OR NEW.headings_text     IS DISTINCT FROM OLD.headings_text
    OR NEW.body_text         IS DISTINCT FROM OLD.body_text
    OR NEW.claims_text       IS DISTINCT FROM OLD.claims_text
  )
  EXECUTE FUNCTION private.enqueue_search_embed_job();

-- Withdrawal and supersession remove the document from the index, cascading to
-- its chunks and their embeddings. Correction publishes a new version, which
-- enqueues its own index job above.
CREATE OR REPLACE FUNCTION private.purge_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM search.documents WHERE version_id = NEW.id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.purge_search_document() IS
  'AFTER UPDATE on cms.content_versions. Single responsibility: delete the search document (and, by cascade, its chunks and embeddings) when a version leaves the published state. Withdrawal must be immediate and synchronous — it is a removal, so it cannot be allowed to sit in a queue behind a provider outage.';

CREATE TRIGGER content_versions_purge_search_document
  AFTER UPDATE ON cms.content_versions
  FOR EACH ROW
  WHEN (NEW.status IN ('withdrawn', 'superseded') AND OLD.status = 'published')
  EXECUTE FUNCTION private.purge_search_document();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON search.documents
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER chunks_updated_at BEFORE UPDATE ON search.chunks
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER embeddings_updated_at BEFORE UPDATE ON search.embeddings
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER boosts_updated_at BEFORE UPDATE ON search.boosts
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER suppressions_updated_at BEFORE UPDATE ON search.suppressions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER zero_result_queries_updated_at BEFORE UPDATE ON search.zero_result_queries
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER index_queue_updated_at BEFORE UPDATE ON search.index_queue
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS on from creation; policies belong to the RLS migration (rules/database.md 6).
-- ---------------------------------------------------------------------------
ALTER TABLE search.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.chunks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.embeddings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.boosts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.suppressions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.zero_result_queries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE search.index_queue          ENABLE ROW LEVEL SECURITY;
