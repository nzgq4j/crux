# Block 16 — Claims and Provenance

## Objective

Implement the evidence layer: classified claims, sources, datasets, analysis methods,
and figure provenance, so that every quantitative finding published by Crux is
traceable to the data and method that produced it.

## Scope

### In scope

- The `knowledge` schema and its nine required tables.
- Claim classification and its constraints.
- Traceability requirements for quantitative claims and figures.

### Out of scope

- Citation formatting and export (Block 17), and the editor interface (Block 10).

## Dependencies

Blocks 05, 08.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/08-editorial-workflow.md`.
- `.claude/rules/database.md`, `.claude/rules/content-modeling.md`.

## Required Outputs

- Migrations creating the `knowledge` schema tables.
- Traceability constraints and validation functions consumed by the Block 08 gates.
- `docs/provenance.md`.

## Functional Requirements

### Required tables

Create, with these exact names:

- `knowledge.claims` — the claim record: assertion text, claim type, the content
  version and module fragment it appears in, confidence, and the period and
  population it applies to.
- `knowledge.sources` — bibliographic records for external and internal sources:
  title, authors, publisher, publication date, access date, URL, external
  identifiers, and source credibility notes.
- `knowledge.claim_sources` — the many-to-many link between claims and sources,
  recording the specific location within the source and the support relationship
  (supports, partially supports, contradicts, provides context).
- `knowledge.datasets` — dataset records: name, description, custodian, licence,
  coverage, and access classification.
- `knowledge.dataset_versions` — an immutable version per dataset release, with
  checksum, row count, collection period, and the asset version holding the file.
- `knowledge.dataset_variables` — the variable dictionary per dataset version: name,
  label, data type, unit, permitted values, and definition.
- `knowledge.analysis_methods` — reusable method definitions: name, description,
  assumptions, parameters, and limitations.
- `knowledge.analysis_runs` — an execution record binding a method to specific
  dataset versions with specific parameters, recording the run timestamp, the
  executing actor, and the output summary.
- `knowledge.figure_provenance` — links a figure in a content version to the analysis
  run, dataset versions, and variables that produced it.

### Claim classification

Every claim carries exactly one type from this controlled set, and the distinctions
are enforced rather than advisory:

- **Observed fact** — directly measured or recorded; requires a source.
- **Derived finding** — produced by analysis; requires an analysis run.
- **Quantitative finding** — a derived finding with a numeric value; requires an
  analysis run, a value, a unit, and a period.
- **Interpretation** — the analyst's reading of a finding; must reference the
  finding it interprets.
- **Forecast** — a forward-looking estimate; requires a method, a horizon, and a
  stated uncertainty.
- **Recommendation** — a proposed action; must reference the findings supporting it.
- **Assumption** — a stated premise; must be labelled as unverified.
- **Opinion** — an attributed view; must record whose opinion it is.
- **Definition** — a terminological statement; requires a source or an explicit
  statement that it is the platform's own definition.

### Traceability

1. **Quantitative claims must be traceable.** A quantitative finding cannot be
   published unless it resolves to an analysis run, which resolves to dataset
   versions and variables. This is enforced as a Block 08 publication gate backed by
   a database validation function.
2. **Figures must be traceable.** A figure presenting data cannot be published
   without a `figure_provenance` row resolving to its analysis run and dataset
   versions.
3. **Source requirement.** Observed facts require at least one supporting source.
   Interpretations, recommendations, and forecasts must reference their basis.
4. **Contradiction visibility.** Where a source contradicts a claim, the relationship
   is recorded rather than omitted, and is surfaced in the Block 09 evidence review.

## Technical Requirements

- Claim type constraints are enforced by check constraints and validation functions,
  not by application convention alone.
- Dataset versions are immutable once referenced by a published content version.
- Analysis runs record enough parameter detail to identify what was computed;
  reproducibility limitations are recorded explicitly where full reproduction is not
  possible.
- Source deduplication on normalised external identifier and normalised title.

## Data Requirements

- All nine tables carry RLS from creation, with visibility inherited from the
  content version for claim-attached rows.
- Sources and datasets may exist independently of any content and are readable by
  editorial roles before publication.
- Provenance rows are retained after withdrawal so that the evidence record survives.

## Security Requirements

- Claims attached to draft versions are not publicly readable.
- Dataset access classification is enforced: a restricted dataset's variables and
  files are not readable by unauthorised users, though its existence may be
  advertised where the classification permits.
- No provenance path may disclose a restricted dataset's contents through a
  published figure's metadata.
- Analysis run records must not embed credentials or connection strings.

## Accessibility Requirements

Claim type, confidence, and provenance are conveyed as text wherever rendered, never
by icon or colour alone. The evidence review surface in Block 09 must expose
claim-to-source relationships in a keyboard-navigable, screen-reader-legible form.

## Testing Requirements

- A test per claim type asserting its required fields are enforced.
- A test proving a quantitative finding without an analysis run fails the
  publication gate.
- A test proving a data figure without provenance fails the publication gate.
- A test proving an observed fact without a source fails validation.
- A test proving a dataset version referenced by a published version is immutable.
- A test proving restricted dataset contents are unreadable by unauthorised users.
- A test proving provenance survives content withdrawal.

## Documentation Requirements

- `docs/provenance.md`: the nine tables, the claim taxonomy with worked examples of
  each type, the traceability rules, and the evidence review procedure.
- Document how reproducibility limitations are recorded when a run cannot be
  reproduced exactly.

## Acceptance Criteria

- [ ] All nine `knowledge` tables exist with the exact specified names.
- [ ] All nine claim types exist and their distinguishing constraints are enforced.
- [ ] Quantitative findings are traceable to analysis runs, datasets, and variables.
- [ ] Data figures are traceable through `figure_provenance`.
- [ ] Observed facts require sources; interpretations reference their basis.
- [ ] Contradicting sources are recordable and surfaced.
- [ ] Dataset versions referenced by published content are immutable.
- [ ] Restricted dataset contents are unreadable by unauthorised users.
- [ ] Publication gates reject untraceable quantitative content, proven by test.
- [ ] RLS is enabled on all nine tables.

## Completion Report

Report: tables created, claim taxonomy implemented with its constraints, traceability
validation functions and the gates consuming them, dataset immutability enforcement,
figure provenance model, source deduplication approach, RLS applied, tests added with
results, and documentation written.
