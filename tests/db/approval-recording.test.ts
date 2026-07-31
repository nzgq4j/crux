import { describe, it, expect, afterAll } from 'vitest'
import { asSuperuser, closeTestPool, expectDenied } from '../helpers/db'
import { scenario, recordApproval, insertApprovalDirect, type Scenario } from '../helpers/editorial'

/**
 * workflow.record_approval — the only path that writes an editorial approval.
 *
 * The defect this closes: wf_approvals_write let any holder of content.approve INSERT,
 * UPDATE or DELETE their own approval rows. A policy expresses who may write, not
 * when, about what, or on what basis. It could not tell whether the version was under
 * review, whether it had been superseded, or whether any review had been completed —
 * so an approval could be recorded against a version nobody had reviewed, and the
 * approval_recorded gate would then pass on it.
 *
 * The read policy and the separation-of-duties trigger are untouched. The write policy
 * is gone, which narrows access rather than widening it.
 */

afterAll(async () => {
  await closeTestPool()
})

const RATIONALE = JSON.stringify({ summary: 'Sound and well evidenced.', basis: 'editorial review' })

/** A version in_review with a completed approving review, ready to be approved. */
async function reviewed(s: Scenario, slug?: string) {
  const { itemId, versionId } = await s.createDraft(slug)
  await s.act(s.actors.author)
  await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
  await s.act(s.actors.reviewer)
  await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
    versionId, 'approved',
  ])
  return { itemId, versionId }
}

/** Call the action directly, so a test can vary any single argument. */
function callApproval(
  s: Scenario,
  args: {
    actor: string
    itemId: string
    versionId: string
    decision?: string
    requestId?: string
    rationale?: string | null
  },
) {
  return s.client.query<{ id: string }>(
    'SELECT workflow.record_approval($1,$2,$3,$4,$5,$6::jsonb) AS id',
    [
      args.actor,
      args.itemId,
      args.versionId,
      args.decision ?? 'approved',
      args.requestId ?? 'test-request-approval',
      args.rationale === null ? null : (args.rationale ?? RATIONALE),
    ],
  )
}

// 1 ---------------------------------------------------------------------------------

describe('an authorized approver can approve a reviewed version', () => {
  it('records the approval and returns its id', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      const { rows } = await callApproval(s, { actor: s.actors.editor, itemId, versionId })
      expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/)

      await s.asOwner()
      const approval = await s.client.query(
        `SELECT approver_id, review_round, decision, approval_scope, review_id, notes
           FROM workflow.approvals WHERE version_id=$1`, [versionId])
      expect(approval.rows[0]).toMatchObject({
        approver_id: s.actors.editor,
        review_round: 1,
        decision: 'approved',
        approval_scope: 'final',
        notes: 'Sound and well evidenced.',
      })
      // Bound to the review it rests on.
      const review = await s.client.query(
        'SELECT id FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(approval.rows[0]!.review_id).toBe(review.rows[0]!.id)
    })
  })

  it('records a rejected decision', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId, decision: 'rejected' })
      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT decision FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(rows[0]!.decision).toBe('rejected')
    })
  })

  it('refuses a decision outside the permitted set', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId, decision: 'maybe' }),
        'a fabricated decision',
      )
      expect(error.message).toMatch(/decision must be approved or rejected/)
    })
  })

  it('requires a request id and a structured rationale', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)

      await s.client.query('SAVEPOINT no_request_id')
      const noRequest = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId, requestId: '  ' }),
        'an approval with no request id',
      )
      expect(noRequest.message).toMatch(/requires a request id/)
      await s.client.query('ROLLBACK TO SAVEPOINT no_request_id')

      for (const rationale of [null, '{}', '"just a string"']) {
        await s.client.query('SAVEPOINT bad_rationale')
        const error = await expectDenied(
          () => callApproval(s, { actor: s.actors.editor, itemId, versionId, rationale }),
          `an approval with rationale ${String(rationale)}`,
        )
        expect(error.message).toMatch(/structured rationale object/)
        await s.client.query('ROLLBACK TO SAVEPOINT bad_rationale')
      }
    })
  })

  it('refuses a version that does not belong to the named item', async () => {
    await scenario(async (s) => {
      const { versionId } = await reviewed(s, 'pairing-a')
      const other = await s.createDraft('pairing-b')
      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId: other.itemId, versionId }),
        'approving a version against the wrong item',
      )
      expect(error.message).toMatch(/does not belong to item/)
    })
  })
})

// 2 ---------------------------------------------------------------------------------

