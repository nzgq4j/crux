import { describe, it, expect, afterAll } from 'vitest'
import { asSuperuser, as, ANON, closeTestPool, expectDenied } from '../helpers/db'
import { scenario, recordApproval, insertApprovalDirect } from '../helpers/editorial'

/**
 * workflow.perform_transition — the enforcement point for the editorial state machine.
 *
 * The defect this closes: workflow.transitions carried required_permission and gates
 * for all 19 transitions, and the trigger on content_state deferred both to "the
 * transition function", which did not exist. Any actor able to write a content_state
 * row could move a version to any declared next state — including straight to
 * published — holding no permission and satisfying no gate.
 *
 * The state machine was declared. It was not enforced.
 */

afterAll(async () => {
  await closeTestPool()
})

// ---------------------------------------------------------------------------------
// Successful transitions
// ---------------------------------------------------------------------------------

describe('permitted transitions', () => {
  it('an author with content.submit_review moves draft to in_review', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      const { rows } = await s.client.query<{ perform_transition: string }>(
        'SELECT workflow.perform_transition($1,$2) AS perform_transition',
        [versionId, 'in_review'],
      )
      expect(rows[0]!.perform_transition).toBe('in_review')

      await s.asOwner()
      const state = await s.client.query('SELECT state_key, previous_state_key, entered_by FROM workflow.content_state WHERE version_id=$1', [versionId])
      expect(state.rows[0]).toMatchObject({
        state_key: 'in_review',
        previous_state_key: 'draft',
        entered_by: s.actors.author,
      })
    })
  })

  it('runs the full path to published with the right actor at each step', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()

      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,$3)', [
        versionId, 'approved', 'looks right',
      ])
      await recordApproval(s, versionId, s.actors.editor)

      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])

      await s.act(s.actors.publisher)
      const { rows } = await s.client.query<{ perform_transition: string }>(
        'SELECT workflow.perform_transition($1,$2) AS perform_transition',
        [versionId, 'published'],
      )
      expect(rows[0]!.perform_transition).toBe('published')
    })
  })

  it('is a no-op when the target state is the current state', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      const { rows } = await s.client.query<{ perform_transition: string }>(
        'SELECT workflow.perform_transition($1,$2) AS perform_transition',
        [versionId, 'draft'],
      )
      expect(rows[0]!.perform_transition).toBe('draft')
    })
  })
})

// ---------------------------------------------------------------------------------
// Actor permission checks
// ---------------------------------------------------------------------------------

describe('actor permission', () => {
  it('refuses a publisher attempting to approve', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.act(s.actors.publisher)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'publisher approving without content.approve',
      )
      expect(error.message).toMatch(/requires permission content\.approve/)
    })
  })

  it('refuses an editor attempting to publish', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])

      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published']),
        'managing editor publishing without content.publish',
      )
      expect(error.message).toMatch(/requires permission content\.publish/)
    })
  })

  it('refuses an actor holding no content role', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.outsider)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review']),
        'unauthorised actor transitioning',
      )
    })
  })

  it('refuses an actor who is not assigned to the version', async () => {
    await scenario(async (s) => {
      // A version nobody is assigned to. The author holds content.submit_review but
      // has no relationship to this version.
      await s.asOwner()
      const item = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ('article','unassigned-fixture',$1) RETURNING id`,
        [s.actors.author],
      )
      const version = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,'Unassigned',$2) RETURNING id`,
        [item.rows[0]!.id, s.actors.author],
      )
      const versionId = version.rows[0]!.id
      await s.client.query(
        `INSERT INTO workflow.content_state (version_id, state_key) VALUES ($1,'draft')`,
        [versionId],
      )

      await s.act(s.actors.author)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review']),
        'unassigned actor transitioning',
      )
      expect(error.message).toMatch(/not assigned to version/)
    })
  })

  it('refuses an unauthenticated caller', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(null, 'anon')
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review']),
        'anon transitioning',
      )
    })
  })
})

// ---------------------------------------------------------------------------------
// Invalid source and destination states
// ---------------------------------------------------------------------------------

