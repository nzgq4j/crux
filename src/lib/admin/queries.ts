import 'server-only'
import { asUser } from '@/lib/db/client'
import { requirePermission, requireUser } from '@/lib/auth/permissions'
import type {
  QueueRow,
  VersionDetail,
  ModuleRow,
  TransitionOption,
  ReviewRow,
} from './types'

export type { QueueRow, VersionDetail, ModuleRow, TransitionOption, ReviewRow }

/**
 * Editorial reads for the administrative surface (Block 09, minimal slice).
 *
 * Two things distinguish these from `@/lib/content/queries`:
 *
 * **They run as the signed-in user**, so RLS decides what is visible. An author sees
 * the versions they are assigned to; an editor sees more. Nothing here filters by role
 * in application code — the policies already do it, and a second filter in TypeScript
 * would be a second, weaker answer to the same question.
 *
 * **They read unpublished state.** The public queries deliberately cannot. That is why
 * every entry point below establishes the caller first: a query that reads drafts must
 * never be reachable without an identity.
 */

/**
 * The editorial queue.
 *
 * Paginated, because rules/database.md 23 admits no unbounded list — even one that is
 * short today.
 */
export async function listQueue(limit = 50, offset = 0): Promise<QueueRow[]> {
  const user = await requirePermission('content.read_draft')
  const bounded = Math.min(Math.max(limit, 1), 100)

  return asUser({ userId: user.id }, async (s) => {
    const rows = await s.query<Record<string, never>>(
      `SELECT cs.version_id, cv.content_item_id, ci.public_id, cv.title,
              ci.content_type_key, ci.canonical_slug, cv.version_number,
              cs.state_key, ws.name AS state_name, ws.category AS state_category,
              cs.review_round, cs.entered_at, ws.is_public
         FROM workflow.content_state cs
         JOIN cms.content_versions cv ON cv.id = cs.version_id
         JOIN cms.content_items ci    ON ci.id = cv.content_item_id
         JOIN workflow.states ws      ON ws.key = cs.state_key
        ORDER BY ws.position, cs.entered_at DESC
        LIMIT $1 OFFSET $2`,
      [bounded, Math.max(offset, 0)],
    )
    return rows.map(toQueueRow)
  })
}

export async function getVersion(versionId: string): Promise<VersionDetail | null> {
  const user = await requirePermission('content.read_draft')

  return asUser({ userId: user.id }, async (s) => {
    const row = await s.one<Record<string, never>>(
      `SELECT cs.version_id, cv.content_item_id, ci.public_id, cv.title,
              ci.content_type_key, ci.canonical_slug, cv.version_number,
              cs.state_key, ws.name AS state_name, ws.category AS state_category,
              cs.review_round, cs.entered_at, ws.is_public,
              cv.standfirst, cv.executive_summary, cv.methodology, cv.limitations,
              cv.published_at,
              ct.minimum_evidence_standard, ct.requires_methodology, ct.requires_limitations
         FROM workflow.content_state cs
         JOIN cms.content_versions cv ON cv.id = cs.version_id
         JOIN cms.content_items ci    ON ci.id = cv.content_item_id
         JOIN cms.content_types ct    ON ct.key = ci.content_type_key
         JOIN workflow.states ws      ON ws.key = cs.state_key
        WHERE cs.version_id = $1`,
      [versionId],
    )
    if (!row) return null
    const r = row as Record<string, unknown>
    return {
      ...toQueueRow(row),
      standfirst: (r.standfirst as string) ?? null,
      executiveSummary: (r.executive_summary as string) ?? null,
      methodology: (r.methodology as string) ?? null,
      limitations: (r.limitations as string) ?? null,
      publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
      minimumEvidenceStandard: r.minimum_evidence_standard as string,
      requiresMethodology: Boolean(r.requires_methodology),
      requiresLimitations: Boolean(r.requires_limitations),
    }
  })
}