describe('an unauthorized actor is denied', () => {
  it('refuses an actor without content.approve', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.reviewer) // holds content.review, not approve
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.reviewer, itemId, versionId }),
        'a reviewer recording an approval',
      )
      expect(error.message).toMatch(/requires permission content\.approve/)
    })
  })

  it('refuses an actor holding no content role', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.outsider)
      await expectDenied(
        () => callApproval(s, { actor: s.actors.outsider, itemId, versionId }),
        'an outsider recording an approval',
      )
    })
  })

  it('refuses an unauthenticated caller', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(null, 'anon')
      await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'anon recording an approval',
      )
    })
  })

  it('refuses a declared actor that is not the authenticated one', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      // The editor is authenticated but claims to be acting as the publisher.
      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.publisher, itemId, versionId }),
        'an approval declaring a different actor',
      )
      expect(error.message).toMatch(/declared actor does not match the authenticated actor/)
    })
  })

  it('refuses a fabricated actor id', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act('44444444-3333-4222-8111-000000000000')
      await expectDenied(
        () => callApproval(s, { actor: '44444444-3333-4222-8111-000000000000', itemId, versionId }),
        'a fabricated actor recording an approval',
      )
    })
  })
})

// 3, 4 ------------------------------------------------------------------------------

describe('separation of duties', () => {
  it('the author cannot approve their own content', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      // Give the author content.approve so the refusal is attributable to authorship.
      await s.asOwner()
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'managing_editor')
         ON CONFLICT DO NOTHING`, [s.actors.author])

      await s.act(s.actors.author)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.author, itemId, versionId }),
        'the author approving their own version',
      )
      expect(error.message).toMatch(/author may not approve their own version/)
    })
  })

  it('the reviewer of record cannot also approve', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.asOwner()
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'managing_editor')
         ON CONFLICT DO NOTHING`, [s.actors.reviewer])

      await s.act(s.actors.reviewer)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.reviewer, itemId, versionId }),
        'the reviewer approving the round they reviewed',
      )
      expect(error.message).toMatch(/reviewer of record may not also approve/)
    })
  })

  it('the existing trigger still refuses a row that reaches the table another way', async () => {
    await scenario(async (s) => {
      const { versionId } = await reviewed(s)
      await s.client.query('SAVEPOINT before_direct')
      const error = await expectDenied(
        () => insertApprovalDirect(s, versionId, s.actors.reviewer),
        'a direct approval row by the reviewer',
      )
      expect(error.message).toMatch(/separation of duties/i)
      await s.client.query('ROLLBACK TO SAVEPOINT before_direct')
    })
  })
})

// 5 ---------------------------------------------------------------------------------

describe('approval without a completed review is rejected', () => {
  it('refuses when no review exists', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'approving with no review',
      )
      expect(error.message).toMatch(/no completed approving review/)
    })
  })

  it('refuses when the only review requested changes', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,false,true,true,true,true,null)', [
        versionId, 'changes_requested'])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'approving over a changes_requested verdict',
      )
      expect(error.message).toMatch(/no completed approving review/)
    })
  })
})

// 6 ---------------------------------------------------------------------------------

describe('a stale version is rejected', () => {
  it('refuses a version that is still a draft', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await s.createDraft()
      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'approving a draft',
      )
      expect(error.message).toMatch(/is not awaiting approval/)
    })
  })

  it('refuses a version that has already been published', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'approving an already published version',
      )
      expect(error.message).toMatch(/has status published and cannot be approved/)
    })
  })

  it('refuses a superseded version', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.asOwner()
      // Mark it superseded without publishing, so the staleness branch is what fires.
      await s.client.query(
        `UPDATE cms.content_versions SET superseded_by_id = id WHERE id = $1`, [versionId])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'approving a superseded version',
      )
      expect(error.message).toMatch(/cannot be approved/)
    })
  })

  it('refuses a version with no workflow state', async () => {
    await scenario(async (s) => {
      await s.asOwner()
      const item = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ('article','stateless-approval',$1) RETURNING id`, [s.actors.author])
      const version = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,'Stateless',$2) RETURNING id`, [item.rows[0]!.id, s.actors.author])

      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => callApproval(s, {
          actor: s.actors.editor, itemId: item.rows[0]!.id, versionId: version.rows[0]!.id }),
        'approving a version with no workflow state',
      )
      expect(error.message).toMatch(/has no workflow state/)
    })
  })

  it('refuses a version that does not exist', async () => {
    await scenario(async (s) => {
      const { itemId } = await s.createDraft()
      await s.act(s.actors.editor)
      await expectDenied(
        () => callApproval(s, {
          actor: s.actors.editor, itemId, versionId: '00000000-0000-4000-8000-000000000000' }),
        'approving a fabricated version id',
      )
    })
  })
})

// 7, 8 ------------------------------------------------------------------------------

