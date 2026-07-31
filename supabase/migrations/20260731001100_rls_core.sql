-- Block 07 — Row Level Security, core schemas (§45.1.11)
--
-- Default posture is DENY: RLS is enabled on every table at creation and access is
-- granted only by an explicit policy below. Policies are written per operation with
-- explicit USING and WITH CHECK. No permissive catch-all policy exists.
--
-- Reverse: DROP POLICY for each policy created here. Reversing leaves RLS enabled,
-- i.e. it fails closed.

-- ---------------------------------------------------------------------------
-- Visibility helpers. SECURITY DEFINER with a restricted search_path.
-- ---------------------------------------------------------------------------

-- A version is publicly readable when it is published and its item is published.
-- A withdrawn item is NOT publicly readable: the tombstone is served from the
-- retained citation record, not from the content body.
CREATE OR REPLACE FUNCTION private.version_is_public(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM cms.content_versions v
      JOIN cms.content_items i ON i.id = v.content_item_id
     WHERE v.id = p_version_id
       AND v.status IN ('published', 'superseded')
       AND i.lifecycle_state IN ('published', 'superseded')
  );
$$;

-- Editorial access is scoped by assignment where the workflow assigns work, and by
-- the broad editorial permission otherwise (Block 07 requirement 7).
CREATE OR REPLACE FUNCTION private.is_assigned_to_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM workflow.assignments a
     WHERE a.version_id = p_version_id
       AND a.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.version_is_public(p_version_id)
      OR private.has_permission('content.read_draft')
      OR private.is_assigned_to_version(p_version_id);
$$;

CREATE OR REPLACE FUNCTION private.can_write_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.has_permission('content.edit_any')
      OR (private.has_permission('content.edit_assigned') AND private.is_assigned_to_version(p_version_id));
$$;

COMMENT ON FUNCTION private.can_read_version(uuid) IS
  'Single authority for version visibility. Every content-adjacent policy calls this so the rule cannot diverge between tables.';

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone, writable only by administrators.
-- ---------------------------------------------------------------------------
CREATE POLICY content_types_read ON cms.content_types
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY content_types_write ON cms.content_types
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_settings'))
  WITH CHECK (private.has_permission('admin.manage_settings'));

CREATE POLICY content_modules_read ON cms.content_modules
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY content_modules_write ON cms.content_modules
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_settings'))
  WITH CHECK (private.has_permission('admin.manage_settings'));

-- Roles and permissions are readable by authenticated users (the admin UI needs the
-- matrix) but never writable through the API.
CREATE POLICY roles_read ON identity.roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_read ON identity.permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_read ON identity.role_permissions
  FOR SELECT TO authenticated USING (true);

-- user_roles: a user may read their own; administrators may read all. Writes go
-- through the trigger-guarded path and require the admin permission.
CREATE POLICY user_roles_read_own ON identity.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission('admin.manage_users'));
CREATE POLICY user_roles_admin_write ON identity.user_roles
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_users'))
  WITH CHECK (private.has_permission('admin.manage_users'));

-- ---------------------------------------------------------------------------
-- Taxonomy: public read of the controlled vocabulary; governed writes.
-- ---------------------------------------------------------------------------
CREATE POLICY vocabularies_read ON taxonomy.vocabularies
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY vocabularies_write ON taxonomy.vocabularies
  FOR ALL TO authenticated
  USING (private.has_permission('taxonomy.manage_terms'))
  WITH CHECK (private.has_permission('taxonomy.manage_terms'));

CREATE POLICY terms_read ON taxonomy.terms
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY terms_write ON taxonomy.terms
  FOR ALL TO authenticated
  USING (private.has_permission('taxonomy.manage_terms'))
  WITH CHECK (private.has_permission('taxonomy.manage_terms'));

CREATE POLICY term_rel_read ON taxonomy.term_relationships
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY term_rel_write ON taxonomy.term_relationships
  FOR ALL TO authenticated
  USING (private.has_permission('taxonomy.manage_terms'))
  WITH CHECK (private.has_permission('taxonomy.manage_terms'));

CREATE POLICY synonyms_read ON taxonomy.synonyms
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY synonyms_write ON taxonomy.synonyms
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_search'))
  WITH CHECK (private.has_permission('admin.manage_search'));

CREATE POLICY external_mappings_read ON taxonomy.external_mappings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY external_mappings_write ON taxonomy.external_mappings
  FOR ALL TO authenticated
  USING (private.has_permission('taxonomy.manage_terms'))
  WITH CHECK (private.has_permission('taxonomy.manage_terms'));

-- Term assignments follow the visibility of the content item they describe.
CREATE POLICY content_terms_read ON taxonomy.content_terms
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cms.content_items i
       WHERE i.id = content_terms.content_item_id
         AND (i.lifecycle_state IN ('published', 'superseded')
              OR private.has_permission('content.read_draft'))
    )
  );
CREATE POLICY content_terms_write ON taxonomy.content_terms
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any') OR private.has_permission('taxonomy.manage_terms'))
  WITH CHECK (private.has_permission('content.edit_any') OR private.has_permission('taxonomy.manage_terms'));

