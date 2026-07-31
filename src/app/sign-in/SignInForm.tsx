'use client'

import { useActionState } from 'react'
import { signIn, type SignInState } from '@/lib/auth/actions'

/**
 * Sign-in form.
 *
 * Accessibility is a completion requirement of the block that introduces a surface
 * (rules/accessibility.md 3), so it is here rather than deferred:
 *
 * - Every control has a programmatic label, not a placeholder standing in for one.
 * - An error is associated with its field through aria-describedby and marked with
 *   aria-invalid, so a screen reader reaches it from the field.
 * - The form-level error is a live region, announced when it appears.
 * - Error state is carried by text and by aria-invalid, never by colour alone
 *   (rules/accessibility.md 26).
 * - The submit button reports its own busy state rather than only looking different.
 */
export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {})

  return (
    <form action={formAction} noValidate className="max-w-[28rem]">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div
        role="alert"
        aria-live="polite"
        className={state.error ? 'mb-6 border-l-4 border-[--color-danger] px-4 py-3' : undefined}
      >
        {state.error ? <p className="text-[--text-body]">{state.error}</p> : null}
      </div>

      <div className="mb-5">
        <label htmlFor="email" className="mb-2 block font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          className="w-full border border-[--color-rule] bg-[--color-surface] px-3 py-2"
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="mt-2 text-[--text-caption] text-[--color-danger]">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="mb-2 block font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          className="w-full border border-[--color-rule] bg-[--color-surface] px-3 py-2"
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="mt-2 text-[--text-caption] text-[--color-danger]">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="border border-[--color-ink] px-5 py-2 font-medium disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
