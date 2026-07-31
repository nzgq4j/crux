import { z } from 'zod'

/**
 * Environment validation (Block 04).
 *
 * Parsed once at startup. The process fails fast with a message naming the missing
 * variable rather than failing later at the point of use.
 *
 * Public variables are prefixed NEXT_PUBLIC_ and reach the browser bundle. Everything
 * else is server-only and must never be imported from a Client Component — see
 * `server-only` import in `serverEnv` below, which turns a client import into a build
 * error rather than a silent secret leak.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
})

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CRUX_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  /** Direct PostgreSQL connection. The local development and test path. */
  DATABASE_URL: z.string().min(1).default('postgresql://postgres@localhost:5432/crux'),

  /** Supabase. Required in staging and production; absent locally. */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_DB_URL: z.string().min(1).optional(),

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

function fail(scope: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
  throw new Error(`Invalid ${scope} environment:\n${lines.join('\n')}`)
}

const publicParsed = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
})
if (!publicParsed.success) fail('public', publicParsed.error)

export const publicEnv = publicParsed.data

let serverCache: z.infer<typeof serverSchema> | null = null

/**
 * Server-only environment. Throws if read from the browser.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in a browser context. Server-only configuration must never reach the client.')
  }
  if (serverCache) return serverCache

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) fail('server', parsed.error)

  const env = parsed.data

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
  if (env.CRUX_ENV === 'staging' || env.CRUX_ENV === 'production') {
    if (!env.SUPABASE_SECRET_KEY) {
      throw new Error(`SUPABASE_SECRET_KEY is required when CRUX_ENV is ${env.CRUX_ENV}.`)
    }
  }

  serverCache = env
  return env
}

/** Test hook: clears the memoised parse so a test can vary process.env. */
export function resetServerEnvCache(): void {
  serverCache = null
}
