'use client'

import { useActionState } from 'react'
import { transitionVersion, recordReview, recordApproval, type ActionState } from '@/lib/admin/actions'
import type { TransitionOption } from '@/lib/admin/types'

/**
 * The editorial controls (Block 09, minimal slice).
 *
 * A Client Component only because `useActionState` needs one for the pending and
 * result states. It receives everything it renders as props and queries nothing
 * (rules/frontend.md 5).
 *
 * A gate listed as unmet still renders its button. That is deliberate: the point of
 * this surface is to show an editor *why* something cannot be published, and a
 * disabled control with no explanation teaches nothing. The database refuses the move,
 * and the refusal is the message.
 */

const initial: ActionState = {}

function Result({ state }: { state: ActionState }) {
  if (!state.error && !state.notice) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        state.error
          ? 'mt-3 text-[--color-text-critical]'
          : 'mt-3 text-[--color-text-muted]'
      }
    >
      {state.error ?? state.notice}
    </p>
  )
}

export function TransitionForm({
  versionId,
  options,
}: {
  versionId: string
  options: TransitionOption[]
}) {
  const [state, action, pending] = useActionState(transitionVersion, initial)

  if (options.length === 0) {
    return <p className="text-[--color-text-muted]">No transition is available from this state.</p>
  }

  return (
    <div className="space-y-6">
      {options.map((o) => (
        <form key={o.toState} action={action} className="border-t border-[--color-border] pt-4">
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="toState" value={o.toState} />

          <h3 className="font-[--font-weight-bold]">{o.toStateName}</h3>
          <p className="mt-1 text-[length:--text-small] text-[--color-text-muted]">
            {o.description}
          </p>

          <ul className="mt-2 text-[length:--text-small]">
            <li>
              Requires <code>{o.requiredPermission}</code> —{' '}
              {o.permitted ? 'you hold it' : 'you do not hold it'}
            </li>
            {o.gates.length > 0 && (
              <li>
                Gates: {o.gates.join(', ')}
                {o.unmetGates.length > 0 && (
                  <>
                    {' '}
                    — <strong>unmet: {o.unmetGates.join(', ')}</strong>
                  </>
                )}
              </li>
            )}
          </ul>

          {o.requiresReason && (
            <p className="mt-3">
              <label htmlFor={`reason-${o.toState}`} className="block">
                Reason (required)
              </label>
              <textarea
                id={`reason-${o.toState}`}
                name="reason"
                required
                rows={2}
                className="mt-1 w-full max-w-[--container-reading] border border-[--color-border] p-2"
              />
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-3 border border-[--color-border] px-4 py-2 underline-offset-4 hover:underline disabled:opacity-60"
          >
            {pending ? 'Working…' : `Move to ${o.toStateName.toLowerCase()}`}
          </button>
        </form>
      ))}
      <Result state={state} />
    </div>
  )
}

const CHECKS: Array<[string, string]> = [
  ['evidenceSufficient', 'Evidence is sufficient for the claims made'],
  ['citationsValid', 'Citations resolve and support what they are cited for'],
  ['methodologyPresent', 'Methodology is present and adequate'],
  ['limitationsPresent', 'Limitations are stated'],
  ['figuresAccessible', 'Figures carry meaningful alternative text'],
]

export function ReviewForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(recordReview, initial)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />

      <fieldset>
        <legend className="font-[--font-weight-bold]">Verdict</legend>
        {(
          [
            ['approved', 'Approve'],
            ['changes_requested', 'Request changes'],
            ['rejected', 'Reject'],
          ] as const
        ).map(([value, label]) => (
          <p key={value}>
            <input
              type="radio"
              id={`verdict-${value}`}
              name="verdict"
              value={value}
              required
              className="mr-2"
            />
            <label htmlFor={`verdict-${value}`}>{label}</label>
          </p>
        ))}
      </fieldset>

      <fieldset>
        <legend className="font-[--font-weight-bold]">Checks</legend>
        {CHECKS.map(([name, label]) => (
          <p key={name}>
            <input type="checkbox" id={name} name={name} className="mr-2" />
            <label htmlFor={name}>{label}</label>
          </p>
        ))}
      </fieldset>

      <p>
        <label htmlFor="review-notes" className="block">
          Notes
        </label>
        <textarea
          id="review-notes"
          name="notes"
          rows={3}
          className="mt-1 w-full max-w-[--container-reading] border border-[--color-border] p-2"
        />
      </p>

      <button
        type="submit"
        disabled={pending}
        className="border border-[--color-border] px-4 py-2 underline-offset-4 hover:underline disabled:opacity-60"
      >
        {pending ? 'Recording…' : 'Record review'}
      </button>
      <Result state={state} />
    </form>
  )
}

export function ApprovalForm({ versionId, itemId }: { versionId: string; itemId: string }) {
  const [state, action, pending] = useActionState(recordApproval, initial)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="itemId" value={itemId} />

      <fieldset>
        <legend className="font-[--font-weight-bold]">Decision</legend>
        {(
          [
            ['approved', 'Approve for publication'],
            ['rejected', 'Reject'],
          ] as const
        ).map(([value, label]) => (
          <p key={value}>
            <input
              type="radio"
              id={`decision-${value}`}
              name="decision"
              value={value}
              required
              className="mr-2"
            />
            <label htmlFor={`decision-${value}`}>{label}</label>
          </p>
        ))}
      </fieldset>

      <p>
        <label htmlFor="rationale" className="block">
          Rationale (required, recorded either way)
        </label>
        <textarea
          id="rationale"
          name="rationale"
          rows={3}
          required
          className="mt-1 w-full max-w-[--container-reading] border border-[--color-border] p-2"
        />
      </p>

      <button
        type="submit"
        disabled={pending}
        className="border border-[--color-border] px-4 py-2 underline-offset-4 hover:underline disabled:opacity-60"
      >
        {pending ? 'Recording…' : 'Record decision'}
      </button>
      <Result state={state} />
    </form>
  )
}
