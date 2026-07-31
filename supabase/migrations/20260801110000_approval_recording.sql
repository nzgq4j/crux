-- Authorized approval recording.
--
-- Reverse procedure:
--   DROP FUNCTION IF EXISTS workflow.record_approval(uuid, uuid, uuid, text, text, jsonb);
--   ALTER TABLE workflow.approvals DROP COLUMN IF EXISTS decision;
--   (and restore the approval_recorded gate from 20260801090000, which this migration
--    replaces to read the decision column)
--   CREATE POLICY wf_approvals_write ON workflow.approvals FOR ALL
--     USING (private.has_permission('content.approve') AND approver_id = auth.uid())
--     WITH CHECK (private.has_permission('content.approve') AND approver_id = auth.uid());
-- Reverting restores direct authenticated insertion into workflow.approvals. Revert the
-- application change in the same deployment.
--
-- Why this exists:
--
-- workflow.approvals had the shape of problem workflow.reviews had before
-- record_review: wf_approvals_write let any holder of content.approve INSERT, UPDATE or
-- DELETE their own approval rows. A policy can express *who* may write, but not *when*,
-- *about what*, or *on what basis*. It could not tell whether the version was under
-- review, whether it had been superseded, or whether any review had actually been
-- completed — so an approver could record an approval against a version nobody had
-- reviewed, and the approval_recorded gate would then pass.
--
-- The separation-of-duties trigger and the read policy are untouched. The write policy
-- is removed, which narrows access rather than widening it.

