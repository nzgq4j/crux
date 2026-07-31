# Block 05 — Database Content Model

## Objective

Define the structured content schema for Crux, including stable identifiers,
immutable published versions, structured modules, and the taxonomy and identity
records that content references.

## Scope

### In scope

- The `cms` content tables, the `taxonomy` schema, and the `identity` schema.
- Version lifecycle: draft, published, corrected, superseded, withdrawn.
- Structured module storage and derived plain-text and Markdown representations.
- Stable fragment identifiers and redirects.

### Out of scope

- Workflow state machine (Block 08), claims and provenance (Block 16), policies
  (Block 07), and search indexing (Block 15).

## Dependencies

Block 04.

## Required Inputs

- `.claude/prompts/04-supabase-foundation.md`, `docs/product-requirements.md`.
- `.claude/rules/database.md`, `.claude/rules/content-modeling.md`.

## Required Outputs

- Migrations creating every table below.
- Generated types regenerated and committed.
- `docs/database.md` content-model section with an entity diagram.
- Seed data exercising every content state.

## Functional Requirements

### Required tables

Create, at minimum, with these exact names:

- `cms.content_types` — the registry of content types (article, report, white paper,
  dataset record, collection, hub page, static page), each with its permitted module
  types and validation rules.
- `cms.content_items` — the stable content entity. Holds the stable public
  identifier, canonical slug, type, current published version pointer, and lifecycle
  state. The item identifier never changes for the life of the content.
- `cms.content_versions` — an immutable row per published version, plus draft rows.
  Holds version number, status, publication timestamp, revision timestamp, and the
  supersession and withdrawal pointers.
- `cms.content_modules` — the catalogue of structured module types with their JSON
  schemas.
- `cms.content_version_modules` — the ordered modules composing a specific version,
  each with its typed JSON payload and stable fragment identifier.
- `cms.content_contributors` — the contributor rows linking a version to identity
  records with an explicit contributor role.
- `cms.content_relationships` — typed relationships between content items, including
  supersedes, corrects, relates-to, part-of-collection, and cites.
- `cms.redirects` — source path to target path, with status code and reason, so that
  slug changes never break a canonical URL.

### Version semantics

1. **Stable content identifiers.** Every content item carries a permanent public
   identifier independent of slug and title.
2. **Immutable published versions.** Once a version's status becomes published, its
   content, module payloads, contributor rows, and publication timestamp are
   immutable. Enforce with triggers, not convention.
3. **Draft versions.** Mutable, never publicly readable, and always attached to a
   content item.
4. **Corrections.** A correction creates a new version, records the correction
   reason and scope, and preserves the corrected version as retrievable.
5. **Supersession.** A superseding version records the superseded version; the
   superseded version remains resolvable at its own canonical URL.
6. **Withdrawal.** A withdrawn item retains its identifier and citation record,
   records the withdrawal reason and date, and serves a tombstone rather than the
   content body.
7. **Structured JSON.** Module payloads are typed JSON validated against the module
   schema. Opaque full-document HTML storage is prohibited.
8. **Plain-text generation.** Each version carries a generated plain-text rendering
   maintained by trigger or scheduled job, used by search and export.
9. **Markdown generation.** Each version carries a generated Markdown rendering used
   by the alternate machine-readable representations in Block 21.
10. **Stable fragment identifiers.** Every module has a fragment identifier that is
    unique within its version and stable across the version's life, so that a
    citation may address a section.

### Taxonomy and identity

11. **Controlled taxonomy.** `taxonomy` holds vocabularies, terms, hierarchical
    relationships, and content-to-term assignments. Free-text tagging is not
    permitted where a controlled vocabulary exists.
12. **Identity records.** `identity` holds people and organisations referenced as
    authors, reviewers, publishers, and sources.
13. **Expert records.** Expert profiles extend identity records with affiliation,
    biography, expertise terms, and disclosure statements.
14. **External identifiers.** Identity and content records support external
    identifier rows — ORCID, ROR, DOI, ISSN — with an identifier scheme and value.

## Technical Requirements

- Foreign keys on every relationship, with deliberate delete behaviour.
- Check constraints enforcing valid lifecycle states and version ordering.
- Unique constraints on stable identifiers, canonical slugs, and fragment ids
  within a version.
- Generated columns or triggers for derived text; never application-side drift.
- Indexes for every foreign key and every documented access path.

## Data Requirements

- No content type may be introduced outside `cms.content_types`.
- Every table has `created_at`, `updated_at`, and a created-by reference where a
  human actor is responsible.
- Seed data must include: a draft, a published version, a corrected version, a
  superseded pair, and a withdrawn item.

## Security Requirements

- Enable RLS on every table created here. Policies are authored in Block 07; until
  then the default is deny.
- Immutability triggers must be `SECURITY DEFINER` where required and must not be
  bypassable by an application role.
- Draft content must be structurally separable from published content so that a
  policy can isolate it without inspecting payload contents.

## Accessibility Requirements

Module schemas must carry the fields accessibility requires: alternative text for
figures, captions and summaries for tables, and a text alternative for charts. A
module type that renders a visual without a text alternative field is not acceptable.

## Testing Requirements

- A test proving a published version cannot be updated or deleted.
- A test proving fragment identifiers are unique within a version.
- Tests for correction, supersession, and withdrawal transitions.
- A test proving generated plain-text and Markdown update with module changes.
- A test proving a content item cannot reference an unregistered content type.

## Documentation Requirements

- `docs/database.md` documents every table, column, constraint, trigger, and index.
- Document the version lifecycle with a state diagram.
- Document each module type and its JSON schema.

## Acceptance Criteria

- [ ] All eight `cms` tables exist with the exact specified names.
- [ ] Published-version immutability is trigger-enforced and proven by test.
- [ ] Stable content identifiers are permanent and unique.
- [ ] Correction, supersession, and withdrawal are modelled and tested.
- [ ] Module payloads are typed JSON validated against registered schemas.
- [ ] Plain-text and Markdown renderings generate correctly.
- [ ] Fragment identifiers are stable and unique within a version.
- [ ] Taxonomy is controlled; identity, expert, and external identifier records exist.
- [ ] RLS is enabled on every new table.
- [ ] Seeds exercise every lifecycle state.

## Completion Report

Report: tables created, constraints and triggers added, immutability enforcement
mechanism, lifecycle transitions implemented, module types registered, taxonomy and
identity structures, indexes added, tests added with results, and documentation
written.
