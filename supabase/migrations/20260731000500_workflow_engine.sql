-- Block 08 — Editorial workflow engine (§45.1.6)
--
-- The `workflow` schema holds the editorial state machine: the state registry, the
-- declared transition table, the current state of every content version, and the
-- assignment / review / approval / comment / task records that surround it.
--
-- Two invariants are enforced here by the database rather than by the server layer:
--   * a content version may only move between states along a pair declared in
--     workflow.transitions (private.enforce_content_state_transition);
--   * separation of duties (§45.1.5) — an author may not review or approve their own
--     version, and a reviewer may not approve their own review.
--
-- Gate evaluation, the atomic publication transaction and scheduling live in the
-- Block 08 server contract; this migration owns the schema they operate on and the
-- gate vocabulary they must use (workflow.transitions.gates).
--
-- No policies are created here. RLS is enabled on every table at creation
-- (rules/database.md 6); the Block 07 RLS migration owns all policies.
--
-- Reverse procedure:
--   DROP TRIGGER content_state_transition_guard ON workflow.content_state;
--   DROP TRIGGER reviews_separation_of_duties   ON workflow.reviews;
--   DROP TRIGGER approvals_separation_of_duties ON workflow.approvals;
--   DROP VIEW workflow.overdue_work;
--   DROP TABLE workflow.tasks, workflow.comments, workflow.approvals,
--              workflow.reviews, workflow.assignments, workflow.content_state,
--              workflow.transitions, workflow.states CASCADE;
--   DROP FUNCTION private.enforce_content_state_transition(),
--                 private.enforce_review_separation(),
--                 private.enforce_approval_separation(),
--                 private.assert_transition_declared(text, text),
--                 private.transition_is_declared(text, text),
--                 private.is_version_author(uuid, uuid);
--   DELETE FROM identity.permissions WHERE key LIKE 'content.%';   -- seeded below
-- Destructive; never run against production.

-- ---------------------------------------------------------------------------
-- Editorial permission keys (§45.2.3).
--
-- workflow.transitions.required_permission is a real foreign key into
-- identity.permissions, so the eight editorial verbs the transition table depends on
-- are seeded here. Idempotent (rules/database.md 25) and conflict-tolerant so the
-- identity governance seed may declare the same rows without ordering constraints.
-- ---------------------------------------------------------------------------
INSERT INTO identity.permissions (key, resource, action, description) VALUES
  ('content.edit',              'content', 'edit',              'Edit a draft or changes-requested version.'),
  ('content.submit_for_review', 'content', 'submit_for_review', 'Move a version into the review queue.'),
  ('content.review',            'content', 'review',            'Record a review verdict on a version.'),
  ('content.approve',           'content', 'approve',           'Approve a reviewed version for publication.'),
  ('content.schedule',          'content', 'schedule',          'Schedule an approved version for future publication.'),
  ('content.publish',           'content', 'publish',           'Publish a version, immediately or on schedule.'),
  ('content.correct',           'content', 'correct',           'Open a correction against a published version.'),
  ('content.withdraw',          'content', 'withdraw',          'Withdraw content and raise a public tombstone.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- workflow.states — the state registry (§45.1.6 requirement 1).
--
-- States are rows, never free text. Additional editorial stages (research review,
-- compliance review) are added here rather than as ad hoc flags on the version.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.states (
  key           text PRIMARY KEY,
  name          text NOT NULL,
  description   text NOT NULL,
  -- Grouping used by the administrative queues; conveyed as text, never colour alone.
  category      text NOT NULL
    CHECK (category IN ('editorial', 'scheduled', 'live', 'terminal')),
  -- The state a newly created version enters. Exactly one state may hold this.
  is_initial    boolean NOT NULL DEFAULT false,
  -- No transition may leave a terminal state.
  is_terminal   boolean NOT NULL DEFAULT false,
  -- Whether a version in this state is readable by an anonymous reader.
  is_public     boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT states_key_is_slug CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT states_terminal_not_initial CHECK (NOT (is_initial AND is_terminal))
);

COMMENT ON TABLE workflow.states IS
  'Editorial state registry (§45.1.6 requirement 1). States are registry rows, not free text; extra review stages are added here.';
COMMENT ON COLUMN workflow.states.is_public IS
  'Whether a version in this state is publicly readable. Consumed by the Block 07 read policies; no policy is created here.';

-- Exactly one initial state.
CREATE UNIQUE INDEX states_single_initial_idx ON workflow.states (is_initial) WHERE is_initial;
CREATE INDEX states_category_idx ON workflow.states (category, position);

-- ---------------------------------------------------------------------------
-- workflow.transitions — the declared state machine (§45.1.6 requirement 2).
--
-- Every legal move is a row: from-state, to-state, the permission the actor must
-- hold, the gates the transition must satisfy, and whether it can be walked back.
-- The guard trigger on workflow.content_state consults only this table, so the
-- machine is edited as data, never as code.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state          text NOT NULL REFERENCES workflow.states(key) ON DELETE RESTRICT,
  to_state            text NOT NULL REFERENCES workflow.states(key) ON DELETE RESTRICT,
  -- Checked by the transition function via private.has_permission(); the FK keeps the
  -- key honest so a typo cannot silently disable a permission check.
  required_permission text NOT NULL REFERENCES identity.permissions(key) ON DELETE RESTRICT,
  -- Whether the inverse move is itself declared and permitted (documentation of intent;
  -- the inverse must still exist as its own row to be walkable).
  is_reversible       boolean NOT NULL DEFAULT false,
  -- Gate keys evaluated inside the publication transaction. The vocabulary is closed
  -- by the constraint below so a gate can never be silently misspelled away.
  gates               text[] NOT NULL DEFAULT '{}'::text[],
  -- A reason string is mandatory on the transition (corrections, withdrawals).
  requires_reason     boolean NOT NULL DEFAULT false,
  description         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_state, to_state),
  CONSTRAINT transitions_no_self_loop CHECK (from_state <> to_state),
  CONSTRAINT transitions_gates_known CHECK (
    gates <@ ARRAY[
      'review_complete',
      'approval_recorded',
      'separation_of_duties',
      'methodology_present',
      'limitations_present',
      'evidence_standard_met',
      'quantitative_traceability',
      'confidence_source_resolvable',
      'figure_text_alternatives',
      'schedule_in_future',
      'reason_recorded'
    ]::text[]
  )
);

