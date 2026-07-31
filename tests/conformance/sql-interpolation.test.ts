import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
// @ts-expect-error -- the checker is plain ESM with no type declarations; it runs in
// CI without a TypeScript build step. Typing it would mean compiling it first.
import { analyze, collectSourceFiles } from '../../scripts/lib/sql-interpolation-check.mjs'

const root = resolve(__dirname, '../..')
const unsafeFixture = resolve(root, 'tests/fixtures/sql-conformance/unsafe.ts')
const safeFixture = resolve(root, 'tests/fixtures/sql-conformance/safe.ts')

interface Finding {
  file: string
  line: number
  column: number
  text: string
  reason: string
}

const unsafeFindings: Finding[] = analyze([unsafeFixture])
const safeFindings: Finding[] = analyze([safeFixture])

/** The interpolated expression texts the checker reported, for readable assertions. */
const reported = new Set(unsafeFindings.map((f) => f.text))

describe('SQL interpolation check — teeth', () => {
  /**
   * The four cases named in the control's specification. Each must be reported.
   * These assert on the specific expression, not merely on a non-zero count, so a
   * checker that reported everything for the wrong reason would not pass.
   */
  it.each([
    ['quoted request value', 'userInput'],
    ['bare request value', 'request.params.id'],
    ['unallowlisted sort column', 'sortField'],
    ['unbounded limit', 'unvalidatedLimit'],
  ])('reports %s', (_label, expression) => {
    expect(reported).toContain(expression)
  })

  it('reports a reassignable binding', () => {
    expect(reported).toContain('fragment')
  })

  it('does not launder an unsafe value through a const', () => {
    expect(reported).toContain('where')
  })

  it('reports a conditional with a non-literal branch', () => {
    expect(reported).toContain("flag ? 'published_at' : userInput")
  })

  it('reports an assembled clause when any fragment is unsafe', () => {
    expect(reported).toContain("conditions.join(' AND ')")
  })

  it('reports a value produced by an opaque call', () => {
    expect(reported).toContain('build()')
  })

  it('reports arithmetic on a number outside placeholder position', () => {
    expect(reported).toContain('page * 10')
  })

  it('reports every unsafe fixture case', () => {
    // The fixture file documents ten cases; each must produce at least one finding.
    expect(unsafeFindings.length).toBeGreaterThanOrEqual(10)
  })
})

describe('SQL interpolation check — permitted constructions', () => {
  it('reports nothing in the safe fixture', () => {
    const detail = safeFindings
      .map((f) => `${f.line}:${f.column} ${f.text} — ${f.reason}`)
      .join('\n')
    expect(detail).toBe('')
    expect(safeFindings).toHaveLength(0)
  })
})

describe('SQL interpolation check — the repository itself', () => {
  it('reports nothing in src', () => {
    const files: string[] = collectSourceFiles(resolve(root, 'src'))
    expect(files.length).toBeGreaterThan(0)

    const findings: Finding[] = analyze(files)
    const detail = findings
      .map((f) => `${f.file.replace(root + '/', '')}:${f.line} ${f.text} — ${f.reason}`)
      .join('\n')
    expect(detail).toBe('')
  })
})
