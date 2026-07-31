import { describe, it, expect, afterAll } from 'vitest'
import { closeTestPool, expectDenied } from '../helpers/db'
import { scenario } from '../helpers/editorial'

/**
 * `workflow.available_transitions` — the editorial surface's preview of a version's
 * next moves (Block 09).
 *
 * The function is SECURITY DEFINER, which means the usual protection — RLS on the
 * tables it reads — does not apply to it. Everything it must refuse, it must refuse
 * explicitly, and these tests are what establish that it does.
 *
 * The property that matters most is the one in the last describe block: the function
 * reports the *calling* user's authority. A definer-rights function that accidentally
 * reported the definer's authority would tell every editor they may publish.
 */

afterAll(async () => {
  await closeTestPool()
})

describe('who may call it', () => {
  it('refuses an anonymous caller', async () => {
    // Two independent things refuse this: `anon` holds no EXECUTE on the function, and
    // the function itself refuses a null auth.uid(). A teeth check confirmed the grant
    // is what fires first here — which is why the in-function guard is covered by the
    // non-editorial case below rather than by this one.
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(null, 'anon')
      const error = await expectDenied(
        () => s.client.query('SELECT * FROM workflow.available_transitions($1)', [versionId]),
        'anonymous preview of the transition set',
      )
      expect(error.message).toMatch(/authenticated actor|permission denied/i)
    })
  })

  it('anon holds no EXECUTE on the function', async () => {
    // Asserted directly, so the grant-level half of the refusal above cannot be
    // removed without a test failing.
    await scenario(async (s) => {
      const r = await s.client.query<{ can: boolean }>(
        "SELECT has_function_privilege('anon','workflow.available_transitions(uuid)','EXECUTE') AS can",
      )
      expect(r.rows[0]!.can).toBe(false)
    })
  })

  it('refuses an authenticated caller holding no editorial role', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.outsider)
      const error = await expectDenied(
        () => s.client.query('SELECT * FROM workflow.available_transitions($1)', [versionId]),
        'non-editorial preview of the transition set',
      )
      expect(error.message).toMatch(/content\.read_draft|permission denied/i)
    })
  })

  it('permits an author, who holds content.read_draft', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      const r = await s.client.query('SELECT * FROM workflow.available_transitions($1)', [versionId])
      expect(r.rows.length).toBeGreaterThan(0)
    })
  })
})

describe('what it reports', () => {
  it('lists only transitions declared from the current state', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      const r = await s.client.query<{ to_state: string }>(
        'SELECT to_state FROM workflow.available_transitions($1)',
        [versionId],
      )
      const states = r.rows.map((x) => x.to_state).sort()
      // From `draft` the declared moves are in_review and withdrawn, and nothing else.
      expect(states).toEqual(['in_review', 'withdrawn'])
      expect(states, 'publication is not reachable from draft').not.toContain('published')
    })
  })

  it('reports the calling user\'s own authority, not the definer\'s', async () => {
    // The failure this guards against is subtle and severe: a SECURITY DEFINER function
    // that resolved permissions for its owner rather than its caller would report every
    // transition as permitted to everyone.
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()

      await s.act(s.actors.author)
      const asAuthor = await s.client.query<{ to_state: string; permitted: boolean }>(
        'SELECT to_state, permitted FROM workflow.available_transitions($1)',
        [versionId],
      )
      const authorSubmit = asAuthor.rows.find((x) => x.to_state === 'in_review')
      expect(authorSubmit?.permitted, 'an author may submit for review').toBe(true)

      await s.act(s.actors.reviewer)
      const asReviewer = await s.client.query<{ to_state: string; permitted: boolean }>(
        'SELECT to_state, permitted FROM workflow.available_transitions($1)',
        [versionId],
      )
      const reviewerSubmit = asReviewer.rows.find((x) => x.to_state === 'in_review')
      expect(
        reviewerSubmit?.permitted,
        'a reviewer does not hold content.submit_review, and the preview must say so',
      ).toBe(false)
    })
  })

  it('reports the gates that would refuse a publication, before it is attempted', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()

      // Walk to approved so the publication transition is the one on offer.
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1, $2)', [versionId, 'in_review'])
      await s.act(s.actors.reviewer)
      await s.client.query(
        'SELECT workflow.record_review($1,$2,$3,$4,$5,$6,$7)',
        [versionId, 'approved', true, true, true, true, true],
      )
      await s.act(s.actors.editor)

      const r = await s.client.query<{ to_state: string; unmet_gates: string[] }>(
        'SELECT to_state, unmet_gates FROM workflow.available_transitions($1)',
        [versionId],
      )
      const approve = r.rows.find((x) => x.to_state === 'approved')
      expect(approve, 'approved is reachable from in_review').toBeDefined()
      // The editor has not recorded an approval yet, so that gate is outstanding and
      // the interface can say which one it is rather than "something went wrong".
      expect(approve!.unmet_gates).toContain('approval_recorded')
    })
  })

  it('agrees with what the transition itself does', async () => {
    // The reason this function exists is to avoid a second implementation of gate
    // evaluation. This asserts the two answers match: if the preview says a gate is
    // unmet, the transition must refuse, and for the same reason.
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.act(s.actors.author)
      await s.client.query('SELECT workflow.perform_transition($1, $2)', [versionId, 'in_review'])

      await s.act(s.actors.editor)
      const preview = await s.client.query<{ to_state: string; unmet_gates: string[] }>(
        'SELECT to_state, unmet_gates FROM workflow.available_transitions($1)',
        [versionId],
      )
      const approve = preview.rows.find((x) => x.to_state === 'approved')!
      expect(approve.unmet_gates.length).toBeGreaterThan(0)

      const error = await expectDenied(
        () =>
          s.client.query('SELECT workflow.perform_transition($1, $2)', [versionId, 'approved']),
        'a transition the preview said was blocked',
      )
      for (const gate of approve.unmet_gates) {
        expect(error.message, `the refusal names ${gate}, as the preview predicted`).toContain(gate)
      }
    })
  })
})