COMMENT ON TABLE workflow.transitions IS
  'Declared state machine (§45.1.6 requirement 2). One row per legal from->to pair with its required permission, gates and reversibility. Any pair absent here is rejected by private.enforce_content_state_transition().';
COMMENT ON COLUMN workflow.transitions.gates IS
  'Closed vocabulary of publication gates (§45.1.6 requirement 9). Evaluated inside the publication transaction; never precomputed by the caller.';

CREATE INDEX transitions_from_idx       ON workflow.transitions (from_state);
CREATE INDEX transitions_to_idx         ON workflow.transitions (to_state);
CREATE INDEX transitions_permission_idx ON workflow.transitions (required_permission);

-- ---------------------------------------------------------------------------
-- workflow.content_state — current state of each content version
-- (§45.1.6 requirement 2). One row per version, enforced by UNIQUE.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.content_state (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id         uuid NOT NULL UNIQUE
                       REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  state_key          text NOT NULL REFERENCES workflow.states(key) ON DELETE RESTRICT,
  -- Maintained by the guard trigger; the full history lives in audit.events.
  previous_state_key text REFERENCES workflow.states(key) ON DELETE RESTRICT,
  -- Increments each time the version re-enters review after changes were requested.
  review_round       integer NOT NULL DEFAULT 1,
  entered_at         timestamptz NOT NULL DEFAULT now(),
  entered_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Mandatory for transitions declaring requires_reason (correction, withdrawal).
  reason             text,
  scheduled_for      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_state_round_positive CHECK (review_round > 0),
  CONSTRAINT content_state_scheduled_has_time CHECK (
    state_key <> 'scheduled' OR scheduled_for IS NOT NULL
  )
);

COMMENT ON TABLE workflow.content_state IS
  'Current editorial state of each cms.content_versions row (§45.1.6 requirement 2). Exactly one row per version; state changes only along a pair declared in workflow.transitions.';
COMMENT ON COLUMN workflow.content_state.review_round IS
  'Review round counter. Bumped by the guard trigger when a version re-enters in_review from changes_requested, so reviews and approvals are attributable to a round.';

CREATE INDEX content_state_state_idx     ON workflow.content_state (state_key, entered_at DESC);
CREATE INDEX content_state_previous_idx  ON workflow.content_state (previous_state_key);
CREATE INDEX content_state_entered_by_idx ON workflow.content_state (entered_by);
CREATE INDEX content_state_scheduled_idx ON workflow.content_state (scheduled_for)
  WHERE state_key = 'scheduled';

