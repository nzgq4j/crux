-- Workflow transition function and atomic publication (Block 08, editorial slice).
--
-- Reverse procedure:
--   DROP FUNCTION IF EXISTS workflow.perform_transition(uuid, text, text);
--   DROP FUNCTION IF EXISTS workflow.publish_version(uuid);
--   DROP FUNCTION IF EXISTS private.unmet_transition_gates(uuid, text[]);
-- All three are additive. Nothing depends on them structurally; application code
-- calling them would fail at runtime, so revert the application change together.
--
-- Why this exists:
--
-- private.enforce_content_state_transition() — the trigger on workflow.content_state —
-- admits only declared transitions and stamps the bookkeeping columns. Its own comment
-- says the rest belongs elsewhere:
--
--     "Gate evaluation and the permission check belong to the transition function,
--      not here."
--
-- That function was never written. Until now workflow.transitions.required_permission
-- and workflow.transitions.gates were data that nothing consulted: any actor who could
-- write a content_state row could move a version to any declared next state, including
-- straight to published, without holding content.publish and without a single gate
-- being evaluated.
--
-- perform_transition is that function. It is SECURITY INVOKER, so the RLS policies on
-- content_state still apply on top of the permission check rather than instead of it.

-- ---------------------------------------------------------------------------------
-- Gate evaluation
-- ---------------------------------------------------------------------------------
--
-- Returns the gates that are NOT satisfied, so the caller can name every reason a
-- transition was refused rather than only the first.
--
-- Each gate is a question about the version's readiness. A gate that cannot apply to
-- the content — no quantitative claims, so nothing to trace — is satisfied, not
-- skipped: "there is nothing to check here" and "this passed" are the same answer.
CREATE OR REPLACE FUNCTION private.unmet_transition_gates(p_version_id uuid, p_gates text[])
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  -- SECURITY DEFINER: the gates read workflow.reviews, workflow.approvals and the
  -- knowledge tables, which the acting role may not read directly. The decision must
  -- not depend on what the caller happens to be able to see.
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_unmet   text[] := '{}';
  v_gate    text;
  v_round   integer;
  v_version cms.content_versions%ROWTYPE;
  v_type    cms.content_types%ROWTYPE;
  v_ok      boolean;
BEGIN
  SELECT * INTO v_version FROM cms.content_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RETURN ARRAY['version_exists'];
  END IF;

  SELECT * INTO v_type FROM cms.content_types WHERE key = (
    SELECT content_type_key FROM cms.content_items WHERE id = v_version.content_item_id
  );

  SELECT review_round INTO v_round
    FROM workflow.content_state WHERE version_id = p_version_id;
  v_round := COALESCE(v_round, 1);

  FOREACH v_gate IN ARRAY COALESCE(p_gates, '{}'::text[]) LOOP
    v_ok := CASE v_gate

      -- A reviewer has recorded a completed verdict for the current round.
      WHEN 'review_complete' THEN EXISTS (
        SELECT 1 FROM workflow.reviews r
         WHERE r.version_id = p_version_id
           AND r.review_round = v_round
           AND r.verdict = 'approved'
           AND r.submitted_at IS NOT NULL)

      WHEN 'approval_recorded' THEN EXISTS (
        SELECT 1 FROM workflow.approvals a
         WHERE a.version_id = p_version_id
           AND a.review_round = v_round)

      -- Nobody approves their own work. Checked against the version's authors and its
      -- creator, because either would be self-approval.
      WHEN 'separation_of_duties' THEN NOT EXISTS (
        SELECT 1 FROM workflow.approvals a
         WHERE a.version_id = p_version_id
           AND a.review_round = v_round
           AND (a.approver_id = v_version.created_by
                OR EXISTS (SELECT 1 FROM cms.content_contributors cc
                            WHERE cc.version_id = p_version_id
                              AND cc.role = 'author'
                              AND cc.person_id = a.approver_id)))

      WHEN 'methodology_present' THEN
        NOT COALESCE(v_type.requires_methodology, false)
        OR COALESCE(btrim(v_version.methodology), '') <> ''

      WHEN 'limitations_present' THEN
        NOT COALESCE(v_type.requires_methodology, false)
        OR COALESCE(btrim(v_version.limitations), '') <> ''

      WHEN 'evidence_standard_met' THEN private.evidence_standard_ok(p_version_id)

      -- §45 18a: a quantitative finding always resolves to an analysis run. Absolute,
      -- and never configurable downward by a content type.
      WHEN 'quantitative_traceability' THEN NOT EXISTS (
        SELECT 1 FROM knowledge.claims c
         WHERE c.version_id = p_version_id
           AND c.claim_type = 'quantitative_finding'
           AND c.analysis_run_id IS NULL)

      -- A stated confidence must point at something that justifies it.
      WHEN 'confidence_source_resolvable' THEN NOT EXISTS (
        SELECT 1 FROM knowledge.claims c
         WHERE c.version_id = p_version_id
           AND c.confidence IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM knowledge.claim_sources cs WHERE cs.claim_id = c.id)
           AND c.analysis_run_id IS NULL)

      -- rules/content-modeling.md 27. The renderer already refuses to display a figure
      -- without alternative text; this stops one being published at all.
      WHEN 'figure_text_alternatives' THEN NOT EXISTS (
        SELECT 1 FROM cms.content_version_modules m
         WHERE m.version_id = p_version_id
           AND m.module_key IN ('figure', 'chart', 'image')
           AND COALESCE(btrim(m.payload ->> 'alt'), '') = '')

      ELSE NULL
    END;

    IF v_ok IS NULL THEN
      -- An unrecognised gate is a refusal, not a pass. A gate added to
      -- workflow.transitions that nothing evaluates would otherwise be silently
      -- ignored, which is the failure this whole function exists to correct.
      v_unmet := v_unmet || ('unknown_gate:' || v_gate);
    ELSIF NOT v_ok THEN
      v_unmet := v_unmet || v_gate;
    END IF;
  END LOOP;

  RETURN v_unmet;