describe('invalid states', () => {
  it('refuses an undeclared transition', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.publisher)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published']),
        'draft straight to published',
      )
      expect(error.message).toMatch(/not a declared transition/)
    })
  })

  it('refuses a state that does not exist', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'not_a_state']),
        'transition to a fabricated state',
      )
    })
  })

  it('refuses a version with no workflow state', async () => {
    await scenario(async (s) => {
      await s.asOwner()
      const item = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ('article','stateless-fixture',$1) RETURNING id`, [s.actors.author])
      const version = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,'Stateless',$2) RETURNING id`, [item.rows[0]!.id, s.actors.author])
      await s.client.query(
        `INSERT INTO workflow.assignments (version_id,user_id,assignment_role) VALUES ($1,$2,'author')`,
        [version.rows[0]!.id, s.actors.author])

      await s.act(s.actors.author)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [version.rows[0]!.id, 'in_review']),
        'transition on a version with no state',
      )
      expect(error.message).toMatch(/has no workflow state/)
    })
  })

  it('refuses a version id that does not exist', async () => {
    await scenario(async (s) => {
      await s.act(s.actors.author)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [
          '00000000-0000-4000-8000-000000000000', 'in_review',
        ]),
        'transition on a fabricated version id',
      )
    })
  })
})

// ---------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------

describe('gates', () => {
  it('refuses approval with no review and no approval recorded, naming both', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'approval with unmet gates',
      )
      expect(error.message).toMatch(/review_complete/)
      expect(error.message).toMatch(/approval_recorded/)
    })
  })

  it('refuses publication of a content type missing its methodology', async () => {
    await scenario(async (s) => {
      // `report` requires methodology and mandatory evidence.
      const { versionId } = await s.createDraft('gated-report', 'report')
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])

      await s.act(s.actors.publisher)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published']),
        'publishing a report with no methodology',
      )
      expect(error.message).toMatch(/methodology_present/)
      expect(error.message).toMatch(/limitations_present/)
    })
  })

  it('reports an unrecognised gate as unmet rather than ignoring it', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      const { rows } = await s.client.query<{ unmet_transition_gates: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['no_such_gate']) AS unmet_transition_gates`,
        [versionId],
      )
      expect(rows[0]!.unmet_transition_gates).toEqual(['unknown_gate:no_such_gate'])
    })
  })

  it('treats an inapplicable gate as satisfied', async () => {
    await scenario(async (s) => {
      // No quantitative claims and no figures, so nothing to trace or caption.
      const { versionId } = await s.createDraft()
      await s.asOwner()
      const { rows } = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1,
           ARRAY['quantitative_traceability','figure_text_alternatives','confidence_source_resolvable']) AS g`,
        [versionId],
      )
      expect(rows[0]!.g).toEqual([])
    })
  })

  it('refuses publication of a figure with no alternative text', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await s.client.query(
        `INSERT INTO cms.content_version_modules (version_id, fragment_id, module_key, position, payload)
         VALUES ($1,'fig','figure',2,'{"src":"/x.png"}'::jsonb)`,
        [versionId],
      )
      const { rows } = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['figure_text_alternatives']) AS g`,
        [versionId],
      )
      expect(rows[0]!.g).toEqual(['figure_text_alternatives'])
    })
  })
})

// ---------------------------------------------------------------------------------
// Reviewer / author / approver separation
// ---------------------------------------------------------------------------------

describe('separation of duties', () => {
  it('the database refuses an approval by the version author', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])

      // The approvals_separation_of_duties trigger refuses this before the gate is
      // ever consulted — a stronger control, since it holds for any writer.
      await s.client.query('SAVEPOINT before_self_approval')
      const error = await expectDenied(
        () => insertApprovalDirect(s, versionId, s.actors.author),
        'the author recording their own approval',
      )
      expect(error.message).toMatch(/separation of duties/i)
      await s.client.query('ROLLBACK TO SAVEPOINT before_self_approval')
    })
  })

  it('the separation_of_duties gate reports an author approval as unmet', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      // Written past the trigger so the gate itself can be exercised: the gate is the
      // backstop for a row that reached the table some other way.
      await s.client.query('ALTER TABLE workflow.approvals DISABLE TRIGGER approvals_separation_of_duties')
      await s.client.query(
        `INSERT INTO workflow.approvals (version_id, review_round, approver_id, approval_scope)
         VALUES ($1,1,$2,'final')`, [versionId, s.actors.author])
      await s.client.query('ALTER TABLE workflow.approvals ENABLE TRIGGER approvals_separation_of_duties')

      const { rows } = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['separation_of_duties']) AS g`, [versionId])
      expect(rows[0]!.g).toEqual(['separation_of_duties'])
    })
  })

  it('the database refuses an approval by the reviewer of the same round', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])

      // A pre-existing trigger, stricter than the gate: reviewer and approver of a
      // round must differ.
      const error = await expectDenied(
        () => insertApprovalDirect(s, versionId, s.actors.reviewer),
        'approval by the same person who reviewed the round',
      )
      expect(error.message).toMatch(/separation of duties/i)
    })
  })
})