-- ---------------------------------------------------------------------------
-- workflow.assignments — who is responsible for a version
-- (§45.1.6 requirement 3, deadlines requirement 8).
-- Block 07 scopes editorial read/write access by these rows.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_role text NOT NULL CHECK (assignment_role IN (
                    'author', 'contributor', 'reviewer', 'research_reviewer',
                    'compliance_reviewer', 'editor', 'data_analyst')),
  assigned_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  due_at          timestamptz,
  state           text NOT NULL DEFAULT 'active'
                    CHECK (state IN ('active', 'completed', 'revoked')),
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, user_id, assignment_role),
  CONSTRAINT assignments_completed_has_timestamp CHECK (
    state <> 'completed' OR completed_at IS NOT NULL
  )
);

COMMENT ON TABLE workflow.assignments IS
  'Editorial assignment of a version to a user in a named role, with assigning actor and due date (§45.1.6 requirements 3 and 8). Block 07 scopes editorial access by these rows.';
COMMENT ON COLUMN workflow.assignments.assignment_role IS
  'Workflow responsibility, distinct from cms.content_contributors.role, which is the bibliographic credit.';

CREATE INDEX assignments_version_idx     ON workflow.assignments (version_id, assignment_role);
CREATE INDEX assignments_user_idx        ON workflow.assignments (user_id, state);
CREATE INDEX assignments_assigned_by_idx ON workflow.assignments (assigned_by);
CREATE INDEX assignments_due_idx         ON workflow.assignments (due_at)
  WHERE state = 'active' AND due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- workflow.reviews — one review per reviewer per round
-- (§45.1.6 requirement 4). Criteria are structured booleans, never prose only, so a
-- gate can read them without parsing text.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id           uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  -- RESTRICT: a review is part of the permanent provenance record and outlives the
  -- reviewer's own account lifecycle decisions.
  reviewer_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_round         integer NOT NULL DEFAULT 1,
  review_type          text NOT NULL DEFAULT 'editorial'
                         CHECK (review_type IN ('editorial', 'research', 'compliance', 'accessibility')),
  verdict              text NOT NULL DEFAULT 'pending'
                         CHECK (verdict IN ('pending', 'approved', 'changes_requested', 'rejected')),
  -- Structured criteria (§45.1.6 requirement 4).
  evidence_sufficient  boolean NOT NULL DEFAULT false,
  citations_valid      boolean NOT NULL DEFAULT false,
  methodology_present  boolean NOT NULL DEFAULT false,
  limitations_present  boolean NOT NULL DEFAULT false,
  figures_accessible   boolean NOT NULL DEFAULT false,
  notes                text,
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, reviewer_id, review_round),
  -- Referenced by the composite FK on workflow.approvals so an approval cannot cite a
  -- review belonging to another version or another round.
  UNIQUE (id, version_id, review_round),
  CONSTRAINT reviews_round_positive CHECK (review_round > 0),
  CONSTRAINT reviews_settled_has_timestamp CHECK (
    verdict = 'pending' OR submitted_at IS NOT NULL
  )
);

COMMENT ON TABLE workflow.reviews IS
  'One review per reviewer per round (§45.1.6 requirement 4) with structured criteria covering evidence, citations, methodology, limitations and figure accessibility. Retained permanently as part of the public provenance record.';
COMMENT ON COLUMN workflow.reviews.verdict IS
  'Reviewer conclusion. A verdict of approved is a prerequisite for, but is not itself, an approval — see workflow.approvals.';

CREATE INDEX reviews_version_idx  ON workflow.reviews (version_id, review_round);
CREATE INDEX reviews_reviewer_idx ON workflow.reviews (reviewer_id, created_at DESC);
CREATE INDEX reviews_open_idx     ON workflow.reviews (version_id) WHERE verdict = 'pending';