-- ---------------------------------------------------------------------------
-- Bibliographic identity: published expert profiles are public.
-- ---------------------------------------------------------------------------
CREATE POLICY people_read ON identity.people
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY people_write ON identity.people
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY organisations_read ON identity.organisations
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY organisations_write ON identity.organisations
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY expert_profiles_read ON identity.expert_profiles
  FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL OR private.has_permission('content.read_draft'));
CREATE POLICY expert_profiles_write ON identity.expert_profiles
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY external_identifiers_read ON identity.external_identifiers
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY external_identifiers_write ON identity.external_identifiers
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

-- ---------------------------------------------------------------------------
-- Content items and versions. Draft isolation is the load-bearing rule.
-- ---------------------------------------------------------------------------
CREATE POLICY content_items_public_read ON cms.content_items
  FOR SELECT TO anon, authenticated
  USING (
    lifecycle_state IN ('published', 'superseded', 'withdrawn')
    OR private.has_permission('content.read_draft')
  );

CREATE POLICY content_items_editorial_write ON cms.content_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('content.create'));

CREATE POLICY content_items_editorial_update ON cms.content_items
  FOR UPDATE TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

-- A draft version is readable ONLY by a holder of content.read_draft or an assignee.
-- There is no policy path by which anon or a plain registered_user reads a draft.
CREATE POLICY content_versions_read ON cms.content_versions
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(id));

CREATE POLICY content_versions_insert ON cms.content_versions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('content.create') OR private.has_permission('content.edit_any'));

CREATE POLICY content_versions_update ON cms.content_versions
  FOR UPDATE TO authenticated
  USING (private.can_write_version(id))
  WITH CHECK (private.can_write_version(id));

CREATE POLICY cvm_read ON cms.content_version_modules
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));

CREATE POLICY cvm_write ON cms.content_version_modules
  FOR ALL TO authenticated
  USING (private.can_write_version(version_id))
  WITH CHECK (private.can_write_version(version_id));

CREATE POLICY contributors_read ON cms.content_contributors
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));

CREATE POLICY contributors_write ON cms.content_contributors
  FOR ALL TO authenticated
  USING (private.can_write_version(version_id))
  WITH CHECK (private.can_write_version(version_id));

CREATE POLICY relationships_read ON cms.content_relationships
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM cms.content_items i
             WHERE i.id = content_relationships.from_item_id
               AND (i.lifecycle_state <> 'draft' OR private.has_permission('content.read_draft')))
  );
CREATE POLICY relationships_write ON cms.content_relationships
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY redirects_read ON cms.redirects
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY redirects_write ON cms.redirects
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_redirects'))
  WITH CHECK (private.has_permission('admin.manage_redirects'));

-- ---------------------------------------------------------------------------
-- User-owned data. Owner-only, plus the administrative roles that require it.
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_read_own ON accounts.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission('admin.manage_users'));

CREATE POLICY profiles_update_own ON accounts.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- §45.1.11 / Block 07 requirement 13: external identities are NOT writable through
-- the API by any role. Only the trusted server layer, which bypasses RLS, writes them.
CREATE POLICY external_identities_read_own ON accounts.external_identities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission('admin.manage_users'));
-- Deliberately no INSERT, UPDATE or DELETE policy. Absence is the control.

-- ---------------------------------------------------------------------------
-- Workflow. Editorial, assignment-scoped. Never public.
-- ---------------------------------------------------------------------------
CREATE POLICY wf_states_read ON workflow.states
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY wf_transitions_read ON workflow.transitions
  FOR SELECT TO authenticated USING (private.has_permission('content.read_draft'));

CREATE POLICY wf_content_state_read ON workflow.content_state
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));
CREATE POLICY wf_content_state_write ON workflow.content_state
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any') OR private.is_assigned_to_version(version_id))
  WITH CHECK (private.has_permission('content.edit_any') OR private.is_assigned_to_version(version_id));

CREATE POLICY wf_assignments_read ON workflow.assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission('content.read_draft'));
CREATE POLICY wf_assignments_write ON workflow.assignments
  FOR ALL TO authenticated
  USING (private.has_permission('content.assign'))
  WITH CHECK (private.has_permission('content.assign'));

CREATE POLICY wf_reviews_read ON workflow.reviews
  FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid() OR private.has_permission('content.read_draft'));
CREATE POLICY wf_reviews_write ON workflow.reviews
  FOR ALL TO authenticated
  USING (private.has_permission('content.review') AND reviewer_id = auth.uid())
  WITH CHECK (private.has_permission('content.review') AND reviewer_id = auth.uid());

CREATE POLICY wf_approvals_read ON workflow.approvals
  FOR SELECT TO authenticated USING (private.has_permission('content.read_draft'));
CREATE POLICY wf_approvals_write ON workflow.approvals
  FOR ALL TO authenticated
  USING (private.has_permission('content.approve') AND approver_id = auth.uid())
  WITH CHECK (private.has_permission('content.approve') AND approver_id = auth.uid());

