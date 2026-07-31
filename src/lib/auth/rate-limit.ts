import 'server-only'
import { createHash } from 'node:crypto'
import { getPool } from '@/lib/db/client'
import { serverEnv } from '@/lib/env/server'

/**
 * Abuse limiting for authentication endpoints (rules/security.md 22–25).
 *
 * **Shared state, not process state.** The counters live in
 * `private.rate_limit_events`. A `Map` in the server process would be per-instance and
 * would reset on every deploy — a limiter that reports success and enforces nothing.
 *
 * **Applied before expensive work** (rule 23). Every caller in `./actions.ts` consults
 * this before touching the auth provider, so a flood costs a single indexed count
 * rather than a provider round-trip.
 *
 * **Subjects are hashed** (rule 6). Storing `alice@example.com` in a rate-limit table
 * creates a list of who holds an account, readable by anyone who reaches the row. The
 * digest is salted with a server-only secret so the table cannot be reversed with a
 * dictionary of candidate addresses.
 *
 * **Refusal must not disclose existence** (rule 25). The limits below are keyed on the
 * address the caller *supplied*, not on whether an account exists, so an unregistered
 * address exhausts its budget exactly as a registered one does. A limiter that only
 * counted real accounts would be an enumeration oracle.
 */

/** A limit policy. Windows are deliberately short; the point is to slow a flood. */
export interface Policy {
  readonly bucket: string
  readonly limit: number
  readonly windowSeconds: number
}

/**
 * The policies, in one place so they can be read as a set.
 *
 * Sign-in is the most permissive because a legitimate user does mistype a password.
 * Registration and reset are tighter: neither has a benign repeat case, and both send
 * mail, so an unbounded endpoint is a mail-relay abuse vector as well as an
 * enumeration one.
 */
export const POLICIES = {
  signIn: { bucket: 'sign_in', limit: 10, windowSeconds: 900 },
  register: { bucket: 'register', limit: 5, windowSeconds: 3600 },
  passwordReset: { bucket: 'password_reset', limit: 5, windowSeconds: 3600 },
  verificationResend: { bucket: 'verification_resend', limit: 3, windowSeconds: 3600 },
  passwordChange: { bucket: 'password_change', limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, Policy>

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  /** Seconds until the caller may retry. Zero when allowed. Feeds `Retry-After`. */
  retryAfterSeconds: number
}

/**
 * Salt for the subject digest.
 *
 * Falls back to the database URL — which is server-only, deployment-specific and
 * already secret — when no dedicated salt is configured. That keeps the digest
 * unguessable without adding a variable every deployment must set before
 * authentication works at all. A dedicated `AUTH_RATE_LIMIT_SALT` should be set in
 * production and is documented in `.env.example`.
 */
function salt(): string {
  const env = serverEnv()
  return env.AUTH_RATE_LIMIT_SALT ?? env.DATABASE_URL
}

/**
 * The lookup key for a subject.
 *
 * Normalised before hashing so `Alice@Example.COM ` and `alice@example.com` share a
 * budget — otherwise the limit is bypassed by changing capitalisation.
 */
export function subjectKey(bucket: string, subject: string): string {
  const normalised = subject.trim().toLowerCase()
  return createHash('sha256').update(`${salt()}:${bucket}:${normalised}`).digest('hex')
}

/**
 * Record an attempt and decide whether it may proceed.
 *
 * Runs on the platform's own connection rather than through `asUser`: the API roles
 * hold no USAGE on `private`, and correctly so — a caller able to read this table
 * could enumerate accounts, and one able to write it could clear their own budget.
 *
 * **Fails closed.** If the limiter cannot be consulted, the attempt is refused. The
 * alternative — treating a database error as permission to proceed — turns any
 * database hiccup into an open door on exactly the endpoints that most need the gate.
 */
export async function consume(policy: Policy, subject: string): Promise<RateLimitDecision> {
  const key = subjectKey(policy.bucket, subject)
  const client = await getPool().connect()
  try {
    const result = await client.query<{
      allowed: boolean
      remaining: number
      retry_after_seconds: number
    }>(
      'SELECT allowed, remaining, retry_after_seconds FROM private.check_rate_limit($1, $2, $3, make_interval(secs => $4))',
      [policy.bucket, key, policy.limit, policy.windowSeconds],
    )
    const row = result.rows[0]
    if (!row) return { allowed: false, remaining: 0, retryAfterSeconds: policy.windowSeconds }
    return {
      allowed: row.allowed,
      remaining: row.remaining,
      retryAfterSeconds: row.retry_after_seconds,
    }
  } catch {
    // Deliberately swallows the detail: the message could name the schema or the
    // function, and this value reaches an unauthenticated caller.
    return { allowed: false, remaining: 0, retryAfterSeconds: policy.windowSeconds }
  } finally {
    client.release()
  }
}

/**
 * The message shown when a limit is reached.
 *
 * Identical whatever the endpoint and whatever the account's existence, and it names
 * no count and no window beyond the wait, so it cannot be used to probe which subjects
 * are interesting.
 */
export function limitMessage(decision: RateLimitDecision): string {
  const minutes = Math.ceil(decision.retryAfterSeconds / 60)
  return minutes <= 1
    ? 'Too many attempts. Try again in a minute.'
    : `Too many attempts. Try again in ${minutes} minutes.`
}
