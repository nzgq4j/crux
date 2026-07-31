import { describe, it, expect, afterAll } from 'vitest'
import { closeTestPool, expectDenied } from '../helpers/db'
import { scenario, recordApproval } from '../helpers/editorial'

/**
 * The editorial walking skeleton, end to end.
 *
 * draft creation → submit for review → review recorded → approval → atomic
 * publication → the public can read it.
 *
 * Every step runs as the actor who is supposed to perform it, through the authorized
 * functions rather than by writing tables directly. The assertions at each step are
 * about what a *different* actor can see, because that is what the workflow is for: an
 * unpublished version is invisible to the public, and becomes visible at exactly one
 * moment.
 *
 * The public read goes against cms.content_items and cms.content_versions as `anon`,
 * governed by RLS. The deployed reading surface queries a `published_content` view
 * over the same tables; the view does not exist on the local cluster, and asserting the
 * policies directly is the stronger claim anyway — the view inherits them.
 */

afterAll(async () => {
  await closeTestPool()
})

describe('draft to published, and only then public', () => {
  it('walks the whole path and the item becomes publicly readable at publication', async () => {
    await scenario(async (s) => {
      // --- 1. Draft creation -------------------------------------------------
      const { itemId, versionId } = await s.createDraft('walking-skeleton')

      await s.asOwner()
      const initial = await s.client.query(
        'SELECT state_key FROM workflow.content_state WHERE version_id=$1', [versionId])
      expect(initial.rows[0]!.state_key).toBe('draft')

      // The public cannot see a draft. Asserted before anything else, so a later
      // "now visible" assertion means something.
      await s.act(null, 'anon')
      const draftVisible = await s.client.query(
        'SELECT id FROM cms.content_versions WHERE id=$1', [versionId])
      expect(draftVisible.rows, 'a draft version must be invisible to the public').toHaveLength(0)

      const draftItemVisible = await s.client.query(
        'SELECT id FROM cms.content_items WHERE id=$1', [itemId])
      expect(draftItemVisible.rows, 'a draft item must be invisible to the public').toHaveLength(0)

      // --- 2. Submit for review ----------------------------------------------
      await s.act(s.actors.author)
      const submitted = await s.client.query<{ t: string }>(
        'SELECT workflow.perform_transition($1,$2) AS t', [versionId, 'in_review'])
      expect(submitted.rows[0]!.t).toBe('in_review')

      // --- 3. Review recorded -------------------------------------------------
      await s.act(s.actors.reviewer)
      const review = await s.client.query<{ id: string }>(
        'SELECT workflow.record_review($1,$2,true,true,true,true,true,$3) AS id',
        [versionId, 'approved', 'accurate and well sourced'])
      expect(review.rows[0]!.id).toBeTruthy()

      // --- 4. Approval --------------------------------------------------------
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      const approved = await s.client.query<{ t: string }>(
        'SELECT workflow.perform_transition($1,$2) AS t', [versionId, 'approved'])
      expect(approved.rows[0]!.t).toBe('approved')

      // Still not public: approved is an editorial state, not a live one.
      await s.act(null, 'anon')
      const approvedVisible = await s.client.query(
        'SELECT id FROM cms.content_versions WHERE id=$1', [versionId])
      expect(approvedVisible.rows, 'an approved but unpublished version stays private').toHaveLength(0)

      // --- 5. Atomic publication ----------------------------------------------
      await s.act(s.actors.publisher)
      const published = await s.client.query<{ t: string }>(
        'SELECT workflow.perform_transition($1,$2) AS t', [versionId, 'published'])
      expect(published.rows[0]!.t).toBe('published')

      // Version, item and derived text all moved together.
      await s.asOwner()
      const state = await s.client.query(
        `SELECT v.status, v.published_at, v.plain_text, v.markdown,
                i.lifecycle_state, i.current_version_id, i.canonical_slug
           FROM cms.content_versions v JOIN cms.content_items i ON i.id = v.content_item_id
          WHERE v.id = $1`, [versionId])
      expect(state.rows[0]).toMatchObject({
        status: 'published',
        lifecycle_state: 'published',
        current_version_id: versionId,
        canonical_slug: 'walking-skeleton',
      })
      expect(state.rows[0]!.published_at).not.toBeNull()
      expect(state.rows[0]!.plain_text).toContain('The body of the fixture article.')
      expect(state.rows[0]!.markdown).toContain('The body of the fixture article.')

      // --- 6. Public query returns the published item -------------------------
      await s.act(null, 'anon')
      const publicRead = await s.client.query<{
        canonical_slug: string; title: string; plain_text: string; status: string
      }>(
        `SELECT i.canonical_slug, v.title, v.plain_text, v.status
           FROM cms.content_items i
           JOIN cms.content_versions v ON v.id = i.current_version_id
          WHERE i.canonical_slug = $1`, ['walking-skeleton'])

      expect(publicRead.rows, 'the published item must be publicly readable').toHaveLength(1)
      expect(publicRead.rows[0]).toMatchObject({
        canonical_slug: 'walking-skeleton',
        title: 'Fixture walking-skeleton',
        status: 'published',
      })
      expect(publicRead.rows[0]!.plain_text).toContain('The body of the fixture article.')

      // The structured module is readable too, which is what the renderer needs.
      const modules = await s.client.query<{ module_key: string; fragment_id: string }>(
        `SELECT module_key, fragment_id FROM cms.content_version_modules
          WHERE version_id=$1 ORDER BY position`, [versionId])
      expect(modules.rows).toHaveLength(1)
      expect(modules.rows[0]).toMatchObject({ module_key: 'prose', fragment_id: 'intro' })
    })
  })

  it('the whole path is audited, in order', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft('audited-skeleton')
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
        versionId, 'approved'])
      await recordApproval(s, versionId, s.actors.editor)
      await s.act(s.actors.editor)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
      await s.act(s.actors.publisher)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])

      await s.asOwner()
      const { rows } = await s.client.query<{ action: string; decision: string; detail: Record<string, unknown> }>(
        `SELECT action, decision, detail FROM audit.events
          WHERE resource_id=$1 ORDER BY id`, [versionId])

      const transitions = rows
        .filter((r) => r.action === 'workflow.transition')
        .map((r) => `${r.detail.from_state}->${r.detail.to_state}`)
      expect(transitions).toEqual([
        'draft->in_review',
        'in_review->approved',
        'approved->published',
      ])
      expect(rows.some((r) => r.action === 'workflow.review_recorded')).toBe(true)
      // Every recorded step succeeded; nothing was refused along the happy path.
      expect(rows.every((r) => r.decision !== 'denied')).toBe(true)
    })
  })

  it('a second version supersedes the first and the item repoints', async () => {
    await scenario(async (s) => {
      const { itemId, versionId: first } = await s.createDraft('superseding-skeleton')

      const publish = async (versionId: string) => {
        await s.act(s.actors.author)
        await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
        await s.act(s.actors.reviewer)
        await s.client.query('SELECT workflow.record_review($1,$2,true,true,true,true,true,null)', [
          versionId, 'approved'])
        await recordApproval(s, versionId, s.actors.editor)
        await s.act(s.actors.editor)
        await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
        await s.act(s.actors.publisher)
        await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])
      }

      await publish(first)

      // A second version of the same item.
      await s.asOwner()
      const v2 = await s.client.query<{ id: string }>(
        `INSERT INTO cms.content_versions (content_item_id, version_number, title, created_by)
         VALUES ($1,2,'Fixture superseding-skeleton v2',$2) RETURNING id`,
        [itemId, s.actors.author])
      const second = v2.rows[0]!.id
      await s.client.query(
        `INSERT INTO cms.content_version_modules (version_id, fragment_id, module_key, position, payload)
         VALUES ($1,'intro','prose',1,'{"text":"The body of the fixture article."}'::jsonb)`,
        [second])
      await s.client.query(
        `INSERT INTO workflow.content_state (version_id, state_key) VALUES ($1,'draft')`, [second])
      for (const [user, role] of [
        [s.actors.author, 'author'], [s.actors.reviewer, 'reviewer'],
        [s.actors.editor, 'editor'], [s.actors.publisher, 'editor'],
      ] as const) {
        await s.client.query(
          `INSERT INTO workflow.assignments (version_id,user_id,assignment_role) VALUES ($1,$2,$3)`,
          [second, user, role])
      }

      await publish(second)

      await s.asOwner()
      const { rows } = await s.client.query(
        `SELECT v.id, v.status, v.supersedes_id, v.superseded_by_id
           FROM cms.content_versions v WHERE v.content_item_id=$1 ORDER BY v.version_number`,
        [itemId])
      expect(rows[0]).toMatchObject({ id: first, status: 'superseded', superseded_by_id: second })
      expect(rows[1]).toMatchObject({ id: second, status: 'published', supersedes_id: first })

      const item = await s.client.query(
        'SELECT current_version_id FROM cms.content_items WHERE id=$1', [itemId])
      expect(item.rows[0]!.current_version_id).toBe(second)
    })
  })

  it('publication is refused when any step of the path was skipped', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft('skipped-review-skeleton')
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      // No review, no approval. The editor cannot approve.
      await s.act(s.actors.editor)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'approving with no review recorded',
      )
      await s.client.query('ROLLBACK').catch(() => undefined)
    })
  })

  it('nothing reaches the public when publication is refused', async () => {
    await scenario(async (s) => {
      const { itemId, versionId } = await s.createDraft('refused-skeleton')
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])

      await s.client.query('SAVEPOINT before_refusal')
      await s.act(s.actors.editor)
      await expectDenied(
        () => s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved']),
        'approving with unmet gates',
      )
      await s.client.query('ROLLBACK TO SAVEPOINT before_refusal')

      await s.act(null, 'anon')
      const { rows } = await s.client.query(
        'SELECT id FROM cms.content_items WHERE id=$1', [itemId])
      expect(rows).toHaveLength(0)
    })
  })
})