-- Editorial comments are internal and never publicly exposed.
CREATE POLICY wf_comments_read ON workflow.comments
  FOR SELECT TO authenticated
  USING (private.has_permission('content.read_draft') OR private.is_assigned_to_version(version_id));
CREATE POLICY wf_comments_write ON workflow.comments
  FOR ALL TO authenticated
  USING (author_id = auth.uid() OR private.has_permission('content.edit_any'))
  WITH CHECK (author_id = auth.uid() OR private.has_permission('content.edit_any'));

CREATE POLICY wf_tasks_read ON workflow.tasks
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR private.has_permission('content.read_draft'));
CREATE POLICY wf_tasks_write ON workflow.tasks
  FOR ALL TO authenticated
  USING (private.has_permission('content.assign') OR owner_id = auth.uid())
  WITH CHECK (private.has_permission('content.assign') OR owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Knowledge. Claims attached to a published version are public; draft claims are not.
-- ---------------------------------------------------------------------------
CREATE POLICY claims_read ON knowledge.claims
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));
CREATE POLICY claims_write ON knowledge.claims
  FOR ALL TO authenticated
  USING (private.can_write_version(version_id))
  WITH CHECK (private.can_write_version(version_id));

CREATE POLICY sources_read ON knowledge.sources
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY sources_write ON knowledge.sources
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any') OR private.has_permission('content.edit_assigned'))
  WITH CHECK (private.has_permission('content.edit_any') OR private.has_permission('content.edit_assigned'));

CREATE POLICY claim_sources_read ON knowledge.claim_sources
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM knowledge.claims c
                  WHERE c.id = claim_sources.claim_id
                    AND private.can_read_version(c.version_id)));
CREATE POLICY claim_sources_write ON knowledge.claim_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM knowledge.claims c
                  WHERE c.id = claim_sources.claim_id AND private.can_write_version(c.version_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM knowledge.claims c
                       WHERE c.id = claim_sources.claim_id AND private.can_write_version(c.version_id)));

-- A restricted dataset's existence may be advertised where its classification
-- permits, but its variables and files are not readable without entitlement.
CREATE POLICY datasets_read ON knowledge.datasets
  FOR SELECT TO anon, authenticated
  USING (
    access_classification = 'public'
    OR existence_is_public
    OR private.has_permission('asset.download_gated')
    OR private.has_permission('content.read_draft')
  );
CREATE POLICY datasets_write ON knowledge.datasets
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY dataset_versions_read ON knowledge.dataset_versions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM knowledge.datasets d
                  WHERE d.id = dataset_versions.dataset_id
                    AND (d.access_classification = 'public'
                         OR private.has_permission('asset.download_gated')
                         OR private.has_permission('content.read_draft'))));
CREATE POLICY dataset_versions_write ON knowledge.dataset_versions
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

-- Variables of a restricted dataset are NOT covered by existence_is_public.
CREATE POLICY dataset_variables_read ON knowledge.dataset_variables
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM knowledge.dataset_versions dv
                   JOIN knowledge.datasets d ON d.id = dv.dataset_id
                  WHERE dv.id = dataset_variables.dataset_version_id
                    AND (d.access_classification = 'public'
                         OR private.has_permission('asset.download_gated')
                         OR private.has_permission('content.read_draft'))));
CREATE POLICY dataset_variables_write ON knowledge.dataset_variables
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY analysis_methods_read ON knowledge.analysis_methods
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY analysis_methods_write ON knowledge.analysis_methods
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY analysis_runs_read ON knowledge.analysis_runs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY analysis_runs_write ON knowledge.analysis_runs
  FOR ALL TO authenticated
  USING (private.has_permission('content.edit_any'))
  WITH CHECK (private.has_permission('content.edit_any'));

CREATE POLICY figure_provenance_read ON knowledge.figure_provenance
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(version_id));
CREATE POLICY figure_provenance_write ON knowledge.figure_provenance
  FOR ALL TO authenticated
  USING (private.can_write_version(version_id))
  WITH CHECK (private.can_write_version(version_id));

-- ---------------------------------------------------------------------------
-- Audit. Append-only, administratively restricted (§45.1.9).
-- ---------------------------------------------------------------------------
CREATE POLICY audit_read_admin ON audit.events
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.read_audit'));

CREATE POLICY audit_insert ON audit.events
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);
-- Deliberately no UPDATE or DELETE policy, and the table triggers reject both even
-- for a BYPASSRLS role. Two independent controls.

-- ---------------------------------------------------------------------------
-- Grants. RLS filters rows; grants decide whether the role may attempt at all.
-- ---------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA cms, taxonomy, identity, knowledge, workflow TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA accounts TO authenticated;
GRANT INSERT ON audit.events TO anon, authenticated;
GRANT SELECT ON audit.events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cms, taxonomy, identity, knowledge, workflow TO authenticated;
GRANT UPDATE ON accounts.profiles TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cms, taxonomy, identity, knowledge, workflow, audit TO authenticated;
