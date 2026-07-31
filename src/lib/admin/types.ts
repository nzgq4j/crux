/**
 * Shapes returned by the editorial queries.
 *
 * Separated from `./queries` so a Client Component can name them without its import
 * graph touching a `server-only` module. A type-only import is erased at build time
 * and would ship nothing either way, but the static boundary check in
 * `tests/env/server-boundary.test.ts` reads the import graph rather than the emitted
 * bundle — and a boundary that depends on remembering to write `import type` is a
 * boundary one refactor away from being crossed for real.
 */

export interface QueueRow {
  versionId: string
  itemId: string
  publicId: string
  title: string
  contentType: string
  slug: string
  versionNumber: number
  stateKey: string
  stateName: string
  stateCategory: string
  reviewRound: number
  enteredAt: string
  isPublic: boolean
}

export interface VersionDetail extends QueueRow {
  standfirst: string | null
  executiveSummary: string | null
  methodology: string | null
  limitations: string | null
  publishedAt: string | null
  minimumEvidenceStandard: string
  requiresMethodology: boolean
  requiresLimitations: boolean
}

export interface ModuleRow {
  id: string
  moduleKey: string
  position: number
  fragmentId: string
  payload: Record<string, unknown>
}

export interface TransitionOption {
  toState: string
  toStateName: string
  requiredPermission: string
  requiresReason: boolean
  gates: string[]
  description: string
  /** Whether the signed-in user holds the permission. Display only — never a control. */
  permitted: boolean
  /** Gates currently unmet, computed by the database, not guessed here. */
  unmetGates: string[]
}

export interface ReviewRow {
  id: string
  reviewerId: string
  verdict: string
  round: number
  submittedAt: string | null
  notes: string | null
}
