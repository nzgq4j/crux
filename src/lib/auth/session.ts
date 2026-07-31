import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'
import { publicEnv } from '@/lib/env/public'

/**
 * The single server-side session helper (Block 06).
 *
 * Every protected surface reads identity through this module and no other. That is a
 * requirement rather than a convention: an identity read in two places is an identity
 * validated to two standards.
 *
 * **Validation, not decoding.** `supabase.auth.getUser()` verifies the token against
 * the auth server on each call. `getSession()` does not — it returns whatever the
 * cookie contains, which a browser controls. The distinction is the whole point of
 * this file, so `getSession` is never used here and a conformance check refuses it
 * anywhere in `src/`.
 *
 * **Expiry is the auth server's answer, not ours.** An expired token yields no user,
 * and nothing here refreshes it into an authorized session. A refresh happens in
 * middleware, where a failure is a redirect to sign-in rather than a silent upgrade.
 *
 * **No authorization here.** This module answers "who is this?" and nothing else.
 * Permissions come from the database, through `./permissions`.
 */

export interface AuthenticatedUser {
  /** The Supabase auth user id. The subject of every permission decision. */
  id: string
  email: string | null
  /** Null until the address is confirmed. Privileged capability requires it. */
  emailVerifiedAt: string | null
}

/** Is Supabase configured at all? False in local development against plain PostgreSQL. */
export function authConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

/**
 * A Supabase client bound to this request's cookies.
 *
 * The publishable key authenticates as `anon`; the user's identity rides in the
 * session cookie. Nothing privileged is available through this client, which is why
 * it is safe for it to exist on a request path at all.
 */
export async function createRequestClient() {
  const cookieStore = await cookies()
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // A Server Component cannot set cookies. Middleware refreshes the session,
          // so the failure here is expected and not an error worth surfacing.
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
          } catch {
            /* read-only cookie store */
          }
        },
      },
    },
  )
}

/**
 * The current user, or null.
 *
 * Memoised for the lifetime of one request via React `cache`, so a page that checks
 * identity in a layout and again in a component performs one validation rather than
 * several. The cache is per-request by construction — it cannot leak across requests
 * the way a module-level variable would.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  if (!authConfigured()) return null

  const supabase = await createRequestClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    emailVerifiedAt: data.user.email_confirmed_at ?? null,
  }
})

/** Has this user confirmed their address? Unverified accounts read public content only. */
export function isVerified(user: AuthenticatedUser | null): boolean {
  return Boolean(user?.emailVerifiedAt)
}
