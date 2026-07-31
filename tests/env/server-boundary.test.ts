import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { publicEnv } from '@/lib/env/public'

/**
 * The client/server environment boundary (Workstream 2).
 *
 * The defect these cover: a single `src/lib/env.ts` exported both the public values
 * and `serverEnv()`, and carried no `import 'server-only'`. A Client Component could
 * import it. `serverEnv()` threw in the browser, but by then the module — including
 * the schema naming every secret the platform holds — had already been bundled.
 *
 * Two of these assertions are structural rather than behavioural. That is deliberate:
 * whether a module reaches the client bundle is decided by the import graph at build
 * time, so the import graph is what has to be asserted. `scripts/scan-bundle.sh`
 * checks the built output as the complementary end-to-end check.
 */

const root = resolve(__dirname, '../..')
const SRC = join(root, 'src')
const SERVER_ENV = join(SRC, 'lib/env/server.ts')
const PUBLIC_ENV = join(SRC, 'lib/env/public.ts')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const ALL_SOURCES = sourceFiles(SRC)

/** Resolve a relative or `@/`-aliased import specifier to a file on disk. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* not this one */
    }
  }
  return null
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  const re = /(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const specifier = m[1]
    if (specifier) specifiers.push(specifier)
  }
  return specifiers
}

/** Every file reachable from `entry` through the import graph. */
function transitiveImports(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen
  seen.add(entry)
  for (const spec of importsOf(entry)) {
    const target = resolveImport(entry, spec)
    if (target) transitiveImports(target, seen)
  }
  return seen
}

const CLIENT_COMPONENTS = ALL_SOURCES.filter((f) =>
  /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')),
)