-- ---------------------------------------------------------------------------
-- workflow.approvals — distinct from a review (§45.1.6 requirement 5).
-- Records the approving actor, the round approved, and when.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id     uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  -- Optional: an approval may be granted against the round rather than one review.
  review_id      uuid,
  review_round   integer NOT NULL DEFAULT 1,
  -- RESTRICT: the approving actor is part of the permanent provenance record.
  approver_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approval_scope text NOT NULL DEFAULT 'editorial'
                   CHECK (approval_scope IN ('editorial', 'research', 'compliance', 'legal', 'final')),
  notes          text,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, review_round, approver_id, approval_scope),
  CONSTRAINT approvals_round_positive CHECK (review_round > 0),
  -- MATCH SIMPLE: unenforced while review_id is NULL, fully enforced once set, which
  -- pins the cited review to this version and this round.
  CONSTRAINT approvals_review_fk FOREIGN KEY (review_id, version_id, review_round)
    REFERENCES workflow.reviews (id, version_id, review_round)
    MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE
);

COMMENT ON TABLE workflow.approvals IS
  'Approval records (§45.1.6 requirement 5), distinct from workflow.reviews: an approval names the approving actor and the review round approved. Separation of duties is enforced by trigger, not convention (§45.1.5).';

CREATE INDEX approvals_version_idx  ON workflow.approvals (version_id, review_round);
-- Full key of approvals_review_fk, so the cascade scan is index-only.
CREATE INDEX approvals_review_idx   ON workflow.approvals (review_id, version_id, review_round);
CREATE INDEX approvals_approver_idx ON workflow.approvals (approver_id, approved_at DESC);

-- ---------------------------------------------------------------------------
-- workflow.comments — threaded editorial comments (§45.1.6 requirement 6).
-- Never publicly exposed; retained with the version.
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  -- Self-FK for threading. The composite variant below additionally pins a reply to
  -- the same version as its parent.
  parent_id   uuid,
  -- Optional anchor to a module of the version, by its stable fragment identifier.
  fragment_id text,
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Target of the composite self-FK.
  UNIQUE (id, version_id),
  CONSTRAINT comments_body_not_blank CHECK (length(btrim(body)) > 0),
  CONSTRAINT comments_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT comments_resolved_has_timestamp CHECK (
    is_resolved = false OR resolved_at IS NOT NULL
  ),
  -- A reply dies with its thread root.
  CONSTRAINT comments_parent_fk FOREIGN KEY (parent_id, version_id)
    REFERENCES workflow.comments (id, version_id)
    MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE,
  -- Anchoring the comment to a module. If the module is removed the comment survives
  -- and simply loses its anchor (PostgreSQL 15+ column-list SET NULL).
  CONSTRAINT comments_fragment_fk FOREIGN KEY (version_id, fragment_id)
    REFERENCES cms.content_version_modules (version_id, fragment_id)
    MATCH SIMPLE ON UPDATE CASCADE ON DELETE SET NULL (fragment_id)
);

COMMENT ON TABLE workflow.comments IS
  'Threaded editorial comments anchored to a version and optionally to a module fragment (§45.1.6 requirement 6). Retained with the version and never publicly exposed.';
COMMENT ON COLUMN workflow.comments.fragment_id IS
  'cms.content_version_modules.fragment_id within the same version. Cleared, not cascaded, if the module is deleted.';

CREATE INDEX comments_version_idx  ON workflow.comments (version_id, created_at);
-- Full key of comments_parent_fk; also the thread-expansion access path.
CREATE INDEX comments_parent_idx   ON workflow.comments (parent_id, version_id);
CREATE INDEX comments_author_idx   ON workflow.comments (author_id);
CREATE INDEX comments_resolver_idx ON workflow.comments (resolved_by);
CREATE INDEX comments_fragment_idx ON workflow.comments (version_id, fragment_id)
  WHERE fragment_id IS NOT NULL;
CREATE INDEX comments_open_idx     ON workflow.comments (version_id) WHERE is_resolved = false;

-- ---------------------------------------------------------------------------
-- workflow.tasks — discrete work items (§45.1.6 requirements 7 and 8).
-- ---------------------------------------------------------------------------
CREATE TABLE workflow.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  assignment_id   uuid REFERENCES workflow.assignments(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  -- SET NULL: an unowned task remains visible in the queue rather than disappearing.
  owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  state           text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority        text NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at          timestamptz,
  completed_at    timestamptz,
  completed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completion_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT tasks_attached_to_something CHECK (
    version_id IS NOT NULL OR assignment_id IS NOT NULL
  ),
  CONSTRAINT tasks_completed_has_record CHECK (
    state <> 'completed' OR completed_at IS NOT NULL
  )
);