export async function getVersionModules(versionId: string): Promise<ModuleRow[]> {
  const user = await requirePermission('content.read_draft')

  return asUser({ userId: user.id }, async (s) => {
    const rows = await s.query<Record<string, never>>(
      `SELECT id, module_key, position, fragment_id, payload
         FROM cms.content_version_modules
        WHERE version_id = $1
        ORDER BY position`,
      [versionId],
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        id: r.id as string,
        moduleKey: r.module_key as string,
        position: r.position as number,
        fragmentId: r.fragment_id as string,
        payload: (r.payload as Record<string, unknown>) ?? {},
      }
    })
  })
}

/**
 * The moves available from a version's current state.
 *
 * Gates are evaluated by `private.unmet_transition_gates`, the same function the
 * transition itself calls — not re-implemented here. A second implementation would
 * eventually disagree with the first, and the interface would then promise a
 * transition the database refuses.
 *
 * `permitted` is presentation. Hiding a control is not an authorization mechanism
 * (rules/frontend.md 21); `workflow.perform_transition` re-checks everything.
 */
export async function listTransitions(versionId: string): Promise<TransitionOption[]> {
  const user = await requirePermission('content.read_draft')

  return asUser({ userId: user.id }, async (s) => {
    // Through the definer-rights wrapper: `authenticated` holds no USAGE on `private`,
    // where both the permission test and the gate evaluator live. See migration
    // 20260801130000 for why this is a function rather than a join written here.
    const rows = await s.query<Record<string, never>>(
      `SELECT to_state, to_state_name, required_permission, requires_reason,
              gates, description, permitted, unmet_gates
         FROM workflow.available_transitions($1)`,
      [versionId],
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        toState: r.to_state as string,
        toStateName: r.to_state_name as string,
        requiredPermission: r.required_permission as string,
        requiresReason: Boolean(r.requires_reason),
        gates: (r.gates as string[]) ?? [],
        description: r.description as string,
        permitted: Boolean(r.permitted),
        unmetGates: (r.unmet_gates as string[]) ?? [],
      }
    })
  })
}

export async function listReviews(versionId: string): Promise<ReviewRow[]> {
  const user = await requirePermission('content.read_draft')
  return asUser({ userId: user.id }, async (s) => {
    const rows = await s.query<Record<string, never>>(
      `SELECT id, reviewer_id, verdict, review_round, submitted_at, notes
         FROM workflow.reviews
        WHERE version_id = $1
        ORDER BY review_round, submitted_at NULLS LAST`,
      [versionId],
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        id: r.id as string,
        reviewerId: r.reviewer_id as string,
        verdict: r.verdict as string,
        round: r.review_round as number,
        submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
        notes: (r.notes as string) ?? null,
      }
    })
  })
}

/** Counts for the queue header. One query, so the page does not fan out. */
export async function stateCounts(): Promise<Array<{ state: string; name: string; count: number }>> {
  const user = await requireUser()
  return asUser({ userId: user.id }, async (s) => {
    const rows = await s.query<Record<string, never>>(
      `SELECT ws.key, ws.name, count(cs.version_id) AS n
         FROM workflow.states ws
         LEFT JOIN workflow.content_state cs ON cs.state_key = ws.key
        GROUP BY ws.key, ws.name, ws.position
        ORDER BY ws.position`,
    )
    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return { state: r.key as string, name: r.name as string, count: Number(r.n) }
    })
  })
}

function toQueueRow(row: Record<string, never>): QueueRow {
  const r = row as Record<string, unknown>
  return {
    versionId: r.version_id as string,
    itemId: r.content_item_id as string,
    publicId: r.public_id as string,
    title: r.title as string,
    contentType: r.content_type_key as string,
    slug: r.canonical_slug as string,
    versionNumber: r.version_number as number,
    stateKey: r.state_key as string,
    stateName: r.state_name as string,
    stateCategory: r.state_category as string,
    reviewRound: r.review_round as number,
    enteredAt: new Date(r.entered_at as string).toISOString(),
    isPublic: Boolean(r.is_public),
  }
}