describe('the server module declares itself server-only', () => {
  it("src/lib/env/server.ts imports 'server-only'", () => {
    const text = readFileSync(SERVER_ENV, 'utf8')
    expect(text).toMatch(/^import ['"]server-only['"]/m)
  })

  it("'server-only' is the first import, so nothing runs before the guard", () => {
    const text = readFileSync(SERVER_ENV, 'utf8')
    const firstImport = text.match(/^import .*/m)?.[0]
    expect(firstImport).toBe("import 'server-only'")
  })

  it('the database client is server-only too', () => {
    const text = readFileSync(join(SRC, 'lib/db/client.ts'), 'utf8')
    expect(text).toMatch(/^import ['"]server-only['"]/m)
  })
})

describe('the public module stays client-safe', () => {
  it("does not import 'server-only'", () => {
    // The import statement, not the raw text: this module's header comment explains
    // the boundary and legitimately names the package.
    expect(readFileSync(PUBLIC_ENV, 'utf8')).not.toMatch(/^\s*import\s+['"]server-only['"]/m)
  })

  it('does not import the server environment, directly or transitively', () => {
    const reachable = transitiveImports(PUBLIC_ENV)
    expect(reachable.has(SERVER_ENV)).toBe(false)
  })

  it('exposes only NEXT_PUBLIC_ values', () => {
    const keys = Object.keys(publicEnv)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key, `${key} is exposed to the browser`).toMatch(/^NEXT_PUBLIC_/)
    }
  })

  it('exposes no value whose name suggests a secret', () => {
    // Same pattern as the `no NEXT_PUBLIC_ variable names a secret` conformance
    // check, deliberately. NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a key and is
    // meant to be public: it authenticates as `anon`, and every view it can read is
    // security_invoker, so it grants nothing RLS does not already allow an
    // anonymous reader. A rule that flagged it would be teaching people to ignore it.
    for (const key of Object.keys(publicEnv)) {
      expect(key).not.toMatch(/SECRET|PRIVATE|PASSWORD|TOKEN|SERVICE_ROLE/)
    }
  })
})

describe('no Client Component can reach server configuration', () => {
  it('found the client components to check', () => {
    // If this drops to zero the suite below is vacuous, so assert the premise.
    expect(CLIENT_COMPONENTS.length).toBeGreaterThan(0)
  })

  it.each(CLIENT_COMPONENTS.map((f) => [f.replace(root + '/', ''), f]))(
    '%s does not reach the server environment',
    (_label, file) => {
      const reachable = transitiveImports(file)
      expect(reachable.has(SERVER_ENV)).toBe(false)
    },
  )

  it.each(CLIENT_COMPONENTS.map((f) => [f.replace(root + '/', ''), f]))(
    '%s does not reach the database client',
    (_label, file) => {
      const reachable = transitiveImports(file)
      expect(reachable.has(join(SRC, 'lib/db/client.ts'))).toBe(false)
    },
  )
})

describe('the runtime guard survives alongside the build-time one', () => {
  afterEach(() => {
    // @ts-expect-error -- removing the fake browser global again
    delete globalThis.window
  })

  it('serverEnv() refuses to run in a browser context', async () => {
    const { serverEnv, resetServerEnvCache } = await import('@/lib/env/server')
    resetServerEnvCache()
    // @ts-expect-error -- simulating a browser global
    globalThis.window = {}
    expect(() => serverEnv()).toThrow(/browser context/)
  })
})

describe('no secret name appears in a client-reachable module', () => {
  const SECRET_NAMES = [
    'SUPABASE_SECRET_KEY',
    'DATABASE_URL',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'CRON_SECRET',
    'WEBHOOK_SIGNING_SECRET',
    'EMAIL_API_KEY',
    'NEWSLETTER_API_KEY',
    'EMBEDDING_API_KEY',
  ]

  it('no module reachable from a Client Component names a server secret', () => {
    const reachable = new Set<string>()
    for (const entry of CLIENT_COMPONENTS) {
      for (const f of transitiveImports(entry)) reachable.add(f)
    }
    const offenders: string[] = []
    for (const file of reachable) {
      const text = readFileSync(file, 'utf8')
      for (const name of SECRET_NAMES) {
        if (text.includes(name)) offenders.push(`${file.replace(root + '/', '')} names ${name}`)
      }
    }
    expect(offenders.join('\n')).toBe('')
  })
})

describe('CRUX_ENV fails closed', () => {
  const saved = { ...process.env }

  afterEach(async () => {
    process.env = { ...saved }
    const { resetServerEnvCache } = await import('@/lib/env/server')
    resetServerEnvCache()
  })

  async function envWith(vars: Record<string, string | undefined>) {
    const { serverEnv, resetServerEnvCache } = await import('@/lib/env/server')
    resetServerEnvCache()
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    return serverEnv
  }

  it('treats an unset CRUX_ENV on a production build as production', async () => {
    const serverEnv = await envWith({
      CRUX_ENV: undefined,
      NODE_ENV: 'production',
      DATABASE_URL: undefined,
    })
    // Production with no DATABASE_URL must fail rather than fall back to localhost.
    expect(() => serverEnv()).toThrow(/required when CRUX_ENV is production/)
  })

  it('rejects a loopback DATABASE_URL when CRUX_ENV is unset on a production build', async () => {
    const serverEnv = await envWith({
      CRUX_ENV: undefined,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p4ssw0rd-real@127.0.0.1:5432/crux',
      SUPABASE_SECRET_KEY: 'not-a-real-key-for-tests',
    })
    expect(() => serverEnv()).toThrow(/local address/)
  })

  it('still defaults to development on a non-production build', async () => {
    const serverEnv = await envWith({
      CRUX_ENV: undefined,
      NODE_ENV: 'development',
      DATABASE_URL: undefined,
    })
    expect(serverEnv().CRUX_ENV).toBe('development')
    expect(serverEnv().DATABASE_URL).toContain('localhost')
  })

  it('an explicit CRUX_ENV always wins over the NODE_ENV inference', async () => {
    const serverEnv = await envWith({
      CRUX_ENV: 'test',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres@localhost:5432/crux',
    })
    expect(serverEnv().CRUX_ENV).toBe('test')
  })
})
