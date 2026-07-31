-- Block 07 / Block 15 / Block 19 — RLS for search and analytics
-- (§45.1.8 "search never returns unauthorized content", §45.3.3 "no leakage of
-- private embeddings")
--
-- Reverse: DROP POLICY for each. RLS stays enabled: reversal fails closed.

-- ---------------------------------------------------------------------------
-- Search. Rows inherit the visibility of the version they describe, so permission
-- filtering happens INSIDE the query rather than as a post-filter on results.
-- Result counts, facet counts and snippets are therefore all correct by
-- construction — a restricted document cannot be inferred from a total.
-- ---------------------------------------------------------------------------
CREATE POLICY documents_read ON search.documents
  FOR SELECT TO anon, authenticated
  USING (
    private.can_read_version(version_id)
    AND NOT EXISTS (
      SELECT 1 FROM search.suppressions s
       WHERE s.content_item_id = documents.content_item_id
         AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  );

COMMENT ON POLICY documents_read ON search.documents IS
  'Visibility inherits from the source version. Suppression additionally hides a '
  'document from results — but suppression is a RANKING control, never an access '
  'control: it is applied on top of can_read_version, never instead of it.';

CREATE POLICY documents_write ON search.documents
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

CREATE POLICY chunks_read ON search.chunks
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM search.documents d
                  WHERE d.id = chunks.document_id
                    AND private.can_read_version(d.version_id)));
CREATE POLICY chunks_write ON search.chunks
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

-- Embeddings carry the visibility of their source. A similarity query must not be
-- able to surface a restricted document's content as a neighbour.
CREATE POLICY embeddings_read ON search.embeddings
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));
CREATE POLICY embeddings_write ON search.embeddings
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

-- Ranking controls are administrative, not public.
CREATE POLICY boosts_admin ON search.boosts
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

CREATE POLICY suppressions_admin ON search.suppressions
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

CREATE POLICY zero_result_admin ON search.zero_result_queries
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.manage_search'));

CREATE POLICY index_queue_admin ON search.index_queue
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.manage_search'));

-- ---------------------------------------------------------------------------
-- Analytics. Raw event access is restricted to analytics_viewer and administrators
-- (Block 19). Ingestion is open because an anonymous page view must be recordable;
-- reading back is not.
-- ---------------------------------------------------------------------------
CREATE POLICY analytics_insert ON analytics.events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY analytics_read_admin ON analytics.events
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.read_analytics'));
-- No UPDATE or DELETE policy: append-only, purged only by the retention job.

CREATE POLICY retention_policies_read ON analytics.retention_policies
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.read_analytics'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA search TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA search TO authenticated;
GRANT INSERT ON analytics.events TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA search, analytics TO authenticated;
