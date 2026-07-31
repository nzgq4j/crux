-- Privileged access authorization (Workstream 3).
--
-- Reverse procedure:
--   DROP FUNCTION IF EXISTS private.actor_has_permission(uuid, text);
--   DROP FUNCTION IF EXISTS private.log_privileged_audit(uuid, text, text, text, text, text, jsonb);
-- Both functions are additive and nothing depends on them structurally, so dropping
-- them restores the previous state exactly. Application code calling them would then
-- fail at runtime, so revert the application change in the same deployment.
--
-- Why this exists:
--
-- `private.has_permission(text)` resolves the actor with `auth.uid()`, reading the
-- `request.jwt.claims` GUC of the current session. That is correct for RLS policies,
-- where the session identity IS the subject of the decision.
--
-- It is the wrong shape for the privileged server path. There the session runs as
-- `service_role` — which has no `auth.uid()` — while the actor whose authority is
-- being tested is supplied by the trusted server layer. Reading the decision from
-- session state the caller has just set would make the check circular.
--
-- So the actor is a parameter, and the decision is still taken in the database from
-- the platform's own role model rather than from anything the caller asserts
-- (rules/backend.md 6, rules/security.md 3).

CREATE OR REPLACE FUNCTION private.actor_has_permission(p_actor uuid, p_permission text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  -- SECURITY DEFINER is required: identity.user_roles and identity.role_permissions
  -- are not readable by the roles that need this decision. search_path is pinned so
  -- the body cannot be redirected by a caller-controlled path (rules/database.md 9).
  SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM identity.user_roles ur
      JOIN identity.role_permissions rp ON rp.role_key = ur.role_key
     WHERE ur.user_id = p_actor
       AND rp.permission_key = p_permission
  );
$$;

COMMENT ON FUNCTION private.actor_has_permission(uuid, text) IS
  'Does the named actor hold the named permission? Explicit-actor counterpart to '
  'private.has_permission, for the trusted server layer where the session runs as '
  'service_role and auth.uid() is absent. Inputs: actor id, permission key. Returns '
  'boolean. No side effects. SECURITY DEFINER with a pinned search_path because the '
  'identity tables are not readable by the calling role.';

-- A null actor can hold no permission. Stated explicitly because the SQL above would
-- return false for a null actor anyway, and a reader should not have to derive that
-- from three-valued logic.
REVOKE ALL ON FUNCTION private.actor_has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.actor_has_permission(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------------
-- Audit writing for the privileged path.
--
-- `private.log_audit` takes the actor from `auth.uid()`, which is null in a
-- service_role session for the same reason `has_permission` was unusable there. This
-- variant takes the actor explicitly, so a privileged operation records who it was
-- performed on behalf of rather than recording no actor at all.
--
-- The decision vocabulary stays the table's: allowed, denied, performed, failed.
-- Keeping the INSERT here rather than in application code means the check constraint
-- is the single authority on what a decision may be.
-- ---------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.log_privileged_audit(
  p_actor         uuid,
  p_action        text,
  p_resource_type text,
  p_resource_id   text,
  p_decision      text,
  p_request_id    text,
  p_detail        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- SECURITY DEFINER so the audit row is written even where the calling role lacks a
-- direct INSERT grant. search_path is pinned (rules/database.md 9). The append-only
-- triggers still apply: this function can insert, and nothing can update or delete.
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO audit.events
    (actor_id, actor_label, action, resource_type, resource_id, decision, request_id, detail)
  VALUES (
    p_actor,
    'service_role',
    p_action,
    p_resource_type,
    p_resource_id,
    p_decision,
    p_request_id,
    coalesce(p_detail, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION private.log_privileged_audit(uuid, text, text, text, text, text, jsonb) IS
  'Writes an append-only audit row for a privileged operation, with the actor supplied '
  'explicitly rather than read from auth.uid(). For the trusted server layer, where the '
  'session runs as service_role. Side effect: one INSERT into audit.events. SECURITY '
  'DEFINER with a pinned search_path.';

REVOKE ALL ON FUNCTION private.log_privileged_audit(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.log_privileged_audit(uuid, text, text, text, text, text, jsonb) TO service_role;