COMMENT ON TABLE workflow.tasks IS
  'Discrete editorial work items attached to a version or an assignment, with owner, state, due date and completion record (§45.1.6 requirements 7 and 8).';

CREATE INDEX tasks_version_idx      ON workflow.tasks (version_id, state);
CREATE INDEX tasks_assignment_idx   ON workflow.tasks (assignment_id);
CREATE INDEX tasks_owner_idx        ON workflow.tasks (owner_id, state);
CREATE INDEX tasks_created_by_idx   ON workflow.tasks (created_by);
CREATE INDEX tasks_completed_by_idx ON workflow.tasks (completed_by);
CREATE INDEX tasks_due_idx          ON workflow.tasks (due_at)
  WHERE state IN ('open', 'in_progress', 'blocked') AND due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Overdue derivation for the administrative queues (§45.1.6 requirement 8).
-- security_invoker so it cannot leak past the Block 07 policies on its base tables
-- (rules/database.md 10).
-- ---------------------------------------------------------------------------
CREATE VIEW workflow.overdue_work
WITH (security_invoker = true) AS
  SELECT 'assignment'::text AS work_kind,
         a.id               AS work_id,
         a.version_id,
         a.user_id          AS owner_id,
         a.assignment_role  AS work_role,
         a.due_at,
         (now() - a.due_at) AS overdue_by
    FROM workflow.assignments a
   WHERE a.state = 'active' AND a.due_at IS NOT NULL AND a.due_at < now()
  UNION ALL
  SELECT 'task'::text,
         t.id,
         t.version_id,
         t.owner_id,
         t.priority,
         t.due_at,
         (now() - t.due_at)
    FROM workflow.tasks t
   WHERE t.state IN ('open', 'in_progress', 'blocked')
     AND t.due_at IS NOT NULL AND t.due_at < now();

COMMENT ON VIEW workflow.overdue_work IS
  'Overdue assignments and tasks (§45.1.6 requirement 8). Derived, never stored, so it cannot drift from the due dates.';

