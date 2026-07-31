# 0003 — Detect SQL interpolation by parsing, not by matching lines

- Status: Accepted
- Date: 2026-07-31
- Block: 22 (quality gates)
- Deciders: Claude Code, at the repository owner's direction

## Context

`rules/database.md` 20 forbids uncontrolled dynamic SQL. The conformance suite
enforced it with a single line match:

```
grep -rnE '(SELECT|INSERT|UPDATE|DELETE)[^`"']*\$\{' src
```

That test asks one question: does a `${` appear after a SQL keyword? It cannot see
what is being interpolated, so it cannot separate

```ts
`SELECT ${SUMMARY_COLUMNS} FROM items`     // a module constant
`SELECT * FROM items WHERE slug = '${userInput}'`  // an injection
```

Both match. The reviewed content backend interpolates only statement structure —
column lists, a FROM spine, a sort direction drawn from a two-value allowlist — and
binds every caller-supplied value as `$1`, `$2`. It was reported as unsafe anyway.

It also matched on identifiers rather than statements. `SUMMARY_SELECT` contains the
letters `SELECT`, and a PostgREST query string contains `?select=`, so the REST
backend — which builds URLs, not SQL — produced findings too.

The check therefore failed on `main` continuously from the moment the content
backend landed. A gate that is always red is a gate nobody reads, and it was on
course to be ignored or suppressed. Neither outcome protects the rule.

## Decision

Replace the line match with a syntax-tree check,
`scripts/lib/sql-interpolation-check.mjs`, which parses each file with the
TypeScript compiler and classifies every interpolation inside a SQL template
literal.

The default is **finding**. An interpolation is permitted only where its safety
follows from the syntax tree:

1. A string or numeric literal.
2. A conditional whose every branch is permitted — an explicit literal allowlist.
3. A template literal whose every interpolation is permitted.
4. An identifier bound by a `const`, in this file or imported from another file in
   the reviewed tree, whose initialiser is permitted. Applied transitively, with a
   cycle guard.
5. A `const` array of strings, joined, where every value pushed into it is
   permitted. This is how a WHERE clause is assembled from fixed fragments carrying
   only bind placeholders.
6. A numeric expression in bind-placeholder position — the fixed text immediately
   before it ends with `$`, so the interpolation forms `$1`, `$2`. The static type
   must be `number`.

Nothing is inferred from a variable's name. `const userInput` is rejected exactly
where `let sanitised` is, because the question asked is how the value was
constructed, not what it was called.

Rule 6 is deliberately narrow. A number interpolated anywhere other than a
placeholder index is a finding **even when its static type is `number`**, because a
numeric type is an argument about a value, not about the way the statement is built.
`LIMIT ${n}` must bind `n`.

Two supporting changes:

- `LIMIT` and `OFFSET` are bound as parameters in `pg-backend.ts` rather than
  interpolated, at all four call sites.
- The conformance CI job now installs dependencies, because the checker needs the
  TypeScript compiler.

## Alternatives considered

**Add the two files to an ignore list.** Rejected. `rules/testing.md` 7 forbids
weakening a control to make it pass, and an ignore list removes the two files most
worth checking.

**Rewrite the interpolations as string concatenation.** Rejected. It changes what
the regular expression sees without changing what the code does — evasion, not
remediation, and it would leave the next genuine injection equally invisible.

**Refine the regular expression, for example permitting `${UPPER_SNAKE_CASE}`.**
Rejected. It infers safety from a naming convention. A contributor who writes
`const USER_FILTER = req.query.filter` is then invisible to the control, and the
convention is enforced by nothing.

**Hand-write a lexer instead of using the TypeScript compiler.** Rejected. It would
keep the conformance job dependency-free, but a security control that mis-parses a
nested template, a comment, or a backtick inside a string is worse than a slow one.
The compiler is already a devDependency.

**Accept any expression whose static type is `number`.** Rejected. It would permit
`LIMIT ${unvalidatedLimit}`, which the control is explicitly required to report.

## Consequences

**Easier.** The control now distinguishes structural composition from value
injection, so it can be believed. Findings name the expression and say why it could
not be shown safe, which is actionable.

**Harder.** The conformance job now installs dependencies, taking it from roughly
five seconds to roughly forty. That is the price of parsing rather than guessing.

**Committed to.** The permitted forms are a fixed list. A future construction that
is safe but unlisted — a `Map` of allowlisted sort columns, say — will be reported
until the checker learns it. This is the intended direction of failure: a new
finding is a review, and the alternative is a control that quietly permits more than
it should.

**Residual limitation, stated plainly.** Rule 6 trusts TypeScript's inferred type.
`someString as unknown as number` would defeat it. Closing that would require
tracking assertions through the tree; it is not closed here, and it is recorded in
`docs/known-limitations.md`.

**Not covered.** `rest-backend.ts` builds PostgREST query strings, not SQL, and is
outside this control. PostgREST exposes no bind-parameter mechanism; its `limit` and
`offset` already travel as discrete query parameters whose values are clamped to an
integer range by `bound()`, and caller-supplied text is passed through
`encodeURIComponent`. That is the parameterised form the protocol supports.
