'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/auth/actions'

/**
 * A shared form shell for the credential-adjacent surfaces (register, reset request,
 * verification resend, password change).
 *
 * One component rather than four, because the accessibility obligations are identical
 * and four copies would drift: every control programmatically labelled, every error
 * associated with its field through `aria-describedby` and marked `aria-invalid`, a
 * live region for the form-level message, and state carried by text rather than by
 * colour alone (rules/accessibility.md 14, 15, 26).
 *
 * The `notice` case matters as much as the error case. Registration and password reset
 * both answer identically whether or not the address exists, so the success notice is
 * the *only* thing most callers see, and it has to be announced.
 */

export interface FieldSpec {
  name: string
  label: string
  type: 'email' | 'password' | 'text'
  autoComplete?: string
  hint?: string
  required?: boolean
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>
  fields: FieldSpec[]
  submitLabel: string
  pendingLabel: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {})

  return (
    <form action={formAction} noValidate className="max-w-[28rem]">
      <div role="status" aria-live="polite">
        {state.error && (
          <p className="mb-6 border-l-4 border-[--color-danger] px-4 py-3">{state.error}</p>
        )}
        {state.notice && (
          <p className="mb-6 border-l-4 border-[--color-border] px-4 py-3">{state.notice}</p>
        )}
      </div>

      {fields.map((f) => {
        const error = state.fieldErrors?.[f.name]
        const describedBy =
          [error ? `${f.name}-error` : null, f.hint ? `${f.name}-hint` : null]
            .filter(Boolean)
            .join(' ') || undefined

        return (
          <div key={f.name} className="mb-5">
            <label htmlFor={f.name} className="mb-2 block font-medium">
              {f.label}
            </label>
            {f.hint && (
              <p id={`${f.name}-hint`} className="mb-2 text-[--text-caption] text-[--color-ink-muted]">
                {f.hint}
              </p>
            )}
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              required={f.required ?? true}
              {...(f.autoComplete ? { autoComplete: f.autoComplete } : {})}
              aria-invalid={error ? true : undefined}
              {...(describedBy ? { 'aria-describedby': describedBy } : {})}
              className="w-full border border-[--color-border] px-3 py-2"
            />
            {error && (
              <p id={`${f.name}-error`} className="mt-2 text-[--color-danger]">
                {error}
              </p>
            )}
          </div>
        )
      })}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="border border-[--color-border] px-4 py-2 underline-offset-4 hover:underline disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  )
}