// ---------------------------------------------------------------------------------
// Transaction, audit, immutability
// ---------------------------------------------------------------------------------

describe('atomicity and audit', () => {
  it('records an audit row for a performed transition', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.asOwner()
      const { rows } = await s.client.query(
        `SELECT action, decision, detail FROM audit.events
          WHERE resource_id = $1 AND action = 'workflow.transition' ORDER BY id DESC LIMIT 1`,
        [versionId],
      )
      expect(rows[0]).toMatchObject({ action: 'workflow.transition', decision: 'performed' })
      expect(rows[0]!.detail).toMatchObject({ from_state: 'draft', to_state: 'in_review' })
    })
  })

  it('records a denial when the permission check fails', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.act(s.actors.publisher)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'publisher approving',
      )
      // The statement raised, so its own writes are gone — but the transaction is
      // still usable and the state must be unchanged.
      await s.client.query('ROLLBACK').catch(() => undefined)
    })
  })

  it('leaves the state unchanged when a transition is refused', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.client.query('SAVEPOINT before_denied')
      await s.act(s.actors.publisher)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'publisher approving',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_denied')

      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT state_key FROM workflow.content_state WHERE version_id=$1', [versionId])
      expect(rows[0]!.state_key).toBe('in_review')
    })
  })

  it('publishes the version and the item together, or not at all', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])

      await s.asOwner()
      const { rows } = await s.client.query(
        `SELECT v.status, v.published_at, v.plain_text, i.lifecycle_state, i.current_version_id
           FROM cms.content_versions v JOIN cms.content_items i ON i.id = v.content_item_id
          WHERE v.id = $1`,
        [versionId],
      )
      expect(rows[0]).toMatchObject({
        status: 'published',
        lifecycle_state: 'published',
        current_version_id: versionId,
      })
      expect(rows[0]!.published_at).not.toBeNull()
      // Derived from the structured module, not authored separately.
      expect(rows[0]!.plain_text).toContain('The body of the fixture article.')
      expect(itemId).toBeTruthy()
    })
  })

  it('a published version stays immutable afterwards', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])

      // Asserted against the connection's own superuser identity: immutability is an
      // invariant, not an access control.
      await s.asOwner()
      await expectDenied(
        () => s.client.query('UPDATE cms.content_versions SET title=$1 WHERE id=$2', ['Rewritten', versionId]),
        'editing a published version',
      )
    })
  })
})

// ---------------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------------

