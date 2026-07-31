'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createRequestClient, authConfigured, getCurrentUser } from './session'
import { consume, limitMessage, POLICIES } from './rate-limit'
import { publicEnv } from '@/lib/env/public'

/**
 * Authentication server actions (Block 06).
 *
 * Three properties hold across every action here, and each is a rule rather than a
 * preference.
 *
 * **Validated at the boundary** (rules/backend.md 1). Every input goes through Zod
 * before use. Nothing trusts a value because a form produced it.
 *
 * **Rate limited before expensive work** (rules/security.md 22–23). The limiter is
 * consulted before the provider is touched, so a flood costs one indexed count.
 *
 * **Indistinguishable outcomes** (rules/security.md 25). Sign-in, registration and
 * password reset all return the same response whether or not the address is
 * registered. This is the property most easily lost by a well-meaning improvement to
 * an error message, so each one says so at the point it matters.
 */

const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address')

/**
 * Password policy.
 *
 * Length only, with a generous floor and no composition rules. WCAG 2.2's accessible
 * authentication criterion (rules/accessibility.md 2) is hostile to rules that defeat
 * password managers and memorisation strategies, and length is the property that
 * actually resists guessing. The maximum exists because a megabyte password is a
 * hashing denial-of-service, not because long passwords are bad.
 */
const passwordField = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Use no more than 200 characters')

const credentials = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
})

const registration = z.object({
  email: emailField,
  password: passwordField,
})

const resetRequest = z.object({ email: emailField })

const passwordChange = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordField,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before',
  })

export interface FormState {
  error?: string
  notice?: string
  fieldErrors?: Record<string, string>
}

export interface SignInState extends FormState {
  fieldErrors?: { email?: string; password?: string }
}

/**
 * One generic message for every sign-in failure.
 *
 * Distinguishing "no such account" from "wrong password" from "unconfirmed address"
 * tells an attacker which addresses are registered (rules/security.md 25).
 */
const GENERIC_FAILURE = 'Those details did not match an account.'

/** Collect Zod issues into per-field messages for the form to render. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

/** Same-origin paths only. An open redirect here turns sign-in into a phishing primitive. */
function safeDestination(next: string | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback
}

const NOT_AVAILABLE = 'Accounts are not available in this environment.'

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })

  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  if (!authConfigured()) return { error: NOT_AVAILABLE }

  const limit = await consume(POLICIES.signIn, parsed.data.email)
  if (!limit.allowed) return { error: limitMessage(limit) }

  const supabase = await createRequestClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { error: GENERIC_FAILURE }

  redirect(safeDestination(parsed.data.next, '/account'))
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * The response to a registration attempt, whatever happened.
 *
 * An address that is already registered must produce the same visible outcome as one
 * that is not (rules/security.md 25) — otherwise the form is an account-existence
 * oracle. Supabase's `signUp` is built for this: for an existing confirmed address it
 * returns success without creating anything and without disclosing the collision.
 */
const REGISTRATION_NOTICE =
  'Check your email. If an account can be created for that address, a confirmation link is on its way.'

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registration.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  if (!authConfigured()) return { error: NOT_AVAILABLE }

  const limit = await consume(POLICIES.register, parsed.data.email)
  if (!limit.allowed) return { error: limitMessage(limit) }

  const supabase = await createRequestClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Where the confirmation link lands. Built from the configured public origin
      // rather than from a request header: a caller-controlled Host would let an
      // attacker point somebody else's confirmation link at their own site.
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })

  // Even a provider error returns the same notice. The failure modes that reach here
  // include "already registered", and reporting it would defeat the whole design.
  // The error is not surfaced, but it is not swallowed either — Block 19's structured
  // logging is where it belongs, and that is recorded as an open item.
  if (error && error.status !== 400 && error.status !== 422) {
    return { error: 'Registration is temporarily unavailable. Try again shortly.' }
  }

  return { notice: REGISTRATION_NOTICE }
}

// ---------------------------------------------------------------------------
// Verification resend
// ---------------------------------------------------------------------------

export async function resendVerification(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequest.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  if (!authConfigured()) return { error: NOT_AVAILABLE }

  const limit = await consume(POLICIES.verificationResend, parsed.data.email)
  if (!limit.allowed) return { error: limitMessage(limit) }

  const supabase = await createRequestClient()
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
  })

  // Unconditional notice: whether the address is registered, and whether it is already
  // confirmed, are both facts this endpoint must not disclose.
  return { notice: 'If that address needs confirming, another link is on its way.' }
}

// ---------------------------------------------------------------------------
// Password recovery
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequest.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  if (!authConfigured()) return { error: NOT_AVAILABLE }

  const limit = await consume(POLICIES.passwordReset, parsed.data.email)
  if (!limit.allowed) return { error: limitMessage(limit) }

  const supabase = await createRequestClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/account/password`,
  })

  // The result is not inspected, deliberately. Reporting "no account with that
  // address" here is the classic enumeration leak.
  return { notice: 'If an account exists for that address, a reset link is on its way.' }
}

// ---------------------------------------------------------------------------
// Password change
// ---------------------------------------------------------------------------

/**
 * Change the signed-in user's password, then invalidate every other session.
 *
 * **Re-authentication first.** `updateUser` alone would let anyone with a live session
 * — a borrowed laptop, a stolen cookie — change the password and lock the owner out.
 * The current password is verified before the change is attempted.
 *
 * **Other sessions are revoked** (rules/security.md 11). A password change exists to
 * end an attacker's access; leaving their session alive makes it ceremonial.
 * `signOut({ scope: 'others' })` keeps this browser signed in and invalidates the
 * rest, so the legitimate user is not logged out of the tab they just used.
 */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordChange.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  })

  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  if (!authConfigured()) return { error: NOT_AVAILABLE }

  const user = await getCurrentUser()
  if (!user?.email) return { error: 'Sign in to change your password.' }

  const limit = await consume(POLICIES.passwordChange, user.id)
  if (!limit.allowed) return { error: limitMessage(limit) }

  const supabase = await createRequestClient()

  // Re-authenticate. Unlike sign-in, naming this failure discloses nothing: the caller
  // already holds a session for this account.
  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (reauth) return { fieldErrors: { currentPassword: 'That is not your current password' } }

  const { error: update } = await supabase.auth.updateUser({ password: parsed.data.newPassword })
  if (update) return { error: 'The password could not be changed. Try again shortly.' }

  await supabase.auth.signOut({ scope: 'others' })

  return { notice: 'Password changed. Any other signed-in devices have been signed out.' }
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  if (authConfigured()) {
    const supabase = await createRequestClient()
    await supabase.auth.signOut()
  }
  redirect('/')
}
