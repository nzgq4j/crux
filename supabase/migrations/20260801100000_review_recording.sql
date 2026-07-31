-- Authorized review recording, and a non-superuser owner for the definer functions.
--
-- Reverse procedure:
--   DROP FUNCTION IF EXISTS workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text);
--   ALTER FUNCTION workflow.perform_transition(uuid, text, text) OWNER TO postgres;
--   ALTER FUNCTION workflow.publish_version(uuid) OWNER TO postgres;
--   ALTER FUNCTION private.unmet_transition_gates(uuid, text[]) OWNER TO postgres;
--   DROP POLICY IF EXISTS wf_reviews_write ON workflow.reviews;
--   CREATE POLICY wf_reviews_write ON workflow.reviews FOR ALL
--     USING (private.has_permission('content.review') AND reviewer_id = auth.uid())
--     WITH CHECK (private.has_permission('content.review') AND reviewer_id = auth.uid());
--   DROP OWNED BY crux_definer; DROP ROLE IF EXISTS crux_definer;
-- Reverting restores direct authenticated insertion into workflow.reviews and returns
-- the definer functions to superuser ownership. Do both together or neither.

-- ---------------------------------------------------------------------------------
-- 1. A non-superuser owner for SECURITY DEFINER functions
-- ---------------------------------------------------------------------------------
--
-- The definer functions were owned by `postgres`, so they executed with superuser
-- rights: far more than any of them needs, and an escalation surface if one is ever
-- made to do something unintended.
--
-- `crux_definer` owns them instead. It cannot log in, is not a superuser, cannot
-- create roles or databases, and holds only the privileges the function bodies
-- actually exercise.
--
-- BYPASSRLS is granted deliberately. These functions must write rows that row-level
-- policies would otherwise refuse — publication updates a version the policies protect
-- — which is precisely why they are definer functions rather than ordinary ones. That
-- was already true when the owner was a superuser; the difference is that it is now
-- the *only* elevated attribute the owner holds, rather than one of many. The tests
-- assert that the role has no others.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crux_definer') THEN
    CREATE ROLE crux_definer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END $$;

COMMENT ON ROLE crux_definer IS
  'Owns the SECURITY DEFINER functions so they do not execute with superuser rights. NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE. BYPASSRLS only, because the functions exist to perform writes that row-level policies refuse.';

GRANT USAGE ON SCHEMA private, workflow, cms, identity, knowledge, audit, auth, search TO crux_definer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workflow TO crux_definer;
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA cms TO crux_definer;
GRANT SELECT ON ALL TABLES IN SCHEMA identity, knowledge TO crux_definer;
GRANT INSERT ON audit.events TO crux_definer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO crux_definer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO crux_definer;
-- Publication fires the search-indexing trigger on cms.content_versions, so the owner
-- must be able to write the index rows the trigger produces.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA search TO crux_definer;