describe('duplicate and conflicting approvals', () => {
  // Documented contract: one decision per round. A second is refused rather than
  // absorbed, because an approval is evidence and overwriting it would lose the fact
  // that the outcome changed. A different outcome requires a new review round.
  it('refuses a duplicate approval with the same decision', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId })

      await s.client.query('SAVEPOINT before_duplicate')
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
        'a second identical approval',
      )
      expect(error.message).toMatch(/already has a recorded approval/)
      await s.client.query('ROLLBACK TO SAVEPOINT before_duplicate')

      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(rows[0]!.n).toBe(1)
    })
  })

  it('refuses a conflicting decision, and says so specifically', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId, decision: 'approved' })

      await s.client.query('SAVEPOINT before_conflict')
      const error = await expectDenied(
        () => callApproval(s, { actor: s.actors.editor, itemId, versionId, decision: 'rejected' }),
        'reversing a recorded approval',
      )
      expect(error.message).toMatch(/already recorded as approved and cannot also be recorded as rejected/)
      await s.client.query('ROLLBACK TO SAVEPOINT before_conflict')

      // The original decision stands.
      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT decision FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(rows).toHaveLength(1)
      expect(rows[0]!.decision).toBe('approved')
    })
  })

  it('refuses a second approver in the same round', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId })

      await s.asOwner()
      const other = await s.client.query<{ id: string }>(
        `INSERT INTO auth.users (email, email_confirmed_at)
         VALUES ('second-approver@fixture.crux.test', now())
         ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`)
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'managing_editor')
         ON CONFLICT DO NOTHING`, [other.rows[0]!.id])

      await s.act(other.rows[0]!.id)
      await expectDenied(
        () => callApproval(s, { actor: other.rows[0]!.id, itemId, versionId }),
        'a second approver in the same round',
      )
    })
  })
})

// 9 ---------------------------------------------------------------------------------

describe('direct insertion remains denied', () => {
  it('an approver cannot insert an approval row directly', async () => {
    await scenario(async (s) => {
      const { versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      const error = await expectDenied(
        () => s.client.query(
          `INSERT INTO workflow.approvals (version_id, review_round, approver_id, approval_scope)
           VALUES ($1,1,$2,'final')`, [versionId, s.actors.editor]),
        'an approver inserting an approval row directly',
      )
      expect(error.message).toMatch(/row-level security|permission denied/i)
    })
  })

  it('an approver cannot update or delete a recorded approval', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId })

      // No UPDATE or DELETE policy: RLS admits no rows rather than raising.
      const updated = await s.client.query(
        `UPDATE workflow.approvals SET decision='rejected' WHERE version_id=$1`, [versionId])
      expect(updated.rowCount, 'no row may be updated').toBe(0)
      const deleted = await s.client.query(
        'DELETE FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(deleted.rowCount, 'no row may be deleted').toBe(0)

      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT decision FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(rows).toHaveLength(1)
      expect(rows[0]!.decision).toBe('approved')
    })
  })

  it('only a SELECT policy exists on workflow.approvals', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ cmd: string }>(
        `SELECT cmd FROM pg_policies WHERE schemaname='workflow' AND tablename='approvals'`))
    expect(rows.map((r) => r.cmd).sort()).toEqual(['SELECT'])
  })

  it('the read policy and the separation trigger are still in place', async () => {
    const policy = await asSuperuser((c) =>
      c.query(`SELECT policyname FROM pg_policies
                WHERE schemaname='workflow' AND tablename='approvals' AND policyname='wf_approvals_read'`))
    expect(policy.rows).toHaveLength(1)

    const trigger = await asSuperuser((c) =>
      c.query(`SELECT tgname FROM pg_trigger
                WHERE tgrelid='workflow.approvals'::regclass
                  AND tgname='approvals_separation_of_duties' AND NOT tgisinternal`))
    expect(trigger.rows).toHaveLength(1)
  })
})

// 10 --------------------------------------------------------------------------------

describe('audit', () => {
  it('writes an audit row alongside the approval', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      const { rows } = await callApproval(s, {
        actor: s.actors.editor, itemId, versionId, requestId: 'req-approval-0001' })

      await s.asOwner()
      const audit = await s.client.query(
        `SELECT actor_id, decision, request_id, detail FROM audit.events
          WHERE resource_id=$1 AND action='workflow.approval_recorded' ORDER BY id DESC LIMIT 1`,
        [versionId])
      expect(audit.rows[0]).toMatchObject({
        actor_id: s.actors.editor,
        decision: 'performed',
        request_id: 'req-approval-0001',
      })
      expect(audit.rows[0]!.detail).toMatchObject({
        approval_id: rows[0]!.id,
        item_id: itemId,
        decision: 'approved',
        review_round: 1,
      })
      expect(audit.rows[0]!.detail.rationale).toMatchObject({ summary: 'Sound and well evidenced.' })
    })
  })

  it('rolls the approval back when the audit write fails', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)

      await s.asOwner()
      await s.client.query('ALTER TABLE audit.events RENAME COLUMN decision TO decision_broken')
      await s.client.query('SAVEPOINT before_broken_audit')
      try {
        await s.act(s.actors.editor)
        await expectDenied(
          () => callApproval(s, { actor: s.actors.editor, itemId, versionId }),
          'recording an approval while the audit write fails',
        )
      } finally {
        await s.client.query('ROLLBACK TO SAVEPOINT before_broken_audit')
        await s.asOwner()
        await s.client.query('ALTER TABLE audit.events RENAME COLUMN decision_broken TO decision')
      }

      const { rows } = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(rows[0]!.n, 'the approval must not survive a failed audit write').toBe(0)
    })
  })
})

// 11, 12 ----------------------------------------------------------------------------

describe('the approval is consumed by the transition path', () => {
  it('satisfies approval_recorded and allows approval and publication', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)

      await s.asOwner()
      const before = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['approval_recorded']) AS g`, [versionId])
      expect(before.rows[0]!.g).toEqual(['approval_recorded'])

      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId })

      await s.asOwner()
      const after = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['approval_recorded']) AS g`, [versionId])
      expect(after.rows[0]!.g).toEqual([])

      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      const { rows } = await s.client.query<{ t: string }>(
        'SELECT workflow.perform_transition($1,$2) AS t', [versionId, 'published'])
      expect(rows[0]!.t).toBe('published')
    })
  })

  it('publication fails when the approval action has not succeeded', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)

      // The approval attempt fails — the actor lacks the permission.
      await s.client.query('SAVEPOINT before_failed_approval')
      await s.act(s.actors.reviewer)
      await expectDenied(
        () => callApproval(s, { actor: s.actors.reviewer, itemId, versionId }),
        'an unauthorised approval attempt',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_failed_approval')

      // So the version cannot leave in_review, and therefore cannot be published.
      await s.act(s.actors.editor)
      const approveError = await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'approving with no recorded approval',
      )
      expect(approveError.message).toMatch(/approval_recorded/)
    })
  })

  it('a rejected decision does not satisfy the gate', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, { actor: s.actors.editor, itemId, versionId, decision: 'rejected' })

      await s.asOwner()
      const { rows } = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['approval_recorded']) AS g`, [versionId])
      expect(rows[0]!.g, 'a rejection is not an approval').toEqual(['approval_recorded'])
    })
  })
})

