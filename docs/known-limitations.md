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

### No migration ledger

- **Where:** `scripts/db-migrate.sh`.
- **What:** The runner applies every migration in timestamp order and records nothing.
  It is not re-runnable against a populated database — the second run fails on the
  first `CREATE TABLE`. There is no way to apply only new migrations to an existing
  environment.
- **Impact:** **A production blocker.** `db:reset` is the only supported path and it
  destroys data, so there is currently no mechanism for evolving a deployed database.
  It also makes `rules/database.md` 4 — rehearse each migration against
  production-equivalent data — impossible to satisfy.
- **Remediation:** A ledger table recording applied filenames and checksums, with the
  runner skipping what is recorded and refusing a file whose checksum has changed.
  Not implemented; deliberately out of scope for the foundation remediation pass.

### GitHub Actions are pinned to tags, not commit SHAs

- **Where:** `.github/workflows/ci.yml`, eight `uses:` references.
- **What:** `actions/checkout@v5` and `actions/setup-node@v5` resolve a mutable tag. A
  compromised or retagged action would execute in CI with repository read access.
- **Impact:** Supply-chain exposure, bounded by the workflow's least-privilege
  `contents: read` permission.
- **Remediation:** Pin each to the immutable commit SHA of the intended release, with
  the version as a trailing comment. This was attempted and could not be completed:
  the sandbox cannot reach the GitHub API for repositories outside this session's
  scope, and inventing a SHA would break CI outright. Resolve with, per action:
  `gh api repos/actions/checkout/git/ref/tags/v5 --jq .object.sha`

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

## Verification

### Accessibility verification is not continuous

- **What:** No automated accessibility check runs in CI, and manual keyboard and
  screen-reader verification has not been performed against the deployed reading
  surface.
- **Impact:** WCAG 2.2 AA conformance is a target, not a measured result. It should
  not be described as achieved.
- **Remediation:** Block 20 introduces the accessibility gate. Until then, record the
  conformance level actually achieved, which is currently unverified.
