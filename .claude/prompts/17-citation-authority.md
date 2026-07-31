# Block 17 — Citation and Authority

## Objective

Make every published Crux version precisely and durably citable, with version-aware
identifiers, complete authority metadata, and export in every required format.

## Scope

### In scope

- Stable identifiers, canonical URLs, and version-aware citation resolution.
- Publisher, author, and contributor authority metadata.
- Methodology, limitations, sources, licences, disclosures, revision history, and
  correction notices as citation metadata.
- Export in eight formats — the five mandated by §45.3.4 plus three retained
  additions, which are deferrable only with a recorded traceability row.

### Out of scope

- The public API (Block 18) and machine-discovery surfaces (Block 21), which consume
  this block's metadata.

## Dependencies

Blocks 05, 16.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/16-claims-provenance.md`.
- `.claude/rules/content-modeling.md`.

## Required Outputs

- The citation resolution service and format renderers.
- Citation export routes for every format.
- `docs/citations.md`.

## Functional Requirements

1. **Stable identifiers.** Every content item has a permanent identifier, and every
   published version has a permanent version identifier. Neither is reused, and
   neither changes when a slug or title changes.
2. **Canonical URLs.** Every version has a canonical URL. An item-level URL resolves
   to the current version; a version-level URL always resolves to that specific
   version, including after supersession.
3. **Version-aware citations.** A citation records the version cited, its publication
   date, and the retrieval date. Citing an item that has since been corrected must
   still resolve to the version actually cited, with a notice that a later version
   exists.
4. **Publisher identity.** Publisher name, canonical organisation URL, and
   organisational external identifiers.
5. **Author identity.** Authors resolve to identity records with names as they should
   appear in a citation, affiliations at the time of publication, and external
   identifiers such as ORCID where present.
6. **Contributor roles.** Contributions are typed — author, reviewer, editor, data
   analyst, and so on — and only the roles that belong in a citation appear in the
   rendered citation, while the full contribution record remains available.
7. **Publication dates.** First publication date and, separately, the date of the
   cited version.
8. **Revision dates.** The version's revision date where it differs from its
   publication date.
9. **Methodology.** The methodology statement is retrievable as citation-adjacent
   metadata.
10. **Limitations.** The limitations statement is retrievable alongside methodology.
11. **Sources.** The version's reference list, resolvable to `knowledge.sources`.
12. **Licences.** The licence under which the version is published, with its URL and
    the permitted reuse.
13. **Disclosures.** Funding, conflict-of-interest, and independence disclosures
    attached to the version and its contributors.
14. **Revision histories.** The ordered list of versions for the item, each with its
    date, its change summary, and its own canonical URL.
15. **Correction notices.** Where a version was corrected, the correction notice —
    date, scope, and reason — is part of the citation record for both the corrected
    and correcting versions.

### Citation formats

Render every citation in all of: plain text, APA, Chicago, Harvard, MLA, BibTeX,
RIS, and CSL-JSON.

§45.3.4 requires five of these — APA, MLA, Chicago, BibTeX, and RIS — as the
mandatory minimum. The eight above are retained as the full set, since the superset
satisfies §45 without loss. Plain text, Harvard, and CSL-JSON may be deferred to a
later release only if the deferral is recorded as a Deferred row in
`docs/requirements-traceability.md`, which Block 24 reconciles into
`docs/known-limitations.md`. The five §45 formats may not be deferred.

Each renderer must handle: multiple authors, organisational authors, no named author,
a corrected version, a superseded version, a withdrawn version, and a version with no
DOI.

### Discovery limitation statement

This block, and any documentation or user-facing text it produces, must state
explicitly that **technical controls cannot guarantee citation by an external large
language model**. Structured metadata, stable identifiers, machine-readable
representations, and `llms.txt` improve the conditions for accurate attribution; they
do not compel or guarantee it. No surface, document, or marketing text produced under
this architecture may claim otherwise.

## Technical Requirements

- One canonical metadata assembly function feeds every format renderer, so formats
  cannot drift apart.
- CSL-JSON output validates against the CSL-JSON schema; BibTeX and RIS outputs
  parse in standard tooling.
- Character escaping is correct per format, including accented names and
  mathematical notation.
- Citation responses carry appropriate caching headers and are version-addressable.

## Data Requirements

- Citation metadata derives from stored data only. No field may be inferred,
  approximated, or fabricated. Where a field is genuinely absent, it is omitted and
  the omission is visible, not filled with a plausible value.
- Withdrawn versions retain a complete citation record with a withdrawal notice.

## Security Requirements

- Citation endpoints expose published metadata only. No draft, no contributor
  personal contact data, and no internal review record is exposed.
- Citation export is rate-limited.
- Exports contain no privileged identifiers or internal database keys beyond the
  intended public identifiers.

## Accessibility Requirements

- Citation blocks are readable as text and are not images.
- Copy-to-clipboard controls have accessible names and announce their result.
- Format selection is a labelled, keyboard-operable control.
- Correction and withdrawal notices are conveyed in text with clear language.

## Testing Requirements

- A test per implemented format asserting exact expected output for a fixture
  version. The five §45 formats must always be covered; a deferred format has no test
  and a recorded Deferred traceability row instead.
- Tests covering multiple authors, organisational authors, missing authors, and
  special characters.
- A test proving a version-level URL resolves to the cited version after supersession.
- A test proving a corrected version's citation carries the correction notice.
- A test proving a withdrawn version retains a resolvable citation record.
- A test proving no citation field is fabricated when source data is absent.
- Validation tests for CSL-JSON, BibTeX, and RIS parseability.

## Documentation Requirements

- `docs/citations.md`: the identifier scheme, the URL scheme, the metadata model,
  each supported format with an example, and the correction and withdrawal behaviour.
- The document must contain the discovery limitation statement above.

## Acceptance Criteria

- [ ] Item and version identifiers are permanent and never reused.
- [ ] Version-level URLs resolve to the exact version after supersession.
- [ ] All fifteen metadata elements are present in the citation record.
- [ ] The five §45 formats — APA, MLA, Chicago, BibTeX, RIS — render correctly and
      validate where a schema exists. These are non-deferrable.
- [ ] Plain text, Harvard, and CSL-JSON render correctly and validate, **or** their
      deferral is recorded as a Deferred row in `docs/requirements-traceability.md`.
- [ ] Every renderer draws from a single metadata assembly function.
- [ ] Corrections and withdrawals appear in the citation record.
- [ ] Absent fields are omitted, never fabricated, proven by test.
- [ ] The discovery limitation statement is present in the documentation.
- [ ] Citation endpoints expose no draft or internal data.

## Completion Report

Report: identifier scheme, URL resolution behaviour, metadata elements implemented,
formats delivered with validation results, correction and withdrawal handling,
fabrication-prevention evidence, rate limits applied, tests added with results, the
discovery limitation statement location, and documentation written.