-- ---------------------------------------------------------------------------
-- STATE TRANSITION GUARD (§45.1.6 requirement 2).
-- An undeclared transition is rejected at the database level, so no client-side
-- status write can move a version along a path the editorial model does not permit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.transition_is_declared(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- SECURITY DEFINER: the transition table is the authority for the guard and must be
  -- readable even by a role that RLS would otherwise hide it from.
  SELECT EXISTS (
    SELECT 1 FROM workflow.transitions t
     WHERE t.from_state = p_from AND t.to_state = p_to
  );
$$;

COMMENT ON FUNCTION private.transition_is_declared(text, text) IS
  'True when the from->to pair exists in workflow.transitions. Deterministic for a given database state (rules/database.md 19a).';

CREATE OR REPLACE FUNCTION private.assert_transition_declared(p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_terminal boolean;
BEGIN
  -- SECURITY DEFINER: reads workflow.states and workflow.transitions, which the
  -- calling role may not select directly.
  SELECT s.is_terminal INTO v_terminal FROM workflow.states s WHERE s.key = p_from;

  IF v_terminal THEN
    RAISE EXCEPTION
      'workflow: % is a terminal state; no transition to % is possible', p_from, p_to
      USING ERRCODE = 'check_violation',
            HINT = 'Open a new content version instead of moving this one.';
  END IF;

  IF NOT private.transition_is_declared(p_from, p_to) THEN
    RAISE EXCEPTION
      'workflow: transition % -> % is not declared in workflow.transitions', p_from, p_to
      USING ERRCODE = 'check_violation',
            HINT = 'Declare the transition with its required permission and gates, or use a declared path.';
  END IF;
END;
$$;

COMMENT ON FUNCTION private.assert_transition_declared(text, text) IS
  'State-transition guard (§45.1.6 requirement 2). Raises check_violation naming the rejected pair when it is undeclared or leaves a terminal state. Side effect: none.';

CREATE OR REPLACE FUNCTION private.enforce_content_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_transition workflow.transitions%ROWTYPE;
BEGIN
  -- Single responsibility (rules/database.md 19c): admit only declared transitions and
  -- stamp the bookkeeping columns that describe the move. Gate evaluation and the
  -- permission check belong to the transition function, not here.
  IF TG_OP = 'INSERT' THEN
    NEW.entered_at   := now();
    NEW.entered_by   := COALESCE(auth.uid(), NEW.entered_by);
    NEW.previous_state_key := NULL;
    PERFORM private.log_audit(
      'workflow.state_entered', 'cms.content_versions', NEW.version_id::text, 'performed',
      jsonb_build_object('from_state', NULL, 'to_state', NEW.state_key,
                         'review_round', NEW.review_round, 'gates', '[]'::jsonb)
    );
    RETURN NEW;
  END IF;

  IF NEW.state_key IS NOT DISTINCT FROM OLD.state_key THEN
    RETURN NEW;
  END IF;

  PERFORM private.assert_transition_declared(OLD.state_key, NEW.state_key);

  SELECT * INTO v_transition FROM workflow.transitions t
   WHERE t.from_state = OLD.state_key AND t.to_state = NEW.state_key;

  IF v_transition.requires_reason AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION
      'workflow: transition % -> % requires a reason', OLD.state_key, NEW.state_key
      USING ERRCODE = 'check_violation',
            HINT = 'Set workflow.content_state.reason to the correction or withdrawal reason.';
  END IF;

  NEW.previous_state_key := OLD.state_key;
  NEW.entered_at         := now();
  NEW.entered_by         := COALESCE(auth.uid(), NEW.entered_by);

  -- Re-entering review after changes were requested opens a new round, so reviews and
  -- approvals stay attributable to the round they were given in.
  IF NEW.state_key = 'in_review' AND OLD.state_key = 'changes_requested' THEN
    NEW.review_round := OLD.review_round + 1;
  END IF;

  -- Every transition is audited (Block 08 data requirements).
  PERFORM private.log_audit(
    'workflow.transition', 'cms.content_versions', NEW.version_id::text, 'performed',
    jsonb_build_object(
      'from_state',          OLD.state_key,
      'to_state',            NEW.state_key,
      'review_round',        NEW.review_round,
      'required_permission', v_transition.required_permission,
      'gates',               to_jsonb(v_transition.gates),
      'reason',              NEW.reason
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_content_state_transition() IS
  'BEFORE INSERT OR UPDATE trigger on workflow.content_state. Rejects any state change whose from->to pair is absent from workflow.transitions, stamps previous_state_key/entered_at/entered_by, bumps the review round on re-review, and writes the append-only transition audit row. SECURITY DEFINER because it must read the transition registry and write audit.events.';

CREATE TRIGGER content_state_transition_guard
  BEFORE INSERT OR UPDATE ON workflow.content_state
  FOR EACH ROW EXECUTE FUNCTION private.enforce_content_state_transition();

-- ---------------------------------------------------------------------------
-- SEPARATION OF DUTIES (§45.1.5, §45.1.6 requirement 10).
-- Enforced in the database so no server-layer bug can bypass it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_version_author(p_version_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- SECURITY DEFINER: crosses accounts.profiles and cms.content_contributors, both
  -- RLS-protected. Without elevation the check could silently see no rows and pass.
  --
  -- A platform user is linked to a bibliographic person only through
  -- accounts.profiles.person_id; both that credit link and an explicit authoring
  -- assignment count as authorship for separation-of-duties purposes.
  SELECT EXISTS (
    SELECT 1
      FROM cms.content_contributors cc
      JOIN accounts.profiles p ON p.person_id = cc.person_id
     WHERE cc.version_id = p_version_id
       AND cc.role = 'author'
       AND p.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
      FROM workflow.assignments a
     WHERE a.version_id = p_version_id
       AND a.user_id = p_user_id
       AND a.assignment_role = 'author'
       AND a.state <> 'revoked'
  );
$$;

COMMENT ON FUNCTION private.is_version_author(uuid, uuid) IS
  'True when the user is credited as an author on the version (cms.content_contributors.role = author, resolved through accounts.profiles.person_id) or holds an active author assignment. Used by the separation-of-duties triggers (§45.1.5).';

CREATE OR REPLACE FUNCTION private.enforce_review_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- §45.1.5: an author may not review their own version.
  IF private.is_version_author(NEW.version_id, NEW.reviewer_id) THEN
    RAISE EXCEPTION
      'separation of duties: user % is an author of version % and may not review it',
      NEW.reviewer_id, NEW.version_id
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Assign a reviewer who is not credited as an author on this version.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_review_separation() IS
  'BEFORE INSERT OR UPDATE trigger on workflow.reviews. Rejects a review whose reviewer is an author of the version (§45.1.5). SECURITY DEFINER because the authorship lookup crosses RLS-protected tables.';

CREATE TRIGGER reviews_separation_of_duties
  BEFORE INSERT OR UPDATE ON workflow.reviews
  FOR EACH ROW EXECUTE FUNCTION private.enforce_review_separation();

CREATE OR REPLACE FUNCTION private.enforce_approval_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reviewer uuid;
BEGIN
  -- §45.1.5: an author may not approve their own version.
  IF private.is_version_author(NEW.version_id, NEW.approver_id) THEN
    RAISE EXCEPTION
      'separation of duties: user % is an author of version % and may not approve it',
      NEW.approver_id, NEW.version_id
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Approval must come from an editor who is not credited as an author.';
  END IF;

  -- §45.1.5: a reviewer may not approve their own review.
  IF NEW.review_id IS NOT NULL THEN
    SELECT r.reviewer_id INTO v_reviewer FROM workflow.reviews r WHERE r.id = NEW.review_id;
    IF v_reviewer = NEW.approver_id THEN
      RAISE EXCEPTION
        'separation of duties: user % performed review % and may not approve it',
        NEW.approver_id, NEW.review_id
        USING ERRCODE = 'insufficient_privilege',
              HINT = 'Approval must come from an actor other than the reviewer of record.';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM workflow.reviews r
     WHERE r.version_id   = NEW.version_id
       AND r.review_round = NEW.review_round
       AND r.reviewer_id  = NEW.approver_id
  ) THEN
    -- Round-level approval by someone who reviewed that same round is the same
    -- violation with the review link left implicit.
    RAISE EXCEPTION
      'separation of duties: user % reviewed version % in round % and may not approve that round',
      NEW.approver_id, NEW.version_id, NEW.review_round
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Approval must come from an actor other than the reviewer of record.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_approval_separation() IS
  'BEFORE INSERT OR UPDATE trigger on workflow.approvals. Rejects approval by an author of the version and by the reviewer who performed the cited review or reviewed that round (§45.1.5). SECURITY DEFINER because the lookups cross RLS-protected tables.';

CREATE TRIGGER approvals_separation_of_duties
  BEFORE INSERT OR UPDATE ON workflow.approvals
  FOR EACH ROW EXECUTE FUNCTION private.enforce_approval_separation();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE TRIGGER states_updated_at BEFORE UPDATE ON workflow.states
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER transitions_updated_at BEFORE UPDATE ON workflow.transitions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER content_state_updated_at BEFORE UPDATE ON workflow.content_state
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON workflow.assignments
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON workflow.reviews
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER approvals_updated_at BEFORE UPDATE ON workflow.approvals
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON workflow.comments
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON workflow.tasks
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seeds (rules/database.md 25: deterministic and idempotent).
--
-- The nine §45.1.6 states.
-- ---------------------------------------------------------------------------
INSERT INTO workflow.states (key, name, description, category, is_initial, is_terminal, is_public, position) VALUES
  ('draft',              'Draft',              'Being written. Not visible outside the editorial surface.',                            'editorial', true,  false, false, 10),
  ('in_review',          'In review',          'Submitted for review; one or more reviewers hold an open review for the current round.', 'editorial', false, false, false, 20),
  ('changes_requested',  'Changes requested',  'A reviewer returned the version to the author with required changes.',                 'editorial', false, false, false, 30),
  ('approved',           'Approved',           'Reviewed and approved; eligible for publication once every gate passes.',              'editorial', false, false, false, 40),
  ('scheduled',          'Scheduled',          'Approved and queued for publication at a future timestamp. Cancellable.',              'scheduled', false, false, false, 50),
  ('published',          'Published',          'Live and publicly readable. The version is frozen (§45.1.3).',                         'live',      false, false, true,  60),
  ('correction_pending', 'Correction pending', 'A correction has been opened against this published version.',                         'live',      false, false, true,  70),
  ('superseded',         'Superseded',         'Replaced by a later version; retrievable with a visible correction notice.',           'terminal',  false, true,  true,  80),
  ('withdrawn',          'Withdrawn',          'Removed from publication; a public tombstone retains the citation record.',            'terminal',  false, true,  true,  90)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The declared transition set. Anything absent here is rejected by the guard.
-- Gate keys are drawn from the closed vocabulary on workflow.transitions.gates.
-- ---------------------------------------------------------------------------
INSERT INTO workflow.transitions
  (from_state, to_state, required_permission, is_reversible, requires_reason, gates, description)
VALUES
  -- Drafting and review
  ('draft', 'in_review', 'content.submit_for_review', true, false,
   '{}'::text[],
   'Author submits the draft for review.'),
  ('in_review', 'draft', 'content.edit', true, false,
   '{}'::text[],
   'Submission recalled before a verdict; returns to drafting.'),
  ('in_review', 'changes_requested', 'content.review', true, false,
   ARRAY['separation_of_duties']::text[],
   'Reviewer returns the version to the author with required changes.'),
  ('changes_requested', 'in_review', 'content.submit_for_review', true, false,
   '{}'::text[],
   'Author resubmits after addressing the requested changes; opens a new review round.'),
  ('changes_requested', 'draft', 'content.edit', true, false,
   '{}'::text[],
   'Version taken back into open drafting.'),

  -- Approval
  ('in_review', 'approved', 'content.approve', true, false,
   ARRAY['review_complete', 'approval_recorded', 'separation_of_duties']::text[],
   'Editor approves a completed review round.'),
  ('approved', 'changes_requested', 'content.review', true, false,
   ARRAY['separation_of_duties']::text[],
   'Approval revoked; further changes required before publication.'),
  ('approved', 'draft', 'content.edit', true, false,
   '{}'::text[],
   'Approval abandoned and the version returned to drafting.'),

  -- Scheduling
  ('approved', 'scheduled', 'content.schedule', true, false,
   ARRAY['review_complete', 'approval_recorded', 'separation_of_duties',
         'methodology_present', 'limitations_present', 'evidence_standard_met',
         'quantitative_traceability', 'confidence_source_resolvable',
         'figure_text_alternatives', 'schedule_in_future']::text[],
   'Approved version queued for publication at a future timestamp. Same gates as immediate publication, plus a future schedule time.'),
  ('scheduled', 'approved', 'content.schedule', true, false,
   '{}'::text[],
   'Schedule cancelled before it fires; the version returns to approved.'),

  -- Publication
  ('approved', 'published', 'content.publish', false, false,
   ARRAY['review_complete', 'approval_recorded', 'separation_of_duties',
         'methodology_present', 'limitations_present', 'evidence_standard_met',
         'quantitative_traceability', 'confidence_source_resolvable',
         'figure_text_alternatives']::text[],
   'Immediate publication inside the atomic publication transaction.'),
  ('scheduled', 'published', 'content.publish', false, false,
   ARRAY['review_complete', 'approval_recorded', 'separation_of_duties',
         'methodology_present', 'limitations_present', 'evidence_standard_met',
         'quantitative_traceability', 'confidence_source_resolvable',
         'figure_text_alternatives']::text[],
   'Scheduled publication fires under the service identity, using the same transaction and the same gates.'),

  -- Correction and supersession
  ('published', 'correction_pending', 'content.correct', true, true,
   ARRAY['reason_recorded']::text[],
   'A correction is opened against the published version; the reason and scope are recorded.'),
  ('correction_pending', 'published', 'content.correct', true, false,
   '{}'::text[],
   'Correction withdrawn before the corrected version publishes.'),
  ('correction_pending', 'superseded', 'content.publish', false, true,
   ARRAY['reason_recorded']::text[],
   'The corrected version published; this version is superseded and retains a visible correction notice.'),
  ('published', 'superseded', 'content.publish', false, false,
   '{}'::text[],
   'A later version published and replaced this one.'),

  -- Withdrawal
  ('draft', 'withdrawn', 'content.withdraw', false, true,
   ARRAY['reason_recorded']::text[],
   'An unpublished draft is abandoned; the reason is recorded.'),
  ('published', 'withdrawn', 'content.withdraw', false, true,
   ARRAY['reason_recorded']::text[],
   'Published content withdrawn; a public tombstone retains the citation record.'),
  ('correction_pending', 'withdrawn', 'content.withdraw', false, true,
   ARRAY['reason_recorded']::text[],
   'Content withdrawn rather than corrected; a public tombstone retains the citation record.')
ON CONFLICT (from_state, to_state) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS on from creation (rules/database.md 6). Policies belong to the Block 07
-- migration; none are created here.
-- ---------------------------------------------------------------------------
ALTER TABLE workflow.states        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.transitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.content_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.approvals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.tasks         ENABLE ROW LEVEL SECURITY;
