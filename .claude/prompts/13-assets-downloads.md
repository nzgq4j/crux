# Block 13 — Assets and Downloads

## Objective

Implement asset storage and the controlled download pipeline, so that public assets
are served efficiently and private reports and datasets are delivered only through
short-lived signed URLs issued after a server-side entitlement check.

## Scope

### In scope

- Storage buckets, asset metadata, validation, checksums, versions, alternative text,
  and licensing.
- Private report and dataset storage.
- Signed URL issuance, entitlements, gated flows, and download history.
- Indexing controls for restricted content.

### Out of scope

- Editor upload interface (Block 10) and search indexing of assets (Block 15).

## Dependencies

Blocks 04, 06, 07.

## Required Inputs

- `.claude/prompts/04-supabase-foundation.md`, `.claude/prompts/06-authentication-authorization.md`,
  `.claude/prompts/07-rls-security.md`.
- `.claude/rules/security.md`, `.claude/rules/backend.md`.

## Required Outputs

- Migrations creating the `assets` schema tables.
- Storage bucket policies.
- The upload validation pipeline and the signed-download route.
- `docs/assets.md`.

## Functional Requirements

1. **Storage buckets (§45.1.10).** Apply policies to the buckets created in
   Block 04: `public-images` (public read of published assets only), `avatars`
   (public read), `private-reports` (no direct read; signed URL only), `datasets`
   (private by default, per-dataset classification), and `quarantine` (no read
   except by the validation pipeline). Bucket visibility is explicit and recorded,
   and no private bucket has any public read path.
2. **Asset metadata.** An asset table recording filename, storage path, bucket,
   declared MIME type, detected MIME type, byte size, checksum, dimensions where
   applicable, uploading actor, and upload timestamp.
3. **File validation.** Validate on upload: allowed extension, allowed MIME type
   determined from file signature rather than the declared header, maximum size per
   asset class, and image dimension limits. Reject on mismatch between declared and
   detected type. Files enter the quarantine bucket and are promoted only after
   validation passes.
4. **Checksums.** Compute and store a SHA-256 checksum at upload. Verify on
   promotion. Expose the checksum for downloadable reports and datasets so that
   recipients can verify integrity.
5. **Versions.** An asset may have multiple versions; replacing an asset creates a
   new version and preserves the prior one. A published content version always
   references a specific asset version, never a mutable pointer.
6. **Alternative text.** Alternative text is a required field for every image asset
   used in content. An image without alternative text fails the publication gate in
   Block 08.
7. **Licensing.** Every asset records a licence, an attribution string where
   required, and a usage restriction flag. Assets with restrictive licences cannot be
   attached to publicly licensed content without an explicit override that is audited.
8. **Private report storage.** Gated reports and white papers are stored only in
   `private-reports` and are never given a public URL.
9. **Dataset storage.** Dataset files are stored with their dataset version,
   checksum, format, and variable dictionary reference from Block 16.
10. **Signed URLs.** Downloads are delivered by a short-lived signed URL issued by
    the trusted server layer. Expiry is short and configurable. The URL is issued
    per request, is not cached, and is not stored.
11. **Download entitlements.** An entitlement table declaring what a given role,
    subscription state, or per-user grant permits. Entitlement evaluation is
    server-side and occurs immediately before URL issuance.
12. **Download history.** Every issuance records the actor, asset version, entitlement
    basis, request identifier, and timestamp. History is visible to the user for
    their own downloads and to the download manager in Block 09.
13. **Gated download flows.** For gated items: present the item's metadata publicly,
    require the qualifying action — authentication, subscription, or a research
    membership — then issue the download. The gate is enforced server-side; hiding
    the control is not the gate.
14. **Restricted-content indexing controls.** Private assets are excluded from
    sitemaps and feeds, are served with directives preventing indexing and caching by
    intermediaries, and never appear in the public API or in unauthenticated search.

## Technical Requirements

- Validation runs server-side in a route handler or Edge Function; the browser never
  determines acceptability.
- Signed URL generation uses the privileged client inside a server-only module.
- Large uploads stream rather than buffering entirely in memory.
- Download responses set correct content type and content disposition.

## Data Requirements

- Asset and download tables carry RLS from creation.
- Download history is append-only.
- Orphaned quarantine objects are cleaned by a scheduled job with a defined
  retention period.

## Security Requirements

- No private object is ever publicly readable; prove this by policy and by test.
- MIME signature validation is mandatory; the declared content type is untrusted.
- Uploaded filenames are normalised and never used directly as a storage path.
- Signed URL expiry is short; the issuance route is rate-limited per user and per IP.
- Entitlement bypass through direct object path guessing must be impossible.
- SVG and other active-content formats are either rejected or sanitised before
  promotion; the choice is recorded.
- This block requires independent review by `database-security-reviewer`.

## Accessibility Requirements

- Every download control states the file format and size in its accessible name.
- Gated download flows announce why access is blocked and what action unlocks it.
- Upload interfaces expose progress and errors to assistive technology.
- Alternative-text entry is a labelled required field with associated error messaging.

## Testing Requirements

- A test proving a private object is unreachable without a signed URL.
- A test proving a signed URL expires and is then rejected.
- A test proving an entitlement failure denies issuance.
- Tests proving MIME-signature mismatch, oversize files, and disallowed types are
  rejected.
- A test proving checksum verification detects a corrupted object.
- A test proving asset replacement creates a version and leaves published references
  pointing at the original version.
- A test proving private assets are absent from sitemaps, feeds, the public API, and
  unauthenticated search.

## Documentation Requirements

- `docs/assets.md`: buckets and their visibility, validation rules, size and type
  limits, licensing policy, entitlement model, signed URL lifetime, and the download
  history retention policy.
- Document the quarantine cleanup job and its retention period.

## Acceptance Criteria

- [ ] All five buckets exist with recorded visibility and correct policies:
      `public-images`, `avatars`, `private-reports`, `datasets`, `quarantine`.
- [ ] Uploads are validated by file signature and promoted only on success.
- [ ] Checksums are computed, stored, verified, and exposed for downloads.
- [ ] Asset versioning preserves prior versions and published references.
- [ ] Alternative text is required and gates publication.
- [ ] Licensing is recorded and restrictive licences are enforced.
- [ ] Private objects are unreachable except by short-lived signed URL.
- [ ] Entitlements are evaluated server-side immediately before issuance.
- [ ] Download history is complete and append-only.
- [ ] Restricted content is excluded from sitemaps, feeds, API, and public search.
- [ ] `database-security-reviewer` has signed off.

## Completion Report

Report: buckets created with policies, validation pipeline and its checks, checksum
handling, versioning behaviour, entitlement model, signed URL lifetime and issuance
path, download history schema, indexing exclusions, tests added with results,
reviewer sign-off, and documentation written.
