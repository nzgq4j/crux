# Known Limitations

Limitations of what is actually built, with their impact and remediation. Omitting a
limitation is a form of false claim (`rules/documentation.md` 14), so this file
records them rather than leaving them implicit.

This is not a roadmap. It describes shortcomings in shipped work, not features not
yet started.

| Owner | Last verified against implementation |
|---|---|
| Claude Code | 2026-07-31 |

## Quality gates

### SQL interpolation check trusts TypeScript's inferred type

- **Where:** `scripts/lib/sql-interpolation-check.mjs`, permitted form 6.
- **What:** A numeric expression in bind-placeholder position is permitted when its
  static type is `number`. A deliberate assertion — `value as unknown as number` —
  would satisfy that test while carrying a string at runtime.
- **Impact:** Low. It requires a contributor to write a double assertion in
  placeholder position specifically, which does not occur by accident and is
  conspicuous in review. Every other interpolation form is decided structurally, with
  no reliance on declared types.
- **Remediation:** Track type assertions through the syntax tree and refuse an
  expression whose type is asserted rather than inferred. Not implemented; see
  ADR 0003.

### The permitted-form list is closed

- **Where:** `scripts/lib/sql-interpolation-check.mjs`.
- **What:** A construction that is safe but not among the six permitted forms is
  reported.
- **Impact:** A future contributor may meet a finding on correct code — for example
  a `Map` of allowlisted sort columns.
- **Remediation:** Extend the checker and add a fixture proving the new form, rather
  than adding an exemption. This failure direction is deliberate.

### PostgREST query construction is outside the SQL control

- **Where:** `src/lib/content/rest-backend.ts`.
- **What:** The REST backend builds PostgREST query strings, which are not SQL, so
  the interpolation check does not analyse them.
- **Impact:** Low, and mitigated in the code rather than by the checker. PostgREST
  offers no bind-parameter mechanism. `limit` and `offset` travel as discrete query
  parameters clamped to an integer range by `bound()`, and caller-supplied text is
  passed through `encodeURIComponent`.
- **Remediation:** A dedicated check for PostgREST filter construction, should that
  surface grow beyond the current read paths.

## Database operations

### Out-of-order migrations are applied, not rejected

- **Where:** `scripts/lib/migrate.mjs`.
- **What:** A migration whose identifier sorts *before* an already-applied one is
  still unapplied, so the runner applies it — after the later migration has already
  run. This happens when two branches add migrations concurrently and the one merged
  second carries an earlier timestamp.
- **Impact:** The resulting schema may differ from one built from empty, and the
  divergence is silent.
- **Remediation:** Refuse an unapplied migration that sorts before the highest applied
  identifier, with an explicit override for the case where the operator knows it is
  safe. Not implemented; the runner records enough to detect it, and
  `tests/migrations/runner.test.ts` documents the current behaviour rather than
  pretending it is correct.



### CRUX_ENV is not set in the deployment

- **Where:** Vercel project configuration.
- **What:** `CRUX_ENV` is unset. It now fails closed — an unset value on a production
  build resolves to `production` — so the strict checks do apply, but by inference
  rather than by declaration.
- **Impact:** Low now that the default is fail-closed; previously every deployment
  check keyed on this variable was silently off.
- **Remediation:** Set `CRUX_ENV=production` explicitly in the deployment environment.

## Content rendering

### Figure modules render with a plain `<img>`

- **Where:** `src/components/content/ModuleRenderer.tsx`.
- **What:** `next/image` is not used. `next.config.ts` configures no images loader,
  and the Content-Security-Policy restricts `img-src` to `'self'`, `data:` and
  `blob:`.
- **Impact:** No automatic format negotiation, resizing, or lazy-loading for figure
  images. Alternative text is still mandatory and enforced — a figure without it
  refuses to render.
- **Remediation:** Block 13's signed-URL asset pipeline. The `eslint-disable` at that
  line records the same.

## Deployment

### The deployed Supabase project does not match the repository's migrations

- **Where:** Supabase project `crux` (`jsgawelsrfduyoacdssn`).
- **What:** The project's `supabase_migrations.schema_migrations` holds nine
  hand-applied migrations — `foundation`, `taxonomy`, `identity_accounts`,
  `cms_content`, `rls_core`, `roles_permissions`, `seed_reference_and_taxonomy`,
  `seed_content`, `public_api_views` — which are **not** the repository's
  twenty-three. Six schemas exist but are empty: `workflow`, `knowledge`, `assets`,
  `subscriptions`, `search`, `analytics`. The ledger written by
  `scripts/lib/migrate.mjs` is absent there, so the repository's drift detection has
  never run against it.
- **Impact:** No editorial workflow, claims, provenance, assets, subscriptions,
  search or analytics exist in the deployed database. Anything exercising them —
  including the vertical slice — runs only against the local cluster. The two
  environments cannot be reconciled by running the remaining repository migrations,
  because `rls_core` and `roles_permissions` were applied there from different
  sources and would conflict.
- **Impact on the corpus programme:** the deployed database holds demonstration seed
  content only (36 items, no real users, no audit rows), so nothing of value is at
  risk — but "deployed" currently means the public reading surface over seeded
  demonstration data, not the platform.
- **Remediation:** rebuild the deployed database from the repository's migration set,
  or reconcile the nine applied ones against it deliberately. This is a decision about
  a live environment, not a code change, and it is recorded rather than taken.

### Rate limiting requires a direct database connection

- **Where:** `src/lib/auth/rate-limit.ts`.
- **What:** The limiter reaches `private.check_rate_limit` through `getPool()`, which
  needs `DATABASE_URL`. A deployment holding only the publishable key — the PostgREST
  path that `src/lib/content/queries.ts` selects when configured — has no direct
  connection, and the limiter would then fail closed on every attempt, refusing all
  sign-ins.
- **Impact:** authentication endpoints must not be exposed in a deployment without
  `DATABASE_URL`. Workstream 1 established `DATABASE_URL` as the canonical runtime
  variable and staging and production both require it, so this is a constraint to
  honour rather than a defect to fix.
- **Remediation:** if a publishable-key-only deployment is ever wanted, the limiter
  needs an RPC path with its own abuse protection. Do not resolve it by failing open.

## Verification

### Accessibility verification is not continuous

- **What:** No automated accessibility check runs in CI, and manual keyboard and
  screen-reader verification has not been performed against the deployed reading
  surface.
- **Impact:** WCAG 2.2 AA conformance is a target, not a measured result. It should
  not be described as achieved.
- **Remediation:** Block 20 introduces the accessibility gate. Until then, record the
  conformance level actually achieved, which is currently unverified.

### The validation corpus does not exercise nine platform behaviours

- **Where:** [`docs/corpus/08-acceptance-tests.md`](corpus/08-acceptance-tests.md)
  §8.11.
- **What:** The fourteen-document corpus is finished research with no editorial
  history, so it supplies no fixture for scheduling, withdrawal and the public
  tombstone, `changes_requested` and review iteration, routine supersession, chart
  modules, entitlement-gated downloads, a second locale, inter-document `cites`
  relationships, or a figure-heavy document that would stress the alternative-text
  gate. Only three images exist across all fourteen documents.
- **Impact:** A test suite built from the corpus alone would be green while having
  tested none of these. Corpus-derived coverage must not be described as
  comprehensive.
- **Remediation:** Synthetic fixtures for the workflow states — a review history is
  not research content, so inventing one fabricates nothing. Tracked as N04 in
  [`docs/corpus/09-product-backlog.md`](corpus/09-product-backlog.md).
