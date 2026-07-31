'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createRequestClient, authConfigured } from './session'

/**
 * Authentication server actions (Block 06).
 *
 * Every input is validated with Zod at the trust boundary before use
 * (rules/backend.md 1). Nothing here trusts a value because a form produced it.
 */

const credentials = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
})

export interface SignInState {
  error?: string
  fieldErrors?: { email?: string; password?: string }
}

/**
 * A single generic message for every failure mode.
 *
 * Distinguishing "no such account" from "wrong password" tells an attacker which
 * addresses are registered. The same string is returned whether the account is
 * absent, the password is wrong, or the address is unconfirmed (rules/security.md 25).
 */
const GENERIC_FAILURE = 'Those details did not match an account.'

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })

  if (!parsed.success) {
    const fieldErrors: SignInState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'email' || field === 'password') fieldErrors[field] = issue.message
    }
    return { fieldErrors }
  }

  if (!authConfigured()) {
    // Stated plainly rather than reported as a credential failure: this is a
    // deployment condition, and pretending otherwise would send someone to reset a
    // password that was never the problem.
    return { error: 'Sign-in is not available in this environment.' }
  }

  const supabase = await createRequestClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { error: GENERIC_FAILURE }

  // Only same-origin paths. An open redirect here would turn sign-in into a phishing
  // primitive.
  const next = parsed.data.next
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
  redirect(destination)
}

export async function signOut(): Promise<void> {
  if (authConfigured()) {
    const supabase = await createRequestClient()
    await supabase.auth.signOut()
  }
  redirect('/')
}
