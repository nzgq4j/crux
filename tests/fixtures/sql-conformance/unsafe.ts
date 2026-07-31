/**
 * Fixtures that MUST be reported by the SQL interpolation check.
 *
 * These are never imported by application code. They exist so the control can be
 * proved to have teeth: if a change to the checker stops reporting any of these,
 * tests/conformance/sql-interpolation.test.ts fails.
 *
 * Do not "fix" these. They are supposed to be wrong.
 */

interface Request {
  params: { id: string }
}

/** 1. A request value interpolated inside quotes — the textbook injection. */
export function bySlug(userInput: string): string {
  return `SELECT * FROM items WHERE slug = '${userInput}'`
}

/** 2. A request value interpolated as a bare value. */
export function removeById(request: Request): string {
  return `DELETE FROM items WHERE id = ${request.params.id}`
}

/** 3. A sort column, which cannot be bound and so must come from an allowlist. */
export function ordered(sortField: string): string {
  return `SELECT * FROM items ORDER BY ${sortField}`
}

/** 4. A number that has not been shown to be bounded. Bind it instead. */
export function limited(unvalidatedLimit: number): string {
  return `SELECT * FROM items LIMIT ${unvalidatedLimit}`
}

/** 5. `let` can be reassigned between declaration and use, so it proves nothing. */
export function mutableFragment(userInput: string): string {
  let fragment = 'status = 1'
  fragment = userInput
  return `SELECT * FROM items WHERE ${fragment}`
}

/** 6. A const whose initialiser is itself unsafe — the chain must not launder it. */
export function indirect(userInput: string): string {
  const where = `slug = '${userInput}'`
  return `SELECT * FROM items WHERE ${where}`
}

/** 7. A conditional where only one branch is a literal. */
export function halfAllowlisted(userInput: string, flag: boolean): string {
  return `SELECT * FROM items ORDER BY ${flag ? 'published_at' : userInput}`
}

/** 8. An array joined into a WHERE clause that receives a request value. */
export function assembled(userInput: string): string {
  const conditions: string[] = []
  conditions.push('lifecycle_state = $1')
  conditions.push(`slug = '${userInput}'`)
  return `SELECT * FROM items WHERE ${conditions.join(' AND ')}`
}

/** 9. A function call whose result cannot be inspected. */
export function fromCall(build: () => string): string {
  return `SELECT * FROM items WHERE ${build()}`
}

/** 10. A number outside placeholder position is still a finding. */
export function offsetNotBound(page: number): string {
  return `SELECT * FROM items OFFSET ${page * 10}`
}
