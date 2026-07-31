/**
 * Database connection string validation (Workstream 1).
 *
 * `DATABASE_URL` is the single canonical runtime database variable. It carried a
 * localhost default that applied in every environment, so a staging or production
 * deployment with the variable unset would start successfully and quietly connect to
 * nothing — or, worse, to a local database that happened to exist on the host.
 *
 * The default now applies only where a local database is the correct answer. In
 * staging and production the variable is required and must survive the checks below.
 *
 * These are deliberately conservative. Each rejects a configuration that is far more
 * likely to be a deployment mistake than an intention, and each names what it found so
 * the failure is actionable at startup rather than at the first query.
 *
 * This module is pure: no environment access, no side effects. It is exercised
 * directly by tests/env/database-url.test.ts.
 */

/** Environments where a local database is a legitimate answer. */
const LOCAL_ENVIRONMENTS = new Set(['development', 'test'])

export const LOCAL_DATABASE_URL = 'postgresql://postgres@localhost:5432/crux'

/**
 * Hosts that cannot be a real deployment target.
 *
 * `.local` is mDNS. The IPv4 loopback range is checked as a range rather than as the
 * single common address, because 127.0.0.2 is just as wrong and less obvious.
 */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || h === '::') return true
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  return false
}

/** Database names that indicate a non-production database. */
const DEVELOPMENT_DATABASE_NAMES = new Set([
  'dev',
  'devel',
  'development',
  'test',
  'testing',
  'local',
  'localhost',
  'sample',
  'example',
  'scratch',
  'crux_dev',
  'crux_test',
  'crux_local',
  'crux_development',
])

/**
 * Credential values that are placeholders rather than secrets.
 *
 * Compared case-insensitively. The bracket and angle-bracket tests catch the
 * copy-paste forms — `[YOUR-PASSWORD]`, `<password>` — that appear in provider
 * documentation, including Supabase's own connection-string panel.
 */
const PLACEHOLDER_CREDENTIALS = new Set([
  'password',
  'passwd',
  'pass',
  'changeme',
  'change-me',
  'secret',
  'your-password',
  'yourpassword',
  'your_password',
  'placeholder',
  'example',
  'xxx',
  'xxxx',
  'todo',
  'tbd',
  'none',
  'null',
  'undefined',
])

function isPlaceholderCredential(value: string): boolean {
  const v = decodeURIComponent(value).trim().toLowerCase()
  if (v.length === 0) return false
  if (PLACEHOLDER_CREDENTIALS.has(v)) return true
  // [YOUR-PASSWORD], <password>, {{password}} and similar templating leftovers.
  if (/^[[<{(].*[\]>})]$/.test(v)) return true
  if (v.startsWith('your-') || v.startsWith('your_')) return true
  return false
}

export class DatabaseUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseUrlError'
  }
}

/**
 * Validate a connection string for a deployed environment.
 *
 * Throws `DatabaseUrlError` naming the specific problem. Returns nothing on success.
 */
export function assertDeployableDatabaseUrl(raw: string, environment: string): void {
  const value = raw.trim()

  if (value.length === 0) {
    throw new DatabaseUrlError(
      `DATABASE_URL is empty but is required when CRUX_ENV is ${environment}.`,
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new DatabaseUrlError(
      'DATABASE_URL is not a valid URL. Expected a postgresql:// connection string.',
    )
  }

  const protocol = url.protocol.replace(/:$/, '').toLowerCase()
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new DatabaseUrlError(
      `DATABASE_URL has scheme '${protocol}'. Expected 'postgresql' or 'postgres'.`,
    )
  }

  if (url.hostname.length === 0) {
    throw new DatabaseUrlError('DATABASE_URL has no host.')
  }

  if (isLoopbackHost(url.hostname)) {
    throw new DatabaseUrlError(
      `DATABASE_URL points at '${url.hostname}', which is a local address. ` +
        `A ${environment} deployment must reference a real database host.`,
    )
  }

  const database = url.pathname.replace(/^\//, '')
  if (database.length === 0) {
    throw new DatabaseUrlError('DATABASE_URL names no database.')
  }
  if (DEVELOPMENT_DATABASE_NAMES.has(database.toLowerCase())) {
    throw new DatabaseUrlError(
      `DATABASE_URL names database '${database}', which is a development database name. ` +
        `Check the ${environment} configuration.`,
    )
  }

  if (url.password.length > 0 && isPlaceholderCredential(url.password)) {
    // The value itself is never included in the message: it is a credential, even a
    // placeholder one, and this message reaches logs (rules/security.md 6).
    throw new DatabaseUrlError(
      'DATABASE_URL contains a placeholder password. Substitute the real credential.',
    )
  }
  if (url.username.length > 0 && isPlaceholderCredential(url.username)) {
    throw new DatabaseUrlError(
      'DATABASE_URL contains a placeholder username. Substitute the real credential.',
    )
  }
}

/**
 * Resolve the connection string for an environment.
 *
 * Development and test fall back to the local cluster. Every other environment must
 * supply a value that passes `assertDeployableDatabaseUrl`.
 */
export function resolveDatabaseUrl(
  raw: string | undefined,
  environment: string,
): string {
  const isLocal = LOCAL_ENVIRONMENTS.has(environment)

  if (raw === undefined || raw.trim().length === 0) {
    if (isLocal) return LOCAL_DATABASE_URL
    throw new DatabaseUrlError(
      `DATABASE_URL is required when CRUX_ENV is ${environment}. ` +
        `There is no local fallback outside development and test.`,
    )
  }

  if (!isLocal) assertDeployableDatabaseUrl(raw, environment)
  return raw.trim()
}
