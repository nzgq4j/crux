# Block 18 — Public Knowledge API

## Objective

Expose a read-only, versioned public API over published Crux knowledge, with correct
caching semantics, documented licensing, and no path to draft or private data.

## Scope

### In scope

- Read-only endpoints for the eight resource families below.
- API versioning, pagination, rate limiting, conditional requests, and OpenAPI
  documentation.

### Out of scope

- Any write endpoint. The public API is read-only without exception.

## Dependencies

Blocks 05, 07, 17.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/07-rls-security.md`,
  `.claude/prompts/17-citation-authority.md`.
- `.claude/rules/backend.md`, `.claude/rules/security.md`.

## Required Outputs

- The API route tree with all endpoints.
- A generated, served OpenAPI document.
- `docs/api.md`.

## Functional Requirements

### Endpoints

Provide list and detail endpoints, as applicable, for:

1. **Content** — published content items and versions, filterable by type, topic,
   date, and author.
2. **Sections** — the structured modules of a version, each with its stable fragment
   identifier.
3. **Claims** — published claims with their type, assertion, and fragment location.
4. **References** — the sources cited by a version, with their bibliographic records.
5. **Citations** — the citation record for a version in any supported format from
   Block 17.
6. **Authors** — public identity and expert records with affiliations, disclosures,
   external identifiers, and authored content.
7. **Taxonomy** — vocabularies and terms with their hierarchy and content counts.
8. **Datasets** — publicly classified datasets with versions and variable
   dictionaries. Restricted datasets expose only what their classification permits.

### API behaviour

9. **Versioning.** The API is versioned in the path. A breaking change requires a new
   version; the prior version has a published deprecation window.
10. **Pagination.** Cursor-based pagination with a bounded maximum page size and a
    documented default. No endpoint returns an unbounded collection.
11. **Rate limits.** Per-client limits with `Retry-After` and rate-limit headers on
    every response. Limits are documented.
12. **ETags.** Strong or weak ETags on every resource, with `If-None-Match` returning
    304.
13. **Last-Modified.** Present on every resource, with `If-Modified-Since` honoured.
14. **Canonical URLs.** Every resource includes the canonical public HTML URL of the
    content it represents.
15. **License metadata.** Every response includes the licence applying to the
    represented content, with its identifier and URL.
16. **OpenAPI documentation.** A machine-readable OpenAPI document generated from the
    implementation, served at a stable path, and validated in CI.
17. **No drafts.** No endpoint, filter, parameter, or error message may reveal the
    existence or content of a draft, scheduled, or in-review version.
18. **No private data.** No endpoint exposes personal data, account records, download
    history, subscription records, internal review records, comments, or audit rows.

## Technical Requirements

- Responses are JSON with a stable, documented envelope and consistent error shape.
- Errors carry a machine-readable code, a human-readable message, and a request
  identifier; they never include stack traces or SQL.
- Field selection or sparse fieldsets, if offered, are validated against an allowlist.
- Response caching is safe for shared caches: no user-specific content is served from
  a public cache path.

## Data Requirements

- The API reads through RLS-enforced paths using an unprivileged identity, so that a
  policy gap fails closed rather than leaking.
- Content is served from published versions only.
- Withdrawn content returns a tombstone representation with the citation record and
  an appropriate status, not a bare absence.

## Security Requirements

- Read-only by construction: no route handler in the public API namespace performs a
  write, and a test enforces this.
- No enumeration of non-public resources through identifier probing: a restricted or
  non-existent resource returns the same response.
- Rate limiting is applied before expensive work.
- CORS is configured deliberately and documented.
- Response headers exclude server and framework version disclosure.
- Input parameters are validated and bounded; a malformed parameter returns 400
  rather than a database error.

## Accessibility Requirements

Not directly applicable — the API serves machines. The published API documentation
surface, however, must meet the same WCAG 2.2 AA requirements as any other public
page under Block 20.

## Testing Requirements

- Contract tests per endpoint validating the response against the OpenAPI schema.
- A test proving no route in the API namespace accepts a write method.
- Tests proving draft, scheduled, and restricted content are absent from every
  endpoint, filter, and count.
- Tests proving ETag and Last-Modified conditional requests return 304.
- Tests proving pagination is bounded and cursors are stable.
- A test proving rate limiting engages and returns correct headers.
- A test proving identifier probing cannot distinguish restricted from non-existent.
- A test proving withdrawn content returns its tombstone with the citation record.

## Documentation Requirements

- `docs/api.md`: authentication posture, versioning and deprecation policy,
  pagination, rate limits, caching semantics, licensing, error codes, and an example
  request and response per endpoint.
- The OpenAPI document is the normative reference and is validated in CI.

## Acceptance Criteria

- [ ] All eight resource families are served.
- [ ] The API is path-versioned with a documented deprecation policy.
- [ ] Pagination is cursor-based and bounded on every collection.
- [ ] Rate limits are enforced and documented, with correct headers.
- [ ] ETag and Last-Modified conditional requests work.
- [ ] Every response carries canonical URL and licence metadata.
- [ ] The OpenAPI document is generated, served, and CI-validated.
- [ ] No write method is accepted anywhere in the API namespace, proven by test.
- [ ] No draft, scheduled, or private data is reachable, proven by test.
- [ ] Restricted and non-existent resources are indistinguishable.

## Completion Report

Report: endpoints delivered, versioning scheme, pagination model, rate limits,
caching headers implemented, licence metadata, OpenAPI generation and validation,
read-only enforcement evidence, negative tests proving no draft or private exposure,
tests added with results, and documentation written.
