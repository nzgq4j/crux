import { NextResponse, type NextRequest } from 'next/server'
import { createRequestClient, authConfigured } from '@/lib/auth/session'

/**
 * The landing point for an emailed confirmation or recovery link (Block 06).
 *
 * Supabase sends the user here with a one-time code. Exchanging it establishes the
 * session; the cookie is written by the Supabase client through the request's cookie
 * store.
 *
 * **Why a route handler rather than a page.** The exchange is a state change — it
 * consumes a single-use code — and a page can be prefetched, re-rendered, or fetched
 * by a link scanner in a mail client. Consuming the code on a GET is unavoidable here
 * because that is the shape of an email link, so the handler is deliberately narrow:
 * it exchanges, redirects, and does nothing else.
 *
 * **The redirect target is not trusted.** `next` arrives in a URL the recipient can
 * edit and an attacker can craft. Only a same-origin path is honoured, so a
 * confirmation link cannot be turned into an open redirect.
 *
 * **Failure does not explain itself.** An expired, consumed or forged code all land on
 * the same page with the same message. Distinguishing them tells a prober which codes
 * were real.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
  const failure = new URL('/sign-in?confirmation=failed', origin)

  if (!authConfigured() || !code) {
    return NextResponse.redirect(failure)
  }

  const supabase = await createRequestClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(failure)
  }

  return NextResponse.redirect(new URL(destination, origin))
}
