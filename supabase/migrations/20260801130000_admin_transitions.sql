-- Block 09 — What the editorial surface may show about a version's next moves.
--
-- Reverse: DROP FUNCTION workflow.available_transitions(uuid);
--
-- Why this function exists.
--
-- The administrative interface needs to answer "what can I do with this version, and
-- if I cannot publish it, why not?". Both halves of that answer live behind
-- `private`: `private.has_permission` and `private.unmet_transition_gates`. The API
-- roles hold no USAGE on that schema — db-verify.sh asserts it — so a query issued as
-- `authenticated` cannot call either.
--
-- The alternative is re-implementing gate evaluation in TypeScript. That is worse than
-- it looks: a second implementation drifts from the first, and the interface then
-- offers a transition the database refuses, or hides one it would allow. The gate
-- vocabulary is closed and enforced in SQL; there should be exactly one evaluator.
--
-- This function discloses nothing the caller could not obtain by attempting each
-- transition and reading the error. It is a preview of a decision, never the decision:
-- workflow.perform_transition re-checks permission and gates for itself.

CREATE OR REPLACE FUNCTION workflow.available_transitions(p_version_id uuid)
  RETURNS TABLE (
    to_state            text,
    to_state_name       text,
    required_permission text,
    requires_reason     boolean,
    gates               text[],
    description         text,
    permitted           boolean,
    unmet_gates         text[]
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  -- SECURITY DEFINER for schema reach, not for privilege escalation. The caller's own
  -- authority is what is reported: private.has_permission reads auth.uid(), which
  -- SECURITY DEFINER does not change. A caller cannot learn another user's permissions
  -- through this function.
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- Refuse an anonymous caller outright. Without this the function would report the
  -- transition set to anyone who could reach it, which is a map of the editorial
  -- machinery handed to an unauthenticated client.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'workflow: available_transitions requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reading a version's editorial options is reading unpublished editorial state.
  IF NOT private.has_permission('content.read_draft') THEN
    RAISE EXCEPTION 'workflow: available_transitions requires content.read_draft'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT t.to_state,
         ws.name,
         t.required_permission,
         t.requires_reason,
         t.gates,
         t.description,
         private.has_permission(t.required_permission),
         private.unmet_transition_gates(p_version_id, t.gates)
    FROM workflow.content_state cs
    JOIN workflow.transitions t ON t.from_state = cs.state_key
    JOIN workflow.states ws     ON ws.key = t.to_state
   WHERE cs.version_id = p_version_id
   ORDER BY ws.position;
END;
$$;

REVOKE ALL ON FUNCTION workflow.available_transitions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workflow.available_transitions(uuid) TO authenticated;

COMMENT ON FUNCTION workflow.available_transitions(uuid) IS
  'Preview of the moves available from a version''s current state, with the gates each would fail. SECURITY DEFINER for reach into the private schema only; reports the calling user''s own authority and refuses an anonymous or non-editorial caller. Never a substitute for the check in workflow.perform_transition.';
