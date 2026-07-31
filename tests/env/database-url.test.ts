import { describe, it, expect } from 'vitest'
import {
  resolveDatabaseUrl,
  assertDeployableDatabaseUrl,
  DatabaseUrlError,
  LOCAL_DATABASE_URL,
} from '@/lib/env/database-url'

/**
 * DATABASE_URL resolution and validation (Workstream 1).
 *
 * The defect these cover: DATABASE_URL carried a localhost default that applied in
 * every environment, so a production deployment with the variable unset started
 * successfully and connected to nothing. There was no check that a supplied value was
 * even a plausible production target.
 */

const PROD = 'postgresql://crux_app:s3cr3t-Kx91@db.example.com:5432/crux'

describe('development and test', () => {
  it('falls back to the local cluster when the variable is absent', () => {
    expect(resolveDatabaseUrl(undefined, 'development')).toBe(LOCAL_DATABASE_URL)
    expect(resolveDatabaseUrl(undefined, 'test')).toBe(LOCAL_DATABASE_URL)
  })

  it('falls back when the variable is present but empty', () => {
    expect(resolveDatabaseUrl('   ', 'development')).toBe(LOCAL_DATABASE_URL)
  })

  it('accepts a localhost URL, which is the point of development', () => {
    const url = 'postgresql://postgres@localhost:5432/crux'
    expect(resolveDatabaseUrl(url, 'development')).toBe(url)
  })

  it('accepts a development database name', () => {
    const url = 'postgresql://postgres@localhost:5432/crux_dev'
    expect(resolveDatabaseUrl(url, 'development')).toBe(url)
  })

  it('does not apply deployment checks in development', () => {
    // Deliberately every disqualifying trait at once.
    const url = 'postgresql://postgres:password@127.0.0.1:5432/test'
    expect(() => resolveDatabaseUrl(url, 'development')).not.toThrow()
  })
})

describe('missing configuration in a deployed environment', () => {
  it.each(['staging', 'production'])('rejects an absent variable in %s', (env) => {
    expect(() => resolveDatabaseUrl(undefined, env)).toThrow(DatabaseUrlError)
    expect(() => resolveDatabaseUrl(undefined, env)).toThrow(/required when CRUX_ENV is/)
  })

  it('names the absence of a fallback rather than silently using one', () => {
    expect(() => resolveDatabaseUrl(undefined, 'production')).toThrow(/no local fallback/)
  })

  it('rejects an empty string in production', () => {
    expect(() => resolveDatabaseUrl('', 'production')).toThrow(DatabaseUrlError)
  })
})

describe('local addresses in a deployed environment', () => {
  it.each([
    ['localhost', 'postgresql://u:p4ssw0rd-real@localhost:5432/crux'],
    ['127.0.0.1', 'postgresql://u:p4ssw0rd-real@127.0.0.1:5432/crux'],
    ['127.0.0.2', 'postgresql://u:p4ssw0rd-real@127.0.0.2:5432/crux'],
    ['IPv6 loopback', 'postgresql://u:p4ssw0rd-real@[::1]:5432/crux'],
    ['0.0.0.0', 'postgresql://u:p4ssw0rd-real@0.0.0.0:5432/crux'],
    ['mDNS .local', 'postgresql://u:p4ssw0rd-real@db.local:5432/crux'],
    ['.localhost', 'postgresql://u:p4ssw0rd-real@db.localhost:5432/crux'],
  ])('rejects %s in production', (_label, url) => {
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(DatabaseUrlError)
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(/local address/)
  })

  it('rejects a local address in staging too', () => {
    expect(() => resolveDatabaseUrl('postgresql://u:p4ssw0rd-real@localhost:5432/crux', 'staging'))
      .toThrow(/local address/)
  })
})