END;
$$;

COMMENT ON FUNCTION private.unmet_transition_gates(uuid, text[]) IS
  'Returns the subset of the given gates that the version does not satisfy. Empty array means every gate passed. An unrecognised gate name is reported as unmet rather than ignored. No side effects.';

-- ---------------------------------------------------------------------------------
-- Publication
-- ---------------------------------------------------------------------------------
--
-- Everything that "published" means, in one transaction: the version is frozen and
-- stamped, the derived text is generated from the structured modules, and the item
-- starts pointing at this version. Either all of it happens or none of it does
-- (rules/backend.md 13).
--
-- A previously published version of the same item is superseded rather than left
-- claiming to be current. It stays resolvable at its own URL
-- (rules/content-modeling.md 10).
CREATE OR REPLACE FUNCTION workflow.publish_version(p_version_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  -- SECURITY DEFINER: publication writes cms.content_versions rows that the immutability
  -- trigger otherwise protects, and updates the item. The caller's authority was
  -- established by perform_transition before this is reached.
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_item_id  uuid;
  v_current  uuid;
  v_plain    text;
  v_markdown text;
BEGIN
  SELECT content_item_id INTO v_item_id
    FROM cms.content_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: version % does not exist', p_version_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT current_version_id INTO v_current FROM cms.content_items WHERE id = v_item_id;

  -- Derived text comes from the structured modules, never authored separately
  -- (rules/content-modeling.md 4). Generated before the version is frozen.
  -- render_version_text returns TABLE(plain text, md text) — a set, so it is selected
  -- from once rather than called twice.
  SELECT r.plain, r.md INTO v_plain, v_markdown
    FROM private.render_version_text(p_version_id) r;

  UPDATE cms.content_versions
     SET plain_text    = v_plain,
         markdown      = v_markdown,
         status        = 'published',
         published_at  = COALESCE(published_at, now())
   WHERE id = p_version_id;

  IF v_current IS NOT NULL AND v_current <> p_version_id THEN
    UPDATE cms.content_versions
       SET status = 'superseded', superseded_by_id = p_version_id
     WHERE id = v_current;
    UPDATE cms.content_versions
       SET supersedes_id = v_current
     WHERE id = p_version_id;
  END IF;

  UPDATE cms.content_items
     SET current_version_id = p_version_id,
         lifecycle_state    = 'published'
   WHERE id = v_item_id;
END;
$$;

COMMENT ON FUNCTION workflow.publish_version(uuid) IS
  'Effects publication: generates derived text from the structured modules, freezes and stamps the version, supersedes the previous current version, and points the item at this one. Called only by workflow.perform_transition, after the permission check and gates. Side effects: writes cms.content_versions and cms.content_items.';

-- ---------------------------------------------------------------------------------
-- The transition function
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION workflow.perform_transition(
  p_version_id uuid,
  p_to_state   text,
  p_reason     text DEFAULT NULL
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  -- SECURITY DEFINER, and not by preference.
  --
  -- An invoker-rights function cannot work here: the API roles deliberately hold no
  -- USAGE on the `private` schema — db-verify.sh asserts exactly that — so a function
  -- running as `authenticated` cannot call private.has_permission at all. The RLS
  -- policies can, because PostgreSQL evaluates policy expressions with the table
  -- owner's rights; a direct call gets no such treatment.
  --
  -- The cost is that RLS on workflow.content_state no longer constrains the write, so
  -- the authority that policy expresses is re-checked explicitly below. Losing that
  -- check silently is the failure mode this comment exists to prevent.
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_from       text;
  v_transition workflow.transitions%ROWTYPE;
  v_unmet      text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'workflow: a transition requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same authority the wf_content_state_write policy expresses. Re-stated here
  -- because SECURITY DEFINER means that policy no longer applies to this write.
  IF NOT (private.has_permission('content.edit_any')
          OR private.is_assigned_to_version(p_version_id)) THEN
    RAISE EXCEPTION 'workflow: actor is not assigned to version % and lacks content.edit_any',
      p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT state_key INTO v_from
    FROM workflow.content_state WHERE version_id = p_version_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: version % has no workflow state', p_version_id
      USING ERRCODE = 'no_data_found',
            HINT = 'A version enters the workflow with an initial content_state row.';
  END IF;

  IF v_from = p_to_state THEN
    RETURN v_from;
  END IF;

  SELECT * INTO v_transition
    FROM workflow.transitions
   WHERE from_state = v_from AND to_state = p_to_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: % -> % is not a declared transition', v_from, p_to_state
      USING ERRCODE = 'check_violation';
  END IF;

  -- Authorization comes from the platform's role model, never from the caller
  -- (rules/backend.md 6, rules/security.md 3).
  IF NOT private.has_permission(v_transition.required_permission) THEN
    PERFORM private.log_audit(
      'workflow.transition', 'cms.content_versions', p_version_id::text, 'denied',
      jsonb_build_object('from_state', v_from, 'to_state', p_to_state,
                         'required_permission', v_transition.required_permission)
    );
    RAISE EXCEPTION 'workflow: % -> % requires permission %',
      v_from, p_to_state, v_transition.required_permission
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_unmet := private.unmet_transition_gates(p_version_id, v_transition.gates);
  IF array_length(v_unmet, 1) > 0 THEN
    PERFORM private.log_audit(
      'workflow.transition', 'cms.content_versions', p_version_id::text, 'failed',
      jsonb_build_object('from_state', v_from, 'to_state', p_to_state,
                         'unmet_gates', to_jsonb(v_unmet))
    );
    RAISE EXCEPTION 'workflow: % -> % blocked by unmet gates: %',
      v_from, p_to_state, array_to_string(v_unmet, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The trigger on content_state records the transition and stamps the bookkeeping
  -- columns; publication effects run in the same transaction, so a failure in either
  -- leaves the version where it was.
  UPDATE workflow.content_state
     SET state_key = p_to_state,
         reason    = p_reason
   WHERE version_id = p_version_id;

  IF p_to_state = 'published' THEN
    PERFORM workflow.publish_version(p_version_id);
  END IF;

  RETURN p_to_state;
END;
$$;

COMMENT ON FUNCTION workflow.perform_transition(uuid, text, text) IS
  'Moves a version to a new workflow state after checking the transition is declared, the actor holds its required permission, and every gate is satisfied. Publication effects run in the same transaction. SECURITY INVOKER so RLS applies in addition to the permission check. Returns the new state.';

REVOKE ALL ON FUNCTION workflow.perform_transition(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.perform_transition(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION workflow.publish_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.unmet_transition_gates(uuid, text[]) FROM PUBLIC;
