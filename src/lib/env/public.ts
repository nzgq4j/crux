import { z } from 'zod'

/**
 * Public environment (Workstream 2).
 *
 * Everything here reaches the browser bundle. Only `NEXT_PUBLIC_` variables belong in
 * this module, and nothing imported from here may pull in server configuration —
 * that is the point of the split.
 *
 * The server counterpart is `@/lib/env/server`, which carries `import 'server-only'`
 * so that importing it from a Client Component is a build error rather than a silent
 * secret leak. There is deliberately no barrel module re-exporting both: a single
 * `@/lib/env` entry point would make the boundary invisible at the import site and
 * would drag the server schema into the client graph.
 *
 * A conformance check asserts that no `NEXT_PUBLIC_` variable names a secret, and
 * scripts/scan-bundle.sh asserts that no server-only identifier reaches the built
 * client bundle.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
})

export type PublicEnv = z.infer<typeof publicSchema>

function fail(error: z.ZodError): never {
  const lines = error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
  throw new Error(`Invalid public environment:\n${lines.join('\n')}`)
}

/**
 * Read explicitly rather than passing `process.env` wholesale.
 *
 * Next.js substitutes `NEXT_PUBLIC_` references at build time by static analysis, so
 * each one must appear as a literal property access to survive bundling. It also
 * means only these three values can ever be read here.
 */
const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
})
if (!parsed.success) fail(parsed.error)

export const publicEnv: PublicEnv = parsed.data
