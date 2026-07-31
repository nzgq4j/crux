-- Block 06 / Block 08 — permission vocabulary reconciliation
--
-- WHY THIS EXISTS
-- The workflow migration seeded its own permission keys into identity.permissions so
-- that workflow.transitions.required_permission could be a real foreign key. Block 06
-- owns that table and had already seeded a canonical vocabulary, so the two sets
-- overlapped and diverged:
--
--   content.edit               near-duplicate of content.edit_any / content.edit_assigned
--   content.submit_for_review  near-duplicate of content.submit_review
--   content.schedule           no equivalent; scheduling is part of publishing
--
-- None of the three was granted to any role, yet transitions required them. The
-- effect was a silent deadlock: those transitions could never be performed by anyone,
-- and nothing surfaced the fact. Near-duplicate permission keys are also a security
-- smell in their own right — a reader cannot tell which key a policy actually checks.
--
-- This migration makes the Block 06 vocabulary canonical and removes the duplicates.
--
-- Reverse: re-insert the three permission rows and restore the previous
-- required_permission values. Non-destructive to any grant, because none existed.

-- 1. Point transitions at the canonical keys.
UPDATE workflow.transitions SET required_permission = 'content.edit_assigned'
 WHERE required_permission = 'content.edit';

UPDATE workflow.transitions SET required_permission = 'content.submit_review'
 WHERE required_permission = 'content.submit_for_review';

-- Scheduling is an act of publishing, performed by the publisher role. It is not a
-- separate authority: anyone who may schedule a publication may publish it.
UPDATE workflow.transitions SET required_permission = 'content.publish'
 WHERE required_permission = 'content.schedule';

-- 2. Drop the now-unreferenced duplicates.
DELETE FROM identity.permissions
 WHERE key IN ('content.edit', 'content.submit_for_review', 'content.schedule');

-- 3. Guard against the same drift recurring. Every permission a transition requires
--    must be held by at least one role, or the transition is dead on arrival.
CREATE OR REPLACE FUNCTION private.assert_transitions_reachable()
RETURNS TABLE (transition text, required_permission text, problem text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT t.from_state || ' -> ' || t.to_state,
         t.required_permission,
         CASE
           WHEN p.key IS NULL THEN 'permission does not exist'
           ELSE 'permission exists but no role holds it'
         END
    FROM workflow.transitions t
    LEFT JOIN identity.permissions p ON p.key = t.required_permission
   WHERE t.required_permission IS NOT NULL
     AND (p.key IS NULL
          OR NOT EXISTS (SELECT 1 FROM identity.role_permissions rp
                          WHERE rp.permission_key = t.required_permission));
$$;

COMMENT ON FUNCTION private.assert_transitions_reachable() IS
  'Returns any workflow transition whose required permission is missing or held by no '
  'role. Must return zero rows; asserted by the test suite so the drift that produced '
  'this migration cannot recur silently.';