describe('malformed URLs', () => {
  it.each([
    ['not a URL at all', 'this is not a url'],
    ['bare host', 'db.example.com:5432/crux'],
    ['empty path segments', 'postgresql://'],
  ])('rejects %s', (_label, url) => {
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(DatabaseUrlError)
  })

  it('rejects the wrong scheme', () => {
    expect(() => resolveDatabaseUrl('mysql://u:p4ssw0rd-real@db.example.com:3306/crux', 'production'))
      .toThrow(/Expected 'postgresql' or 'postgres'/)
  })

  it('rejects a URL that names no database', () => {
    expect(() => resolveDatabaseUrl('postgresql://u:p4ssw0rd-real@db.example.com:5432', 'production'))
      .toThrow(/names no database/)
  })
})

describe('development database names in a deployed environment', () => {
  it.each(['dev', 'development', 'test', 'local', 'crux_dev', 'crux_test'])(
    'rejects database name %s',
    (name) => {
      const url = `postgresql://u:p4ssw0rd-real@db.example.com:5432/${name}`
      expect(() => resolveDatabaseUrl(url, 'production')).toThrow(/development database name/)
    },
  )

  it('is case-insensitive about the database name', () => {
    expect(() => resolveDatabaseUrl('postgresql://u:p4ssw0rd-real@db.example.com:5432/DEV', 'production'))
      .toThrow(/development database name/)
  })
})

describe('placeholder credentials', () => {
  it.each([
    'password',
    'changeme',
    'secret',
    'your-password',
    'PLACEHOLDER',
    'TODO',
  ])('rejects password %s', (pw) => {
    const url = `postgresql://crux_app:${pw}@db.example.com:5432/crux`
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(/placeholder password/)
  })

  it('rejects a bracketed copy-paste placeholder', () => {
    // Supabase's own connection-string panel renders [YOUR-PASSWORD].
    const url = 'postgresql://crux_app:%5BYOUR-PASSWORD%5D@db.example.com:5432/crux'
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(/placeholder password/)
  })

  it('rejects a placeholder username', () => {
    const url = 'postgresql://your-user:s3cr3t-Kx91@db.example.com:5432/crux'
    expect(() => resolveDatabaseUrl(url, 'production')).toThrow(/placeholder username/)
  })

  it('never includes the credential value in the error message', () => {
    const secret = 'changeme'
    const url = `postgresql://crux_app:${secret}@db.example.com:5432/crux`
    try {
      resolveDatabaseUrl(url, 'production')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(String(e)).not.toContain(secret)
    }
  })
})

describe('valid production configuration', () => {
  it('accepts a real connection string', () => {
    expect(resolveDatabaseUrl(PROD, 'production')).toBe(PROD)
  })

  it('accepts the same string in staging', () => {
    expect(resolveDatabaseUrl(PROD, 'staging')).toBe(PROD)
  })

  it('accepts the postgres:// scheme', () => {
    const url = 'postgres://crux_app:s3cr3t-Kx91@db.example.com:5432/crux'
    expect(resolveDatabaseUrl(url, 'production')).toBe(url)
  })

  it('accepts a pooled Supabase-style host and port', () => {
    const url =
      'postgresql://postgres.abcdefghijklmnop:s3cr3t-Kx91@aws-0-us-east-1.pooler.example.com:6543/postgres'
    expect(resolveDatabaseUrl(url, 'production')).toBe(url)
  })

  it('accepts a URL with query parameters', () => {
    const url = `${PROD}?sslmode=require&pool_timeout=10`
    expect(resolveDatabaseUrl(url, 'production')).toBe(url)
  })

  it('trims surrounding whitespace', () => {
    expect(resolveDatabaseUrl(`  ${PROD}  `, 'production')).toBe(PROD)
  })

  it('accepts a connection string with no credentials in the URL', () => {
    // Credentials may come from the environment or a certificate instead.
    const url = 'postgresql://db.example.com:5432/crux'
    expect(() => assertDeployableDatabaseUrl(url, 'production')).not.toThrow()
  })
})
