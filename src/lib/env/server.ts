import 'server-only'
import { z } from 'zod'
import { publicEnv } from './public'
import { resolveDatabaseUrl } from './database-url'

/**
 * Server environment (Workstream 2).
 *
 * `import 'server-only'` above is the boundary: importing this module from a Client
 * Component is a build error, not a runtime surprise. That matters because this schema
 * names every secret the platform holds, and a module that merely *throws* in the
 * browser has already been bundled by the time it does so.
 *
 * The runtime guard in `serverEnv()` is retained as well. The two protect different
 * things — the import is caught at build time by the bundler, the guard catches a
 * server module reached through an unexpected path at runtime.
 *
 * `DATABASE_URL` is the single canonical runtime database variable. Its validation
 * lives in `./database-url` so it can be tested without touching `process.env`.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * The deployment environment, which decides how strict configuration validation is.
   *
   * Optional here and resolved below rather than defaulting to `development`. A
   * default of `development` is fail-open: every check keyed on this variable — the
   * database URL rules, the SUPABASE_SECRET_KEY requirement — silently switches off
   * when nobody remembers to set it, which is exactly the deployment that most needs
   * them. When it is unset, a production NODE_ENV is treated as production.
   */
  CRUX_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),

  /**
   * The canonical database connection string.
   *
   * Optional in the schema and resolved afterwards, because whether it is required —
   * and what counts as an acceptable value — depends on CRUX_ENV. Development and
   * test fall back to the local cluster; staging and production must supply a real
   * host and are checked for local addresses, development database names and
   * placeholder credentials.
   *
   * There is no separate pooled or direct variable. Supabase distinguishes a pooled
   * connection from a direct one, but nothing in this codebase opens a direct
   * connection yet, and a variable that is parsed but unused is a configuration trap.
   * Add one when something needs it.
   */
  DATABASE_URL: z.string().optional(),

  SUPABASE_SECRET_KEY: z.string().min(1).optional(),

  /**
   * Salt for the abuse-limiter's subject digest (rules/security.md 6, 22).
   *
   * Optional, and falls back to DATABASE_URL — itself server-only and
   * deployment-specific — so that authentication is not bricked by an unset variable.
   * Set it explicitly in production: rotating it independently of the database
   * password is the only way to invalidate the digest space without a credential
   * rotation, and sharing the value with the connection string couples the two.
   */
  AUTH_RATE_LIMIT_SALT: z.string().min(16).optional(),

  EMAIL_PROVIDER: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  NEWSLETTER_PROVIDER: z.string().optional(),
  NEWSLETTER_API_KEY: z.string().optional(),

  EMBEDDING_PROVIDER: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_API_KEY: z.string().optional(),

  ANALYTICS_PROVIDER: z.string().optional(),
  ANALYTICS_SITE_ID: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  WEBHOOK_SIGNING_SECRET: z.string().optional(),

  /** Google OAuth (Block 28). The secret is server-side only, always. */
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URL: z.string().url().optional(),
  SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export type Environment = 'development' | 'test' | 'staging' | 'production'

type ParsedServerEnv = z.infer<typeof serverSchema>

/** DATABASE_URL is resolved, so the exposed type is narrower than the schema's. */
export type ServerEnv = Omit<ParsedServerEnv, 'DATABASE_URL' | 'CRUX_ENV'> & {
  DATABASE_URL: string
  /** Always resolved: never undefined by the time a caller sees it. */
  CRUX_ENV: Environment
}

function fail(error: z.ZodError): never {
  const lines = error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
  throw new Error(`Invalid server environment:\n${lines.join('\n')}`)
}

let cache: ServerEnv | null = null

/**
 * Server-only environment. Throws if reached from a browser context.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() was called in a browser context. Server-only configuration must never reach the client.',
    )
  }
  if (cache) return cache

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) fail(parsed.error)

  const env = parsed.data

  // Fail closed: an unset CRUX_ENV on a production build is a production deployment.
  const cruxEnv: Environment =
    env.CRUX_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'development')

  // Throws DatabaseUrlError naming the specific problem (Workstream 1).
  const databaseUrl = resolveDatabaseUrl(env.DATABASE_URL, cruxEnv)

  // §45.5.1 / Block 23: OAuth configuration must be coherent when enabled, so a
  // misconfiguration fails at startup rather than producing a broken login.
  if (env.SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED) {
    const missing: string[] = []
    if (!env.GOOGLE_OAUTH_CLIENT_ID) missing.push('GOOGLE_OAUTH_CLIENT_ID')
    if (!env.GOOGLE_OAUTH_CLIENT_SECRET) missing.push('GOOGLE_OAUTH_CLIENT_SECRET')
    if (!env.GOOGLE_OAUTH_REDIRECT_URL) missing.push('GOOGLE_OAUTH_REDIRECT_URL')
    if (missing.length > 0) {
      throw new Error(
        `SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED is true but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
      )
    }
    const redirect = env.GOOGLE_OAUTH_REDIRECT_URL!
    if (!redirect.startsWith(publicEnv.NEXT_PUBLIC_SITE_URL)) {
      throw new Error(
        `GOOGLE_OAUTH_REDIRECT_URL (${redirect}) does not match this environment's public origin (${publicEnv.NEXT_PUBLIC_SITE_URL}).`,
      )
    }
  }

  // Staging and production must not run on the local default.
  if (cruxEnv === 'staging' || cruxEnv === 'production') {
    if (!env.SUPABASE_SECRET_KEY) {
      throw new Error(`SUPABASE_SECRET_KEY is required when CRUX_ENV is ${cruxEnv}.`)
    }
  }

  cache = { ...env, DATABASE_URL: databaseUrl, CRUX_ENV: cruxEnv }
  return cache
}

/** Test hook: clears the memoised parse so a test can vary process.env. */
export function resetServerEnvCache(): void {
  cache = null
}
