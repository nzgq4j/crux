import { z } from 'zod'

/**
 * Build mode.
 *
 * Deliberately separate from both `./public` and `./server`.
 *
 * It is not in `./public` because that module holds the `NEXT_PUBLIC_` configuration
 * and nothing else — a rule the boundary tests enforce. It is not in `./server`
 * because a component that only needs to distinguish development from production
 * should not have to import the secret-bearing schema, and importing it would make
 * that component server-only and force full server-environment validation during
 * static generation.
 *
 * `NODE_ENV` is not configuration in the sense the boundary protects. Next.js and
 * React both inline `process.env.NODE_ENV` into the client bundle regardless of what
 * this codebase does, so exposing it here reveals nothing that was not already there.
 */

const schema = z.enum(['development', 'test', 'production']).default('development')

const parsed = schema.safeParse(process.env.NODE_ENV)
if (!parsed.success) {
  throw new Error(
    `Invalid NODE_ENV: expected development, test or production, received '${String(process.env.NODE_ENV)}'.`,
  )
}

export const NODE_ENV = parsed.data

/** True in a production build. Use for diagnostics that must not reach a reader. */
export const isProduction = NODE_ENV === 'production'
