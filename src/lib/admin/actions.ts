'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asUser } from '@/lib/db/client'
import { requirePermission, AuthorizationError } from '@/lib/auth/permissions'

/**
 * Editorial mutations (Block 09, minimal slice).
 *
 * **Every mutation re-verifies permission server-side** (rules/backend.md 5),
 * regardless of what middleware allowed or what the interface chose to render. The
 * check here is the outer of two: the database function checks again, from the role
 * model, inside the transaction. Neither is redundant — this one produces a usable
 * error before a round trip, and that one is the control.
 *
 * **Nothing computes a gate.** `workflow.perform_transition` evaluates the gates
 * inside the publication transaction. An action that pre-checked and then called would
 * be racing itself.
 *
 * **Errors are sanitised** (rules/backend.md 16). A PostgreSQL exception message can
 * carry a schema name, a function name or a constraint name. The mapper below turns a
 * known SQLSTATE into a message for a colleague and everything else into a generic
 * failure, so an unexpected error cannot leak internals through the form.
 */

export interface ActionState {
  error?: string
  notice?: string
}

const uuid = z.string().uuid('That is not a valid identifier')

const transitionInput = z.object({
  versionId: uuid,
  toState: z.string().regex(/^[a-z][a-z0-9_]*$/, 'That is not a valid state'),
  reason: z.string().trim().max(2000).optional(),
})

const reviewInput = z.object({
  versionId: uuid,
  verdict: z.enum(['approved', 'changes_requested', 'rejected']),
  evidenceSufficient: z.boolean(),
  citationsValid: z.boolean(),
  methodologyPresent: z.boolean(),
  limitationsPresent: z.boolean(),
  figuresAccessible: z.boolean(),
  notes: z.string().trim().max(4000).optional(),
})

const approvalInput = z.object({
  versionId: uuid,
  itemId: uuid,
  decision: z.enum(['approved', 'rejected']),
  rationale: z.string().trim().min(1, 'Record why').max(4000),
})

/** Read a checkbox from a form. Absent means false; only 'on' and 'true' mean true. */
function checkbox(form: FormData, name: string): boolean {
  const v = form.get(name)
  return v === 'on' || v === 'true'
}

/**
 * Map a database failure to something a colleague can act on.
 *
 * The gate message is the one that matters: an editor blocked from publishing needs to
 * know *which* gate refused, and that list is already in the exception's message
 * because `perform_transition` builds it from the closed gate vocabulary. It contains
 * no user input and no internal path, so it is safe to pass through — which is why it
 * is extracted rather than replaced.
 */
function describe(error: unknown): string {
  const e = error as { code?: string; message?: string }
  const message = e?.message ?? ''

  const gates = message.match(/blocked by unmet gates: (.+)$/)
  if (gates) return `Blocked by unmet gates: ${gates[1]}.`

  if (message.includes('is not a declared transition')) {
    return 'That move is not permitted from the current state.'
  }
  if (message.includes('separation of duties') || message.includes('may not review their own')) {
    return 'Separation of duties: you cannot review or approve your own work.'
  }
  if (e?.code === '42501') {
    return 'You do not hold the permission this action requires.'
  }
  if (e?.code === '02000') {
    return 'That version is not in the workflow.'
  }
  return 'The action could not be completed.'
}

/** Shared shape for the three actions below. */
async function run(
  permission: string,
  versionId: string,
  work: (session: Parameters<Parameters<typeof asUser>[1]>[0], userId: string) => Promise<void>,
  successNotice: string,
): Promise<ActionState> {
  let userId: string
  try {
    const user = await requirePermission(permission)
    userId = user.id
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: error.message }
    throw error
  }

  try {
    await asUser({ userId }, (s) => work(s, userId))
  } catch (error) {
    return { error: describe(error) }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/content/${versionId}`)
  return { notice: successNotice }
}

/**
 * Move a version to a new workflow state.
 *
 * The permission checked here is `content.read_draft` — deliberately the weak one. The
 * *transition's* required permission varies by transition and is known only to
 * `workflow.transitions`, so checking a specific one here would either duplicate that
 * table or check the wrong thing. The database refuses the move if the actor lacks the
 * right permission, and writes a denial audit row when it does.
 */
export async function transitionVersion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transitionInput.safeParse({
    versionId: formData.get('versionId'),
    toState: formData.get('toState'),
    reason: formData.get('reason') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { versionId, toState, reason } = parsed.data

  return run(
    'content.read_draft',
    versionId,
    async (s) => {
      await s.query('SELECT workflow.perform_transition($1, $2, $3)', [
        versionId,
        toState,
        reason ?? null,
      ])
    },
    `Moved to ${toState.replace(/_/g, ' ')}.`,
  )
}

/** Record a review verdict for the current round. */
export async function recordReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reviewInput.safeParse({
    versionId: formData.get('versionId'),
    verdict: formData.get('verdict'),
    evidenceSufficient: checkbox(formData, 'evidenceSufficient'),
    citationsValid: checkbox(formData, 'citationsValid'),
    methodologyPresent: checkbox(formData, 'methodologyPresent'),
    limitationsPresent: checkbox(formData, 'limitationsPresent'),
    figuresAccessible: checkbox(formData, 'figuresAccessible'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const p = parsed.data
  return run(
    'content.review',
    p.versionId,
    async (s) => {
      await s.query('SELECT workflow.record_review($1, $2, $3, $4, $5, $6, $7, $8)', [
        p.versionId,
        p.verdict,
        p.evidenceSufficient,
        p.citationsValid,
        p.methodologyPresent,
        p.limitationsPresent,
        p.figuresAccessible,
        p.notes ?? null,
      ])
    },
    'Review recorded.',
  )
}

/** Record an approval decision. A rejection is recorded, not discarded. */
export async function recordApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = approvalInput.safeParse({
    versionId: formData.get('versionId'),
    itemId: formData.get('itemId'),
    decision: formData.get('decision'),
    rationale: formData.get('rationale'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const p = parsed.data
  return run(
    'content.approve',
    p.versionId,
    async (s, userId) => {
      await s.query('SELECT workflow.record_approval($1, $2, $3, $4, $5, $6)', [
        userId,
        p.itemId,
        p.versionId,
        p.decision,
        // A request identifier the database can correlate with the audit row
        // (rules/backend.md 9). Derived from the version and decision so a retry of the
        // same decision is recognisable rather than duplicated.
        `admin-${p.versionId}-${p.decision}`,
        JSON.stringify({ rationale: p.rationale }),
      ])
    },
    'Decision recorded.',
  )
}
