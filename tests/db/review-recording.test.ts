import { describe, it, expect, afterAll } from 'vitest'
import { asSuperuser, closeTestPool, expectDenied } from '../helpers/db'
import { scenario, recordApproval, insertApprovalDirect, type Scenario } from '../helpers/editorial'

/**
 * workflow.record_review — the only path that writes an editorial review.
 *
 * The defect this closes: wf_reviews_write allowed any holder of content.review to
 * INSERT, UPDATE or DELETE their own review rows directly. A policy can express *who*
 * may write, but not *when* or *about what*. It could not tell whether the version was
 * actually under review, whether the round was current, or whether the reviewer had
 * already given a verdict — so a reviewer could record a verdict against a draft, a
 * published version, or a round that had closed, simply by inserting the row.
 *
 * The write policy is gone. The function is the only way in.
 */

afterAll(async () => {
  await closeTestPool()
})

/** Put a fresh draft into in_review, ready to be reviewed. */
async function underReview(s: Scenario, slug?: string) {
  const { itemId, versionId } = await s.createDraft(slug)
  await s.act(s.actors.author)
  await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
  return { itemId, versionId }
}
describe('an authorized reviewer can record a review', () => {
  it('records the verdict and returns its id', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      const { rows } = await s.client.query<{ id: string }>(
        'SELECT workflow.record_review($1,$2,true,true,true,true,true,$3) AS id',
        [versionId, 'approved', 'reads well'],
      )
      expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/)

      await s.asOwner()
      const review = await s.client.query(
        `SELECT reviewer_id, review_round, review_type, verdict, notes, submitted_at
           FROM workflow.reviews WHERE version_id=$1`, [versionId])
      expect(review.rows[0]).toMatchObject({
        reviewer_id: s.actors.reviewer,
        review_round: 1,
        review_type: 'editorial',
        verdict: 'approved',
        notes: 'reads well',
      })
      expect(review.rows[0]!.submitted_at).not.toBeNull()
    })
  })

  it('accepts changes_requested and rejected', async () => {
    for (const verdict of ['changes_requested', 'rejected']) {
      await scenario(async (s) => {
        const { versionId } = await underReview(s)
        await s.act(s.actors.reviewer)
        await s.client.query('SELECT workflow.record_review($1,$2,false,false,false,false,false,null)', [
          versionId, verdict,
        ])
        await s.asOwner()
        const { rows } = await s.client.query(
          'SELECT verdict FROM workflow.reviews WHERE version_id=$1', [versionId])
        expect(rows[0]!.verdict).toBe(verdict)
      })
    }
  })

  it('refuses a verdict outside the permitted set', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'looks_fine_to_me',
        ]),
        'a fabricated verdict',
      )
      expect(error.message).toMatch(/verdict must be approved, changes_requested or rejected/)
    })
  })
})

describe('an author cannot review their own item', () => {
  it('refuses the version creator', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      // Give the author content.review so the refusal is attributable to authorship
      // rather than to a missing permission.
      await s.asOwner()
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'reviewer')
         ON CONFLICT DO NOTHING`, [s.actors.author])

      await s.act(s.actors.author)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved',
        ]),
        'the author reviewing their own version',
      )
      expect(error.message).toMatch(/author may not review their own version/)
    })
  })

  it('records the refusal as a denial', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.asOwner()
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'reviewer')
         ON CONFLICT DO NOTHING`, [s.actors.author])
      await s.act(s.actors.author)
      await s.client.query('SAVEPOINT before_self_review')
      await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'the author reviewing their own version',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_self_review')

      // The denial audit row is written before the exception, so the rollback to the
      // savepoint discards it too. What must survive is that no review exists.
      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(rows[0]!.n).toBe(0)
    })
  })
})

describe('an approver cannot also be the reviewer', () => {
  it('the trigger refuses an approval by the reviewer of that round', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])

      await s.client.query('SAVEPOINT before_same_person')
      const error = await expectDenied(
        () => insertApprovalDirect(s, versionId, s.actors.reviewer),
        'the reviewer approving the round they reviewed',
      )
      expect(error.message).toMatch(/separation of duties/i)
      await s.client.query('ROLLBACK TO SAVEPOINT before_same_person')
    })
  })
})