-- ---------------------------------------------------------------------------------
-- 2. Review recording
-- ---------------------------------------------------------------------------------
--
-- Recording a review was previously a direct INSERT permitted by RLS to anyone holding
-- content.review. That policy could express "who" but not "when" or "about what": it
-- could not tell whether the version was actually under review, whether the round was
-- current, or whether the reviewer had already given a verdict for it.
--
-- The write is now closed to the API roles entirely (see 3 below) and routed through
-- this function, which is the only path.
--
-- The review round is derived from workflow.content_state rather than accepted as an
-- argument. A caller cannot nominate the round it wants to be reviewing, which removes
-- the whole class of stale and back-dated reviews rather than validating against it.
CREATE OR REPLACE FUNCTION workflow.record_review(
  p_version_id          uuid,
  p_verdict             text,
  p_evidence_sufficient boolean,
  p_citations_valid     boolean,
  p_methodology_present boolean,
  p_limitations_present boolean,
  p_figures_accessible  boolean,
  p_notes               text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_state   workflow.content_state%ROWTYPE;
  v_review  uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'workflow: recording a review requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Authorization from the platform's role model, never from the caller.
  IF NOT private.has_permission('content.review') THEN
    PERFORM private.log_audit(
      'workflow.review_recorded', 'cms.content_versions', p_version_id::text, 'denied',
      jsonb_build_object('reason', 'missing content.review')
    );
    RAISE EXCEPTION 'workflow: recording a review requires permission content.review'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_verdict IS NULL OR p_verdict NOT IN ('approved', 'changes_requested', 'rejected') THEN
    RAISE EXCEPTION 'workflow: verdict must be approved, changes_requested or rejected'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The version must exist and be under review right now. A review against a version
  -- in any other state is stale by definition.
  SELECT * INTO v_state FROM workflow.content_state WHERE version_id = p_version_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: version % has no workflow state', p_version_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_state.state_key <> 'in_review' THEN
    RAISE EXCEPTION
      'workflow: version % is in state % and is not under review', p_version_id, v_state.state_key
      USING ERRCODE = 'check_violation',
            HINT = 'A review can only be recorded while the version is in_review.';
  END IF;

  -- §45.1.5, also enforced by the reviews_separation_of_duties trigger. Checked here
  -- too so the refusal is attributable to this action and is audited as a denial.
  IF private.is_version_author(p_version_id, v_actor) THEN
    PERFORM private.log_audit(
      'workflow.review_recorded', 'cms.content_versions', p_version_id::text, 'denied',
      jsonb_build_object('reason', 'author may not review own version')
    );
    RAISE EXCEPTION 'workflow: an author may not review their own version'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One verdict per reviewer per round. Deterministic by refusal rather than by
  -- overwrite: a recorded verdict is evidence, and silently replacing it would lose
  -- the fact that the reviewer changed their mind. A new round takes a new verdict.
  IF EXISTS (
    SELECT 1 FROM workflow.reviews r
     WHERE r.version_id = p_version_id
       AND r.reviewer_id = v_actor
       AND r.review_round = v_state.review_round
  ) THEN
    RAISE EXCEPTION
      'workflow: reviewer has already recorded a verdict for version % round %',
      p_version_id, v_state.review_round
      USING ERRCODE = 'unique_violation',
            HINT = 'A further verdict requires a new review round.';
  END IF;

  INSERT INTO workflow.reviews (
    version_id, reviewer_id, review_round, review_type, verdict,
    evidence_sufficient, citations_valid, methodology_present,
    limitations_present, figures_accessible, notes, submitted_at
  ) VALUES (
    p_version_id, v_actor, v_state.review_round, 'editorial', p_verdict,
    COALESCE(p_evidence_sufficient, false), COALESCE(p_citations_valid, false),
    COALESCE(p_methodology_present, false), COALESCE(p_limitations_present, false),
    COALESCE(p_figures_accessible, false), p_notes, now()
  )
  RETURNING id INTO v_review;

  -- Same transaction as the insert: if this fails the review is not recorded.
  PERFORM private.log_audit(
    'workflow.review_recorded', 'cms.content_versions', p_version_id::text, 'performed',
    jsonb_build_object('review_id', v_review, 'verdict', p_verdict,
                       'review_round', v_state.review_round)
  );

  RETURN v_review;
END;
$$;

COMMENT ON FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text) IS
  'Records an editorial review for a version that is currently in_review. Verifies content.review, refuses an author reviewing their own version, derives the round from workflow.content_state so it cannot be nominated by the caller, refuses a second verdict from the same reviewer in the same round, and writes the audit row in the same transaction. Returns the review id.';

REVOKE ALL ON FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- 3. Close direct insertion
-- ---------------------------------------------------------------------------------
--
-- wf_reviews_write allowed any holder of content.review to INSERT, UPDATE or DELETE
-- their own review rows directly. That made every check in record_review optional: a
-- reviewer could write a verdict against a draft, a superseded version, or a round
-- that had already closed, simply by inserting the row themselves.
--
-- Reads are unchanged. Writes now have exactly one path.
DROP POLICY IF EXISTS wf_reviews_write ON workflow.reviews;

COMMENT ON TABLE workflow.reviews IS
  'Editorial review verdicts. No INSERT, UPDATE or DELETE policy exists for the API roles: the absence is the control. Writes go through workflow.record_review, which validates state, round and separation of duties. Reads remain governed by wf_reviews_read.';

-- ---------------------------------------------------------------------------------
-- 4. Hand the definer functions to the non-superuser owner
-- ---------------------------------------------------------------------------------
ALTER FUNCTION private.unmet_transition_gates(uuid, text[]) OWNER TO crux_definer;
ALTER FUNCTION workflow.publish_version(uuid) OWNER TO crux_definer;
ALTER FUNCTION workflow.perform_transition(uuid, text, text) OWNER TO crux_definer;
ALTER FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text)
  OWNER TO crux_definer;

-- Ownership changes reset the ACL, so restate the grants.
REVOKE ALL ON FUNCTION workflow.perform_transition(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.perform_transition(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION workflow.publish_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.unmet_transition_gates(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.record_review(uuid, text, boolean, boolean, boolean, boolean, boolean, text)
  TO authenticated, service_role;
