# Assumptions and Decisions

Decisions taken without an explicit instruction, recorded per master prompt §2. Each
is implemented so it can be changed through configuration rather than a rewrite.

---

## A-001 — Supabase-native, not a headless CMS

**Decision.** The CMS is built on this project's own PostgreSQL and Storage. No Sanity,
Payload, Contentful, or Strapi. No ORM layer either — schema is defined in SQL
migrations and read through typed query functions.

**Why.** Master prompt §5 lists a headless CMS and Prisma/Drizzle among its preferred
options, which conflicts with `CLAUDE.md` rule 2 ("do not introduce a paid CMS or
proprietary CMS component suite") and the Supabase-native mandate throughout the block
architecture. §5's own opening line resolves it: *"Use the repository's established
stack when it is suitable."* The established architecture is Supabase-native, and it is
suitable.

The deeper reason is that this platform's core guarantees — immutable published
versions, append-only audit, permission-aware search — are all enforced in the
database. Moving content into an external CMS would move them out of reach of those
enforcement mechanisms.

**Changing it.** Swapping to a headless CMS would mean replacing the `cms` schema and
`src/lib/content/`. The rest of the platform reads through those query functions.

---

## A-002 — Direct PostgreSQL locally, Supabase in deployment

**Decision.** The data layer talks to PostgreSQL directly through `pg`, setting the
role and `request.jwt.claims` per transaction. `NEXT_PUBLIC_SUPABASE_URL` and the
Supabase client libraries remain the deployment path.

**Why.** The Supabase local stack requires Docker, which is unavailable in the build
environment used for this work. Rather than write database code that could not be run
or tested, the local path connects to a plain PostgreSQL 16 cluster carrying the same
extensions, schemas, roles and policies.

This is not a compromise on the security surface. Setting `role` and
`request.jwt.claims` inside a transaction is exactly what Supabase's PostgREST layer
does per request, so **the same RLS policies govern local development, the test suite,
and production**. The 42 passing tests exercise the real policies, not a simulation.

**What this does mean.** Supabase Auth, Storage and Edge Functions are not exercised
locally. Their schema, contracts and policies exist; their runtime integration is
listed under Remaining Work in the README.

**Changing it.** `src/lib/db/client.ts` is the only module that constructs
connections. A Supabase-client implementation of the same `Session` interface swaps in
without touching a call site.

---

## A-003 — `auth.users` defined locally

**Decision.** The migration creates `auth.users` and `auth.uid()` / `auth.jwt()` if
absent.

**Why.** Supabase provides these. Defining them locally lets the identical migration
set apply to a plain cluster. In a real Supabase project the `CREATE TABLE IF NOT
EXISTS` and `CREATE OR REPLACE FUNCTION` statements are no-ops against the managed
originals.

**Risk accepted.** If Supabase changes its `auth.uid()` semantics, the local
definition could drift. The functions are trivial and version-pinned in one file.

---

## A-004 — Scheduling is part of publishing, not a separate authority

**Decision.** `content.schedule` was removed; scheduling a publication requires
`content.publish`.

**Why.** The workflow migration introduced `content.schedule`, which no role held,
making the scheduling transitions unperformable. Rather than grant a new permission,
the simpler reading is that scheduling *is* publishing with a delay: anyone who may
publish may schedule. Splitting them would let a role commit content to publication
without holding publication authority.

**Changing it.** Re-add the permission, grant it, and repoint the transitions. A test
(`assert_transitions_reachable`) will fail if it is added without a grant.

---

## A-005 — Demonstration content is labelled as fictional

**Decision.** Every seeded expert, organisation, finding and figure is invented and
says so. Methodology notes state that no real respondents were surveyed. Limitations
notes state the content establishes nothing about the real world.

**Why.** `rules/content-modeling.md` 24 forbids fabricating research claims. A
research platform seeded with plausible-looking but invented findings is exactly the
failure that rule exists to prevent — the content would be indistinguishable from real
research once it left this repository.

---

## A-006 — Separation of duties encoded in the role matrix

**Decision.** `publisher` holds neither `content.edit_any` nor `content.approve`.
`managing_editor` holds `content.approve` but not `content.publish`.
`platform_administrator` holds neither: administrative authority is not editorial
authority.

**Why.** §45.1.5 requires author ≠ publisher and reviewer ≠ final approver. Role
permissions alone cannot express the per-version rules ("an author may not review
*their own* version"), which the workflow triggers enforce separately. But the role
matrix can at least ensure no single role carries content end to end, and a test
asserts no role holds both approve and publish.

---

## A-007 — `identity` holds two unrelated table families

**Decision.** `identity.roles` / `.permissions` / `.user_roles` / `.role_permissions`
(authorization) sit alongside `identity.people` / `.organisations` /
`.expert_profiles` / `.external_identifiers` (bibliographic).

**Why.** §45.1.5 places the authorization tables in `identity`; Block 05 places the
bibliographic records there too. Both are honoured. The two are linked only through
`accounts.profiles.person_id`, which is nullable — most platform users are not cited
authors, and most cited authors have no account.

**Risk accepted.** One namespace carrying two concerns invites confusion. Mitigated by
an explicit schema note in Blocks 05 and 06 and in `docs/database.md`.

---

## A-008 — `service_role` receives broad table grants

**Decision.** `service_role` holds SELECT/INSERT/UPDATE/DELETE across every schema,
plus default privileges for future tables.

**Why.** `BYPASSRLS` exempts a role from policies but not from table grants. Without
these the entire trusted server layer fails with "permission denied" despite being
nominally privileged. This was a live bug caught by the test suite.

**Where the control actually is.** Not in the grant. `asServiceRole()` requires a
stated reason, expects an explicit permission check first, writes an audit row, and is
enumerable with `grep -rn "asServiceRole" src/` — the static check Block 27 requires.
`audit.events` remains append-only even for this role, because the table triggers do
not consult grants.

---

## A-009 — Tailwind CSS v4 with CSS-first tokens

**Decision.** Design tokens live in `@theme` in `src/app/globals.css`; no
`tailwind.config.js`.

**Why.** Tailwind v4 defines tokens in CSS, which keeps them in one file readable
without a build step and makes the dark scheme a token switch rather than a duplicated
component tree.

---

## A-010 — Original visual identity

**Decision.** Warm paper ground, near-black ink, a single deep-teal accent, serif
display against a neutral text face.

**Why.** Block 12 requires an original identity and explicitly forbids copying IBM's or
McKinsey's branding, palette, typography or trade dress. The chosen direction shares
the *principles* those organisations use — strong typographic hierarchy, generous
whitespace, restrained colour, evidence-led presentation — without reproducing any of
their assets. No third-party brand asset appears anywhere in this repository.