-- ---------------------------------------------------------------------------------
-- 1. The decision
-- ---------------------------------------------------------------------------------
--
-- The table recorded that an approval existed but not what was decided, so a reversal
-- was indistinguishable from a second endorsement. A decision column makes a
-- conflicting outcome expressible, and therefore refusable.
ALTER TABLE workflow.approvals
  ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_decision_check'
  ) THEN
    ALTER TABLE workflow.approvals
      ADD CONSTRAINT approvals_decision_check CHECK (decision IN ('approved', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN workflow.approvals.decision IS
  'The outcome recorded by the approver: approved or rejected. Only an approved decision satisfies the approval_recorded gate.';

-- ---------------------------------------------------------------------------------
-- 2. The authorized action
-- ---------------------------------------------------------------------------------
--
-- The actor is a parameter *and* is checked against auth.uid(). The caller states who
-- it believes it is acting as, and a disagreement is a refusal — the argument is a
-- consistency check, never a way to nominate an identity. Everything that decides the
-- outcome is read from the database.
--
-- The review round is derived from workflow.content_state, so a caller cannot approve
-- a round other than the one currently open.
CREATE OR REPLACE FUNCTION workflow.record_approval(
  p_actor      uuid,
  p_item_id    uuid,
  p_version_id uuid,
  p_decision   text,
  p_request_id text,
  p_rationale  jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_state    workflow.content_state%ROWTYPE;
  v_version  cms.content_versions%ROWTYPE;
  v_review   workflow.reviews%ROWTYPE;
  v_existing workflow.approvals%ROWTYPE;
  v_approval uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'workflow: recording an approval requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The declared actor must be the acting one. This is not how authorization is
  -- decided — auth.uid() is — but a mismatch means the caller has lost track of whose
  -- authority it is exercising, which is never safe to proceed through.
  IF p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'workflow: declared actor does not match the authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT private.has_permission('content.approve') THEN
    RAISE EXCEPTION 'workflow: recording an approval requires permission content.approve'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'workflow: decision must be approved or rejected'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(btrim(p_request_id), '') = '' THEN
    RAISE EXCEPTION 'workflow: recording an approval requires a request id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A rationale is structured so it can be queried later, and non-empty so the record
  -- says something. An approval with no stated basis is the thing this action exists
  -- to stop being possible.
  IF p_rationale IS NULL
     OR jsonb_typeof(p_rationale) <> 'object'
     OR p_rationale = '{}'::jsonb THEN
    RAISE EXCEPTION 'workflow: recording an approval requires a structured rationale object'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_version FROM cms.content_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: version % does not exist', p_version_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The version must belong to the item the caller named. A mismatch means the caller
  -- is approving something other than what it thinks it is.
  IF v_version.content_item_id IS DISTINCT FROM p_item_id THEN
    RAISE EXCEPTION 'workflow: version % does not belong to item %', p_version_id, p_item_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stale or superseded: a version that has already been published, superseded or
  -- withdrawn is not a thing that can be approved.
  IF v_version.status <> 'draft' OR v_version.superseded_by_id IS NOT NULL THEN
    RAISE EXCEPTION
      'workflow: version % has status % and cannot be approved', p_version_id, v_version.status
      USING ERRCODE = 'check_violation',
            HINT = 'Only a version that has not yet been published can be approved.';
  END IF;

  SELECT * INTO v_state FROM workflow.content_state WHERE version_id = p_version_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow: version % has no workflow state', p_version_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_state.state_key <> 'in_review' THEN
    RAISE EXCEPTION
      'workflow: version % is in state % and is not awaiting approval',
      p_version_id, v_state.state_key
      USING ERRCODE = 'check_violation',
            HINT = 'An approval can only be recorded while the version is in_review.';
  END IF;

  -- An approval rests on a review. Without one there is nothing to approve, and the
  -- approval_recorded gate would otherwise pass on an unreviewed version.
  SELECT * INTO v_review
    FROM workflow.reviews r
   WHERE r.version_id = p_version_id
     AND r.review_round = v_state.review_round
     AND r.verdict = 'approved'
     AND r.submitted_at IS NOT NULL
   ORDER BY r.submitted_at
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'workflow: version % round % has no completed approving review',
      p_version_id, v_state.review_round
      USING ERRCODE = 'check_violation',
            HINT = 'Record a review with an approved verdict before approving.';
  END IF;

  -- §45.1.5, also enforced by approvals_separation_of_duties. Checked here so the
  -- refusal is attributable to this action; the trigger remains the backstop for any
  -- row that reaches the table another way.
  IF private.is_version_author(p_version_id, v_actor) THEN
    RAISE EXCEPTION 'workflow: an author may not approve their own version'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_review.reviewer_id = v_actor THEN
    RAISE EXCEPTION 'workflow: the reviewer of record may not also approve'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One approval per round. A second is refused whatever it says; when it says
  -- something different the message names the conflict, because a reversal and a
  -- rubber stamp are different mistakes.
  SELECT * INTO v_existing
    FROM workflow.approvals a
   WHERE a.version_id = p_version_id AND a.review_round = v_state.review_round
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.decision IS DISTINCT FROM p_decision THEN
      RAISE EXCEPTION
        'workflow: version % round % is already recorded as % and cannot also be recorded as %',
        p_version_id, v_state.review_round, v_existing.decision, p_decision
        USING ERRCODE = 'unique_violation',
              HINT = 'A different outcome requires a new review round.';
    END IF;
    RAISE EXCEPTION
      'workflow: version % round % already has a recorded approval',
      p_version_id, v_state.review_round
      USING ERRCODE = 'unique_violation',
            HINT = 'A further decision requires a new review round.';
  END IF;

  INSERT INTO workflow.approvals (
    version_id, review_id, review_round, approver_id, approval_scope, decision, notes
  ) VALUES (
    p_version_id, v_review.id, v_state.review_round, v_actor, 'final', p_decision,
    p_rationale ->> 'summary'
  )
  RETURNING id INTO v_approval;

  -- Same transaction as the insert: if this fails, the approval does not exist.
  PERFORM private.log_privileged_audit(
    v_actor,
    'workflow.approval_recorded',
    'cms.content_versions',
    p_version_id::text,
    CASE WHEN p_decision = 'approved' THEN 'performed' ELSE 'denied' END,
    btrim(p_request_id),
    jsonb_build_object(
      'approval_id',  v_approval,
      'item_id',      p_item_id,
      'decision',     p_decision,
      'review_id',    v_review.id,
      'review_round', v_state.review_round,
      'rationale',    p_rationale
    )
  );

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION workflow.record_approval(uuid, uuid, uuid, text, text, jsonb) IS
  'Records an editorial approval for a version that is in_review and has a completed approving review. Verifies content.approve, that the declared actor is the authenticated one, that the version belongs to the named item and is not stale, and that the actor is neither an author nor the reviewer of record. Derives the round from workflow.content_state. Refuses a second decision for the same round, naming a conflicting outcome specifically. Writes the audit row in the same transaction. Returns the approval id.';

ALTER FUNCTION workflow.record_approval(uuid, uuid, uuid, text, text, jsonb) OWNER TO crux_definer;
REVOKE ALL ON FUNCTION workflow.record_approval(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.record_approval(uuid, uuid, uuid, text, text, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- 3. Close direct insertion
-- ---------------------------------------------------------------------------------
--
-- Narrowing, not weakening: the write policy is removed so the function is the only
-- path. wf_approvals_read and approvals_separation_of_duties are unchanged.
DROP POLICY IF EXISTS wf_approvals_write ON workflow.approvals;

COMMENT ON TABLE workflow.approvals IS
  'Editorial approvals. No INSERT, UPDATE or DELETE policy exists for the API roles: the absence is the control. Writes go through workflow.record_approval, which validates state, staleness, the underlying review, separation of duties and conflicting decisions. Reads remain governed by wf_approvals_read.';

-- ---------------------------------------------------------------------------------
-- 4. The approval_recorded gate must read the decision
-- ---------------------------------------------------------------------------------
--
-- Found by tests/db/approval-recording.test.ts. The gate asked only whether an
-- approvals row existed for the round, which was the only question it could ask before
-- this migration added a decision column. With one, an approval that *rejected* the
-- version satisfied the gate and publication proceeded — the exact opposite of the
-- outcome recorded.
--
-- Only an approved decision counts. Replaced wholesale rather than edited in place,
-- because 20260801090000 is already applied and the migration ledger refuses a change
-- to an applied file.
CREATE OR REPLACE FUNCTION private.unmet_transition_gates(p_version_id uuid, p_gates text[])
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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

      WHEN 'review_complete' THEN EXISTS (
        SELECT 1 FROM workflow.reviews r
         WHERE r.version_id = p_version_id
           AND r.review_round = v_round
           AND r.verdict = 'approved'
           AND r.submitted_at IS NOT NULL)

      -- The decision, not merely the row.
      WHEN 'approval_recorded' THEN EXISTS (
        SELECT 1 FROM workflow.approvals a
         WHERE a.version_id = p_version_id
           AND a.review_round = v_round
           AND a.decision = 'approved')

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

      WHEN 'quantitative_traceability' THEN NOT EXISTS (
        SELECT 1 FROM knowledge.claims c
         WHERE c.version_id = p_version_id
           AND c.claim_type = 'quantitative_finding'
           AND c.analysis_run_id IS NULL)

      WHEN 'confidence_source_resolvable' THEN NOT EXISTS (
        SELECT 1 FROM knowledge.claims c
         WHERE c.version_id = p_version_id
           AND c.confidence IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM knowledge.claim_sources cs WHERE cs.claim_id = c.id)
           AND c.analysis_run_id IS NULL)

      WHEN 'figure_text_alternatives' THEN NOT EXISTS (
        SELECT 1 FROM cms.content_version_modules m
         WHERE m.version_id = p_version_id
           AND m.module_key IN ('figure', 'chart', 'image')
           AND COALESCE(btrim(m.payload ->> 'alt'), '') = '')

      ELSE NULL
    END;

    IF v_ok IS NULL THEN
      v_unmet := v_unmet || ('unknown_gate:' || v_gate);
    ELSIF NOT v_ok THEN
      v_unmet := v_unmet || v_gate;
    END IF;
  END LOOP;

  RETURN v_unmet;
END;
$$;

ALTER FUNCTION private.unmet_transition_gates(uuid, text[]) OWNER TO crux_definer;
REVOKE ALL ON FUNCTION private.unmet_transition_gates(uuid, text[]) FROM PUBLIC;
