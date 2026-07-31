import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env/public'

/**
 * Session refresh and route gating (Block 06).
 *
 * Two jobs, and it is worth being precise about which is which.
 *
 * **Refresh.** A Supabase access token is short-lived. Middleware is the one place
 * that can both read the request cookies and write them back, so it is where a
 * refresh happens. Without it a signed-in user is silently signed out when their
 * token expires mid-session.
 *
 * **Gating.** Protected paths redirect an anonymous visitor to sign-in. This is a
 * courtesy, not a control: it decides what is worth rendering, never what is allowed.
 * Every route handler and server action re-verifies permission for itself
 * (rules/frontend.md 21). Middleware that failed open would be a routing bug, not a
 * security hole — which is the property to preserve.
 *
 * Middleware runs on the edge runtime and cannot reach the database, so it makes no
 * authorization decision at all. It knows whether someone is signed in. It does not
 * know what they may do.
 */

/** Paths that require a signed-in user. Prefix match. */
const PROTECTED_PREFIXES = ['/admin', '/account'] as const

/** Paths a signed-in user has no reason to see. */
const AUTH_PREFIXES = ['/sign-in'] as const

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = matches(pathname, PROTECTED_PREFIXES)
  const isAuthRoute = matches(pathname, AUTH_PREFIXES)

  if (!isProtected && !isAuthRoute) return NextResponse.next()

  // Through the validated accessor, like everywhere else. It is edge-safe: it reads
  // only NEXT_PUBLIC_ values, which Next inlines at build time.
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  // Supabase is not configured — local development against plain PostgreSQL. A
  // protected route must not become open just because auth is absent, so it is
  // refused rather than allowed.
  if (!url || !key) {
    if (isProtected) {
      const signIn = request.nextUrl.clone()
      signIn.pathname = '/sign-in'
      signIn.searchParams.set('next', pathname)
      return NextResponse.redirect(signIn)
    }
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  // getUser, never getSession: this call validates the token and refreshes it as a
  // side effect. getSession would return whatever the cookie claims.
  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (isProtected && !user) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    signIn.searchParams.set('next', pathname)
    return NextResponse.redirect(signIn)
  }

  if (isAuthRoute && user) {
    const home = request.nextUrl.clone()
    home.pathname = '/account'
    home.search = ''
    return NextResponse.redirect(home)
  }

  return response
}

export const config = {
  // Everything except static assets and the image optimiser. Listed as an exclusion
  // so a new protected route is covered by default rather than by remembering to add
  // it — the failure mode of an allowlist is a route nobody is refreshing.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