// Boundary --------------------------------------------------------------------------

describe('the definer boundary', () => {
  it('pins search_path, is owned by the non-superuser role, and is definer', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ prosecdef: boolean; proconfig: string[]; owner: string; rolsuper: boolean }>(
        `SELECT p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner, r.rolsuper
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           JOIN pg_roles r ON r.oid=p.proowner
          WHERE n.nspname='workflow' AND p.proname='record_approval'`))
    expect(rows[0]!.prosecdef).toBe(true)
    expect(rows[0]!.proconfig.join(',')).toMatch(/search_path=/)
    expect(rows[0]!.owner).toBe('crux_definer')
    expect(rows[0]!.rolsuper).toBe(false)
  })

  it('is executable by authenticated and service_role, and by nobody else', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ anon: boolean; auth: boolean; svc: boolean; pub: boolean }>(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
                has_function_privilege('service_role', $1, 'EXECUTE') AS svc,
                has_function_privilege('public', $1, 'EXECUTE') AS pub`,
        ['workflow.record_approval(uuid,uuid,uuid,text,text,jsonb)']))
    expect(rows[0]).toMatchObject({ anon: false, auth: true, svc: true, pub: false })
  })

  it('does not give API roles access to the private schema', async () => {
    const { rows } = await asSuperuser((c) =>
      c.query<{ role: string; usable: boolean }>(
        `SELECT r AS role, has_schema_privilege(r,'private','USAGE') AS usable
           FROM unnest(ARRAY['anon','authenticated']) AS r`))
    for (const row of rows) expect(row.usable, `${row.role} must not reach private`).toBe(false)
  })

  it('arguments are data, not SQL', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await reviewed(s)
      await s.act(s.actors.editor)
      await callApproval(s, {
        actor: s.actors.editor, itemId, versionId,
        requestId: "req'; DROP TABLE cms.content_items; --",
        rationale: JSON.stringify({ summary: "'; DELETE FROM workflow.approvals; --" }),
      })
      await s.asOwner()
      const { rows } = await s.client.query<{ n: string }>(
        `SELECT to_regclass('cms.content_items')::text AS n`)
      expect(rows[0]!.n).toBe('cms.content_items')
      const approvals = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.approvals WHERE version_id=$1', [versionId])
      expect(approvals.rows[0]!.n).toBe(1)
    })
  })
})