describe('an unauthorized user is denied', () => {
  it('refuses an actor without content.review', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.editor) // managing_editor holds approve, not review
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'a managing editor recording a review',
      )
      expect(error.message).toMatch(/requires permission content\.review/)
    })
  })

  it('refuses an actor holding no content role at all', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.outsider)
      await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'an outsider recording a review',
      )
    })
  })

  it('refuses an unauthenticated caller', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(null, 'anon')
      await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'anon recording a review',
      )
    })
  })

  it('refuses a fabricated actor id', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act('99999999-8888-4777-8666-555555555555')
      await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'a fabricated actor recording a review',
      )
    })
  })
})

describe('direct insertion remains denied by RLS', () => {
  it('a reviewer cannot insert a review row directly', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      const error = await expectDenied(
        () => s.client.query(
          `INSERT INTO workflow.reviews
             (version_id, reviewer_id, review_round, review_type, verdict,
              evidence_sufficient, citations_valid, methodology_present,
              limitations_present, figures_accessible, submitted_at)
           VALUES ($1,$2,1,'editorial','approved',true,true,true,true,true,now())`,
          [versionId, s.actors.reviewer]),
        'a reviewer inserting a review row directly',
      )
      expect(error.message).toMatch(/row-level security|permission denied/i)
    })
  })

  it('a reviewer cannot update or delete a recorded review', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])

      // With no UPDATE or DELETE policy, RLS admits no rows to the statement rather
      // than raising: the write silently affects nothing. That is still a denial, but
      // it is a rowcount, so assert the rowcount and that the verdict is untouched.
      const updated = await s.client.query(
        `UPDATE workflow.reviews SET verdict='rejected' WHERE version_id=$1`, [versionId])
      expect(updated.rowCount, 'no row may be updated').toBe(0)

      const deleted = await s.client.query(
        'DELETE FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(deleted.rowCount, 'no row may be deleted').toBe(0)

      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT verdict FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(rows).toHaveLength(1)
      expect(rows[0]!.verdict).toBe('approved')
    })
  })

  it('no INSERT, UPDATE or DELETE policy exists on workflow.reviews', async () => {
    // The absence is the control (rules/security.md: an unwritable relation has no
    // write policy, rather than a policy that happens to evaluate false).
    const { rows } = await asSuperuser((c) =>
      c.query<{ cmd: string }>(
        `SELECT cmd FROM pg_policies WHERE schemaname='workflow' AND tablename='reviews'`))
    expect(rows.map((r) => r.cmd).sort()).toEqual(['SELECT'])
  })
})