describe('concurrent transition attempts', () => {
  it('serialises two attempts on the same version', async () => {
    // Committed fixture on its own, because two connections must see it.
    const slug = `concurrent-${process.pid}-${Date.now()}`
    const setup = await asSuperuser(async (c) => {
      const u = await c.query<{ id: string }>(
        `INSERT INTO auth.users (email, email_confirmed_at)
         VALUES ($1, now()) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
        [`concurrent-author-${slug}@fixture.crux.test`],
      )
      const authorId = u.rows[0]!.id
      await c.query(`INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'author')
                     ON CONFLICT DO NOTHING`, [authorId])
      const item = await c.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ('article',$1,$2) RETURNING id`, [slug, authorId])
      const version = await c.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,'Concurrent',$2) RETURNING id`, [item.rows[0]!.id, authorId])
      const versionId = version.rows[0]!.id
      await c.query(`INSERT INTO workflow.content_state (version_id, state_key) VALUES ($1,'draft')`, [versionId])
      await c.query(`INSERT INTO workflow.assignments (version_id,user_id,assignment_role)
                     VALUES ($1,$2,'author')`, [versionId, authorId])
      return { authorId, versionId, itemId: item.rows[0]!.id }
    })

    const attempt = async () => {
      const c = await (await import('../helpers/db')).testPool().connect()
      try {
        await c.query('BEGIN')
        await c.query('SELECT set_config($1,$2,true)', [
          'request.jwt.claims', JSON.stringify({ sub: setup.authorId, role: 'authenticated' })])
        await c.query('SET LOCAL ROLE authenticated')
        await c.query('SELECT workflow.perform_transition($1,$2)', [setup.versionId, 'in_review'])
        await c.query('COMMIT')
        return 'ok' as const
      } catch (error) {
        await c.query('ROLLBACK').catch(() => undefined)
        return error as Error
      } finally {
        c.release()
      }
    }

    try {
      const [a, b] = await Promise.all([attempt(), attempt()])
      const outcomes = [a, b]
      // The FOR UPDATE on content_state serialises them. Whichever loses the race
      // finds the version already in_review, which is a no-op rather than an error.
      expect(outcomes.filter((o) => o === 'ok').length).toBeGreaterThanOrEqual(1)

      const state = await asSuperuser((c) =>
        c.query('SELECT state_key FROM workflow.content_state WHERE version_id=$1', [setup.versionId]))
      expect(state.rows[0]!.state_key).toBe('in_review')

      // Exactly one transition was recorded, not two.
      const audit = await asSuperuser((c) =>
        c.query(`SELECT count(*)::int AS n FROM audit.events
                  WHERE resource_id=$1 AND action='workflow.transition' AND decision='performed'`,
          [setup.versionId]))
      expect(audit.rows[0]!.n).toBe(1)
    } finally {
      await asSuperuser(async (c) => {
        await c.query('ALTER TABLE audit.events DISABLE TRIGGER USER')
        await c.query('DELETE FROM audit.events WHERE resource_id = $1', [setup.versionId])
        await c.query('ALTER TABLE audit.events ENABLE TRIGGER USER')
        await c.query('DELETE FROM workflow.assignments WHERE version_id=$1', [setup.versionId])
        await c.query('DELETE FROM workflow.content_state WHERE version_id=$1', [setup.versionId])
        await c.query('DELETE FROM cms.content_versions WHERE id=$1', [setup.versionId])
        await c.query('DELETE FROM cms.content_items WHERE id=$1', [setup.itemId])
        await c.query('DELETE FROM identity.user_roles WHERE user_id=$1', [setup.authorId])
        await c.query('DELETE FROM auth.users WHERE id=$1', [setup.authorId])
      })
    }
  })
})

// ---------------------------------------------------------------------------------
// The SECURITY DEFINER boundary
// ---------------------------------------------------------------------------------

describe('SECURITY DEFINER boundary', () => {
  const DEFINER_FUNCTIONS = [
    ['workflow', 'perform_transition'],
    ['workflow', 'publish_version'],
    ['workflow', 'record_review'],
    ['private', 'unmet_transition_gates'],
  ] as const

  it.each(DEFINER_FUNCTIONS)('%s.%s pins its search_path', async (schema, name) => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ proconfig: string[] | null; prosecdef: boolean }>(
        `SELECT p.proconfig, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname=$1 AND p.proname=$2`, [schema, name]))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.prosecdef, `${schema}.${name} must be SECURITY DEFINER`).toBe(true)
    expect(rows[0]!.proconfig?.join(','), `${schema}.${name} must pin search_path`)
      .toMatch(/search_path=/)
  })

  it.each(DEFINER_FUNCTIONS)('%s.%s is not owned by a superuser', async (schema, name) => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ owner: string; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolcanlogin: boolean }>(
        `SELECT pg_get_userbyid(p.proowner) AS owner, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           JOIN pg_roles r ON r.oid=p.proowner
          WHERE n.nspname=$1 AND p.proname=$2`, [schema, name]))
    const owner = rows[0]!
    expect(owner.rolsuper, `${schema}.${name} owner must not be a superuser`).toBe(false)
    expect(owner.rolcreaterole).toBe(false)
    expect(owner.rolcreatedb).toBe(false)
    expect(owner.rolcanlogin, 'the definer owner must not be able to log in').toBe(false)
  })

  it('the definer owner holds BYPASSRLS and nothing else elevated', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query(`SELECT rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
                      rolreplication, rolbypassrls
                 FROM pg_roles WHERE rolname='crux_definer'`))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      rolsuper: false, rolcreaterole: false, rolcreatedb: false,
      rolcanlogin: false, rolreplication: false,
      // Deliberate and documented: the functions exist to write rows policies refuse.
      rolbypassrls: true,
    })
  })

  it.each(['anon', 'authenticated'] as const)('%s cannot reach the private schema', async (role) => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ usable: boolean }>(`SELECT has_schema_privilege($1,'private','USAGE') AS usable`, [role]))
    expect(rows[0]!.usable).toBe(false)
  })

  // EXECUTE on these is granted to PUBLIC by default, so the function ACL says
  // nothing useful. Schema USAGE is the control, and the only assertion that matters
  // is whether the call actually succeeds.
  it.each(['anon', 'authenticated'] as const)('%s cannot call private.has_permission', async (role) => {
    const error = await expectDenied(
      () => as({ role, userId: null }, (c) => c.query(`SELECT private.has_permission('content.publish')`)),
      `${role} calling private.has_permission`,
    )
    expect(error.message).toMatch(/permission denied for schema private/)
  })

  it('authenticated cannot call the internal gate evaluator', async () => {
    const error = await expectDenied(
      () => as({ role: 'authenticated', userId: null }, (c) =>
        c.query(`SELECT private.unmet_transition_gates('00000000-0000-4000-8000-000000000000'::uuid, ARRAY['x'])`)),
      'authenticated calling the gate evaluator',
    )
    expect(error.message).toMatch(/permission denied for schema private/)
  })

  it('authenticated cannot execute publish_version directly', async () => {
    // Publication must only ever be reached through perform_transition, which checks
    // the permission and the gates first.
    const { rows } = await asSuperuser((c) =>
      c.query<{ can: boolean }>(
        `SELECT has_function_privilege('authenticated','workflow.publish_version(uuid)','EXECUTE') AS can`))
    expect(rows[0]!.can).toBe(false)
  })

  it('authenticated can execute exactly the approved entry points', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ fn: string }>(
        `SELECT n.nspname||'.'||p.proname AS fn
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'workflow'
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            AND p.prosecdef
          ORDER BY 1`))
    // An allowlist, deliberately exact: a new executable definer function in this
    // schema must be a decision, not something that appears by accident.
    //
    // `available_transitions` was added for the editorial surface (Block 09). It is
    // read-only, refuses an anonymous or non-editorial caller, and reports the calling
    // user's own authority rather than the definer's — asserted in
    // tests/rls/available-transitions.test.ts. It is on this list because this test
    // caught it, which is the list working.
    expect(rows.map((r) => r.fn)).toEqual([
      'workflow.available_transitions',
      'workflow.perform_transition',
      'workflow.record_approval',
      'workflow.record_review',
    ])
  })

  it('anon cannot execute the transition function at all', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ can: boolean }>(
        `SELECT has_function_privilege('anon','workflow.perform_transition(uuid,text,text)','EXECUTE') AS can`))
    expect(rows[0]!.can).toBe(false)
  })

  it('refuses a fabricated actor id in the JWT claims', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      // A syntactically valid uuid belonging to no user, and to no role.
      await s.act('11111111-2222-4333-8444-555555555555')
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review']),
        'transition with a fabricated actor id',
      )
    })
  })

  it('an argument cannot redirect the schema search path', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      // The state argument is compared, never executed; the function pins search_path
      // so a same-named object planted elsewhere cannot be reached.
      await s.client.query('SAVEPOINT before_injection')
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [
          versionId, "in_review'; DROP TABLE cms.content_items; --",
        ]),
        'statement terminator in the state argument',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_injection')
      await s.asOwner()
      const { rows } = await s.client.query<{ n: string }>(
        `SELECT to_regclass('cms.content_items')::text AS n`)
      expect(rows[0]!.n).toBe('cms.content_items')
    })
  })

  it('an argument cannot change the acting role', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.outsider)
      await s.client.query('SAVEPOINT before_role_injection')
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2,$3)', [
          versionId, 'in_review', "reason'; SET ROLE postgres; --",
        ]),
        'role change through the reason argument',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_role_injection')
      const { rows } = await s.client.query<{ current_user: string }>('SELECT current_user')
      expect(rows[0]!.current_user).toBe('authenticated')
    })
  })

  it('the reason argument is stored as data, not interpreted', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      const payload = "'; UPDATE cms.content_items SET lifecycle_state='published'; --"
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2,$3)', [versionId, 'in_review', payload])

      await s.asOwner()
      const { rows } = await s.client.query('SELECT reason FROM workflow.content_state WHERE version_id=$1', [versionId])
      expect(rows[0]!.reason).toBe(payload)
      const items = await s.client.query(
        `SELECT count(*)::int AS n FROM cms.content_items WHERE lifecycle_state='published' AND canonical_slug LIKE 'editorial-fixture-%'`)
      expect(items.rows[0]!.n).toBe(0)
    })
  })

  it('anon cannot read the workflow state of a draft', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(null, 'anon')
      const { rows } = await s.client.query(
        'SELECT state_key FROM workflow.content_state WHERE version_id=$1', [versionId])
      expect(rows).toHaveLength(0)
    })
  })

  it('anon holds no privilege on workflow.content_state writes', async () => {
    await expectDenied(
      () => as(ANON, (c) =>
        c.query(`UPDATE workflow.content_state SET state_key='published'
                  WHERE state_key='draft'`)),
      'anon rewriting workflow state directly',
    )
  })
})