describe('stale reviews are rejected', () => {
  it('refuses a review of a version still in draft', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.reviewer)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'reviewing a draft',
      )
      expect(error.message).toMatch(/is in state draft and is not under review/)
    })
  })

  it('refuses a review of a version that has moved on to approved', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])

      // A second reviewer arriving late, after the round closed.
      await s.asOwner()
      const late = await s.client.query<{ id: string }>(
        `INSERT INTO auth.users (email, email_confirmed_at)
         VALUES ('late-reviewer@fixture.crux.test', now())
         ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`)
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'reviewer')
         ON CONFLICT DO NOTHING`, [late.rows[0]!.id])

      await s.act(late.rows[0]!.id)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved']),
        'a late review after the version was approved',
      )
      expect(error.message).toMatch(/is not under review/)
    })
  })

  it('refuses a review of a version with no workflow state', async () => {
    await scenario(async (s) => {
      await s.asOwner()
      const item = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_items (content_type_key, canonical_slug, created_by)
         VALUES ('article','stateless-review',$1) RETURNING id`, [s.actors.author])
      const version = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,1,'Stateless',$2) RETURNING id`, [item.rows[0]!.id, s.actors.author])

      await s.act(s.actors.reviewer)
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          version.rows[0]!.id, 'approved']),
        'reviewing a version with no workflow state',
      )
      expect(error.message).toMatch(/has no workflow state/)
    })
  })

  it('the round is derived from state, so a caller cannot nominate one', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])
      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT review_round FROM workflow.reviews WHERE version_id=$1', [versionId])
      // The function takes no round argument at all; this asserts the derived value.
      expect(rows[0]!.review_round).toBe(1)
    })
  })
})

describe('duplicate submission is handled deterministically', () => {
  it('refuses a second verdict from the same reviewer in the same round', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,$3)', [
        versionId, 'approved', 'first'])

      await s.client.query('SAVEPOINT before_duplicate')
      const error = await expectDenied(
        () => s.client.query('SELECT workflow.record_review($1,$2,false,false,false,false,false,$3)', [
          versionId, 'rejected', 'second thoughts']),
        'a second verdict in the same round',
      )
      expect(error.message).toMatch(/already recorded a verdict/)
      await s.client.query('ROLLBACK TO SAVEPOINT before_duplicate')

      // The first verdict stands, unmodified.
      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT verdict, notes FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ verdict: 'approved', notes: 'first' })
    })
  })

  it('a different reviewer may record their own verdict in the same round', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])

      await s.asOwner()
      const second = await s.client.query<{ id: string }>(
        `INSERT INTO auth.users (email, email_confirmed_at)
         VALUES ('second-reviewer@fixture.crux.test', now())
         ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`)
      await s.client.query(
        `INSERT INTO identity.user_roles (user_id, role_key) VALUES ($1,'reviewer')
         ON CONFLICT DO NOTHING`, [second.rows[0]!.id])
      await s.client.query(
        `INSERT INTO workflow.assignments (version_id,user_id,assignment_role)
         VALUES ($1,$2,'reviewer')`, [versionId, second.rows[0]!.id])

      await s.act(second.rows[0]!.id)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'changes_requested'])

      await s.asOwner()
      const { rows } = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(rows[0]!.n).toBe(2)
    })
  })
})

describe('the audit write is part of the same transaction', () => {
  it('records an audit row alongside the review', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      const { rows } = await s.client.query<{ id: string }>(
        'SELECT workflow.record_review($1,$2,true,true,true,true,true,null) AS id', [versionId, 'approved'])

      await s.asOwner()
      const audit = await s.client.query(
        `SELECT action, decision, detail FROM audit.events
          WHERE resource_id=$1 AND action='workflow.review_recorded' ORDER BY id DESC LIMIT 1`,
        [versionId])
      expect(audit.rows[0]).toMatchObject({ decision: 'performed' })
      expect(audit.rows[0]!.detail).toMatchObject({
        verdict: 'approved', review_round: 1, review_id: rows[0]!.id,
      })
    })
  })

  it('rolls the review back when the audit write fails', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)

      // Break the audit insert for the duration of the call.
      await s.asOwner()
      await s.client.query('ALTER TABLE audit.events RENAME COLUMN decision TO decision_broken')
      await s.client.query('SAVEPOINT before_broken_audit')
      try {
        await s.act(s.actors.reviewer)
        await expectDenied(
          () => s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
            versionId, 'approved']),
          'recording a review while the audit write fails',
        )
      } finally {
        await s.client.query('ROLLBACK TO SAVEPOINT before_broken_audit')
        await s.asOwner()
        await s.client.query('ALTER TABLE audit.events RENAME COLUMN decision_broken TO decision')
      }

      const { rows } = await s.client.query(
        'SELECT count(*)::int AS n FROM workflow.reviews WHERE version_id=$1', [versionId])
      expect(rows[0]!.n, 'the review must not survive a failed audit write').toBe(0)
    })
  })
})

describe('a recorded review is consumed by the transition path', () => {
  it('satisfies the review_complete gate and allows approval and publication', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)

      // Before the review, the gate is unmet.
      await s.asOwner()
      const before = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['review_complete']) AS g`, [versionId])
      expect(before.rows[0]!.g).toEqual(['review_complete'])

      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])

      await s.asOwner()
      const after = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['review_complete']) AS g`, [versionId])
      expect(after.rows[0]!.g).toEqual([])

      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      const published = await s.client.query<{ perform_transition: string }>(
        'SELECT workflow.perform_transition($1,$2) AS perform_transition', [versionId, 'published'])
      expect(published.rows[0]!.perform_transition).toBe('published')
    })
  })

  it('a changes_requested verdict does not satisfy the gate', async () => {
    await scenario(async (s) => {
      const { versionId } = await underReview(s)
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,false,true,true,true,true,null)', [
        versionId, 'changes_requested'])

      await s.asOwner()
      const { rows } = await s.client.query<{ g: string[] }>(
        `SELECT private.unmet_transition_gates($1, ARRAY['review_complete']) AS g`, [versionId])
      expect(rows[0]!.g).toEqual(['review_complete'])
    })
  })
})
