# 2. Schema validation

The content model was designed before this corpus existed. This document tests it
against fourteen real documents and reports three things: what the model already
handles, where it strains and the strain is the model being *right*, and what is
genuinely missing.

Every recommendation cites the finding (`F`n, [document 01](01-corpus-analysis.md))
and the documents that demonstrate it. Recommendations with no corpus evidence are
not made.

**No DDL in this document has been applied.** Proposals are marked as such. The
database-infrastructure freeze remains in force; see
[document 11](11-implementation-sequence.md) for when to lift it.

## 2.1 What already fits

Stating this first, because the list of gaps below is shorter than it looks.

| Corpus property | Schema element | Evidence |
|---|---|---|
| Typed, ordered body modules | `cms.content_version_modules` with `module_key`, `position`, `fragment_id` | All 14; sections are addressable units in every document |
| Section-addressable citation | `fragment_id` unique per version | `PAPER 9 OF 10` §4.3 "Layer Three" is the kind of target a citation needs |
| Executive summary as a first-class field | `content_versions.executive_summary` | F8, 14 of 14 |
| Enumerated headline findings | `key_findings` module | F8, the three PDFs' numbered summaries |
| Recommendations as a distinct unit | `recommendation` module | F14, 11 of 14 |
| Interval-valued figures | `claims.value_lower` / `value_upper` | F24, "35 to 60 cents", "6 to 9 percent" |
| Contradicting evidence recorded, not dropped | `claim_sources.relationship = 'contradicts'` with mandatory note | Traffic Records' "Note on the 2010 Baseline" is exactly this pattern |
| Editorial credibility assessment | `sources.credibility` + `credibility_notes` | F23, the self-labelled Wikipedia entry |
| Location within a source | `claim_sources.location` / `location_type` | F25, quotations attributed to a hearing, a symposium, a GAO report |
| Correction metadata | `content_versions.correction_reason` / `correction_scope` | F26, Traffic Records' five-item revision statement |
| Series membership with editorial order | `content_relationships.part_of_collection` + `position` | F6 |
| Source deduplication | generated `normalised_title` / `normalised_identifier` | The AM pair (F/§1.4) cites overlapping sources |
| Nine claim types with derived evidence class | `knowledge.claims` | The corpus's evidence-before-interpretation ordering (§1.5) maps cleanly |

The structural core — modules, fragments, versions, immutability, claims — is
validated by this corpus. What follows is the margin.

## 2.2 Missing: recommended additions

### S1 — Subtitle

**Evidence:** F1. 14 of 14 documents carry a subtitle of 10–30 words distinct from
the title, and it carries the analytical proposition.

`cms.content_versions` has `title` and `standfirst`. `standfirst` is a lede — a
sentence written to draw a reader in. A subtitle is part of the document's name. If
a subtitle is stored in `standfirst`, then either the subtitle is missing from the
citation and the `<title>` element, or the lede is. Both are wrong.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE cms.content_versions ADD COLUMN subtitle text;
COMMENT ON COLUMN cms.content_versions.subtitle IS
  'Part of the document''s name, distinct from standfirst (a lede). Rendered in the
   title block and included in citation exports.';
```

Nullable: three of the seeded demonstration types (`page`, `collection`) have no
natural subtitle.

### S2 — Classification and distribution markings

**Evidence:** F3. 13 of 14 carry a marking, in five distinct forms, and two
documents repeat it in the footer or as the first element of the body.

There is no field for this. Storing it in body prose would make it a rendering
accident rather than a property of the version, and it would not survive citation
export or the public API.

```sql
-- PROPOSAL — NOT APPLIED
CREATE TABLE cms.distribution_markings (
  key          text PRIMARY KEY,
  label        text NOT NULL,          -- rendered verbatim; never abbreviated
  description  text NOT NULL,
  -- Whether the marking must be repeated in page furniture (header/footer/print).
  repeats_in_furniture boolean NOT NULL DEFAULT true,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms.content_versions
  ADD COLUMN distribution_marking_key text
    REFERENCES cms.distribution_markings(key) ON DELETE RESTRICT;
```

A controlled table rather than free text, because a marking that can be mistyped is
a marking that can be silently weakened, and because the five observed values are a
closed set that editorial governs.

**Two things this must not become.** First, it is **not an access-control input**.
Nothing in the corpus indicates that a `FOR OFFICIAL USE ONLY` marking restricts who
may read the document on this platform — these are documents the author intends to
publish. Wiring the marking to RLS because it *looks* like a clearance would invent
a policy the client has not stated. Second, it must not be presented to a reader as
though the platform enforced it. It is a label the author applies, rendered
faithfully. Both points are restated in [document 10](10-risks.md) R3.

### S3 — Publication date precision

**Evidence:** F4. 14 of 14 state a month and no day.

`content_versions.published_at` is `timestamptz` and `NOT NULL` when published. That
is correct for *when the platform published it*. It is not the same fact as *the
document's stated date*, and rendering "1 April 2026" for a document that says
"April 2026" fabricates a day.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE cms.content_versions
  ADD COLUMN stated_date date,
  ADD COLUMN stated_date_precision text
    CHECK (stated_date_precision IN ('day', 'month', 'year')),
  ADD CONSTRAINT stated_date_precision_pair
    CHECK ((stated_date IS NULL) = (stated_date_precision IS NULL));
```

`published_at` stays as it is — the platform event. `stated_date` with its precision
is what renders, and what a citation export emits. Where they disagree, both are
true.

### S4 — Organisational authorship

**Evidence:** F5. Thirteen of fourteen documents name no individual author. Two
attribute the work to the organisation explicitly.

`cms.content_contributors.person_id` is `NOT NULL REFERENCES identity.people(id)`.
There is no way to record "Crucible Insight" as the author. The three available
courses are: leave the thirteen documents with no contributor at all (so they render
and cite with no attribution, which is wrong — they *are* attributed, just not to a
person); invent a person (forbidden outright by
`.claude/rules/content-modeling.md` 24 and 25); or model an organisational
contributor.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE cms.content_contributors
  ALTER COLUMN person_id DROP NOT NULL,
  ADD COLUMN organisation_id uuid REFERENCES identity.organisations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT contributor_is_person_xor_organisation
    CHECK ((person_id IS NULL) <> (organisation_id IS NULL));
```

The existing `UNIQUE (version_id, person_id, role)` needs a partial-index equivalent
for the organisational case; that detail belongs to the migration, not here.

This is the only proposal in this document that relaxes a `NOT NULL`, and it is
worth being explicit about why that is safe: the XOR check means the row is never
*less* attributed than before, only differently attributed.

### S5 — Government and standards report identifiers

**Evidence:** F20. Thirty-five distinct identifier forms observed, none of which is
a DOI, ISBN, ISSN, PMID, arXiv ID, handle, URN or OCLC number. F21: the DOI-bearing
academic tail exists but the documents do not state the DOIs.

`knowledge.sources` currently forces a choice between recording `GAO-25-107283` as a
loose string in the title, or not recording it. Both destroy the dedup key that the
generated `normalised_identifier` column exists to provide — and this corpus cites
the same GAO reports across multiple documents, so dedup is not hypothetical.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE knowledge.sources
  DROP CONSTRAINT sources_identifier_scheme_check,   -- name per pg_constraint
  ADD CONSTRAINT sources_identifier_scheme_check CHECK (
    identifier_scheme IN ('doi','isbn','issn','pmid','arxiv','handle','urn','oclc',
                          'report_number','legislation','docket')
  ),
  ADD COLUMN identifier_authority text,
  ADD CONSTRAINT sources_authority_required_for_report_number CHECK (
    identifier_scheme NOT IN ('report_number','legislation','docket')
      OR (identifier_authority IS NOT NULL AND length(btrim(identifier_authority)) > 0)
  );
```

Three added schemes rather than one per issuing body, with the body named in
`identifier_authority` (`GAO`, `CRS`, `DoD`, `NHTSA`, `NIST`, `NPS`, `UNSC`). The
alternative — a scheme per authority — would need editing every time the corpus
cites a new agency, which is a schema change triggered by ordinary editorial work.

The composite dedup index would need to include `identifier_authority`, since
`R48477` from CRS and a hypothetical `R48477` from elsewhere are different sources.

### S6 — Numeric claims must carry a unit

**Evidence:** F24. Every quantitative figure in the corpus has a unit — percent,
cents per dollar, dollars, dollars per day, fatalities, fatalities per 100 million
VMT, attacks, kilometres, percentage points, milliseconds.

`claims_quantitative_requires_measurement` requires `unit` for
`quantitative_finding`. Nothing requires it for an `observed_fact` that carries a
number — and §2.3 below concludes that most corpus figures should be recorded as
`observed_fact`. A `value` of `39254` with no unit is not a fact.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE knowledge.claims ADD CONSTRAINT claims_value_requires_unit CHECK (
  value IS NULL OR (unit IS NOT NULL AND length(btrim(unit)) > 0)
);
```

### S7 — Callout label

**Evidence:** F11. All 17 callout boxes open with a label —
`THE FEEDSTOCK IMPERATIVE`, `Central Finding`, `GAP 1 FINDING`,
`Key Doctrinal Reference`, `Authority Challenge`.

The `callout` module's registered schema is
`{"type":"object","required":["text"]}`. Folding the label into `text` makes it
prose, so it cannot be styled, cannot be used as an accessible name for the
`<aside>`, and is indistinguishable from the first sentence.

```json
// PROPOSAL — NOT APPLIED. cms.content_modules.json_schema for key 'callout'
{ "type": "object",
  "required": ["text"],
  "properties": {
    "label": { "type": "string", "maxLength": 120 },
    "text":  { "type": "string" } } }
```

A catalogue row update, not a schema change.

### S8 — The `references` module has no schema

**Evidence:** F17. Four distinct citation mechanisms, 263+ enumerable entries.

`cms.content_modules` registers `references` with `json_schema` of
`{"type":"object"}` — which validates anything, including an empty object. That is a
registered type with no contract, and `.claude/rules/content-modeling.md` 2 requires
every module payload to validate against a registered schema.

The corpus shows what the contract needs to express: whether the block is
front-matter primary sources or a terminal bibliography (F17), and whether each
entry carries an annotation of what it establishes (F18).

```json
// PROPOSAL — NOT APPLIED. cms.content_modules.json_schema for key 'references'
{ "type": "object",
  "required": ["placement", "entries"],
  "properties": {
    "placement": { "enum": ["primary_sources", "principal_sources", "bibliography"] },
    "heading":   { "type": "string" },
    "entries": { "type": "array", "items": {
      "type": "object",
      "required": ["source_id"],
      "properties": {
        "source_id":   { "type": "string", "format": "uuid" },
        "establishes": { "type": "string" },
        "marker":      { "type": "string" } } } } } }
```

`source_id` rather than a formatted string: the rendered citation must be generated
from `knowledge.sources`, so that a source corrected in one place is corrected
everywhere. `establishes` is where F18's annotations go. `marker` carries the
inline numeral for the two documents that use one (F17).

## 2.3 Where the corpus strains the schema and the schema is right

These are cases where ingestion is harder than it would be with a looser model. In
each, the looser model would be worse. They are recorded here so that the cost is
visible and nobody quietly relaxes a control later to make an import run.

### T1 — Quantitative findings require an analysis run, and the corpus has none

`claims_quantitative_requires_measurement` requires `analysis_run_id IS NOT NULL`,
and `.claude/rules/content-modeling.md` 18a makes that absolute and
non-configurable.

The corpus's figures are almost all *cited* (F24): GAO measured them, NHTSA measured
them, Jounce Media measured them. Crucible Insight is reporting a measurement, not
producing one.

**Recommendation: classify cited figures as `observed_fact`, not
`quantitative_finding`, and do not touch the constraint.** A `quantitative_finding`
in this model means "we computed this, and here is the run that produced it". A
number the author read in a GAO report is an observed fact about what GAO reported,
supported by a `claim_sources` link to GAO with a `location`. `value`,
`value_lower`, `value_upper` and `unit` remain populated — they are nullable on
every type — which is why S6 above matters.

The distinction has teeth in exactly the right place: the Traffic Records analysis,
if Crucible Insight re-derives fatality rates from NHTSA microdata, *is* a
quantitative finding and *should* be blocked until the dataset version and run are
recorded.

This must be written into the editorial guidance before the first ingestion, because
the wrong choice here is invisible in the rendered page and corrupts the evidence
model permanently.

### T2 — URLs require an access date, and the corpus supplies none

`sources_url_requires_access_date` refuses a source row with a URL and no
`access_date`. Traffic Records cites 27 sources with URLs and no retrieval dates
(F22).

**Recommendation: keep the constraint.** A URL with no retrieval date is an
unfalsifiable citation — the page can change and nothing records what was seen.
The cost is real: ingesting Traffic Records means capturing 27 access dates. That is
editorial work, and it is the work the constraint exists to force.

The one thing that must not happen is recording today's date as the access date for
a source the author read in April 2026. That is fabrication under
`.claude/rules/content-modeling.md` 24. If the true retrieval date is unknown, the
honest options are to record the date the source was verified during ingestion
(true, and different from when the author read it) or to omit the URL and cite the
document by its identifier. Both are defensible; guessing is not.

### T3 — Tables require captions, and none of the 25 has one

The `table` module requires `headers`, `rows` and `caption` (F13).

**Recommendation: keep the requirement.** `.claude/rules/accessibility.md` 21
requires a caption and, for complex tables, a summary. The corpus's tables are
complex: six columns, decision matrices with authority and timeline columns.
Ingesting them means writing 25 captions. That is the accessibility obligation
arriving as work, which is what it is supposed to do.

Two Traffic Records tables already have caption text in the paragraph above them
(F13) and can be transcribed rather than authored.

### T4 — Separation of duties, and an organisation with one identifiable person

Not a schema strain but the same category of problem, so it is recorded here and
analysed in [document 06](06-workflow-validation.md) §4: the corpus names one
individual (F5), and the workflow requires that author, reviewer and approver are
not the same account. The control is correct. The organisation needs a second
editorial account before anything can be published through the workflow.

## 2.4 Considered and not recommended

Restraint matters as much as the additions. Each of these looked like a gap and is
not.

| Considered | Why not |
|---|---|
| A `series` table | F6's series are ordered sets of documents with their own identity, which is what a `collection` content item plus `part_of_collection` relationships already is. A second mechanism would fragment the model. See [document 07](07-relationship-graph.md) §3. |
| A `sequence_total` column for "PAPER 9 OF 10" | The declared total is a property of the series, not of paper 9. It belongs on the collection item's own version, in prose or in a field that block does not yet have. Adding a column to every version to hold a fact about one document is the wrong shape. |
| A `pillar` column | Pillar is a controlled vocabulary term (F7), and `taxonomy` already models controlled vocabularies. See [document 03](03-taxonomy-recommendations.md). |
| A structured `executive_summary` type | The `.docx` summaries are prose and fit the existing `text` column; the PDF summaries are enumerated and fit the existing `key_findings` module (F8). Two existing mechanisms already cover both forms. |
| A `subtitle`-like field for the banner line | The banner (`C-UAS WHITE PAPER SERIES \| PAPER 9 OF 10 \| INTELLIGENCE ARCHITECTURE PILLAR`) is a *rendering* of series membership, sequence and pillar — three facts already modelled elsewhere. Storing the composed string would let it drift from its parts. |
| A `document_class` vocabulary for "White Paper" / "Research Paper" / "Threat Analysis" | That is `cms.content_types`. The corpus does need the type set reviewed — see §2.5 — but not a parallel vocabulary. |
| An `issuing_authority` vocabulary for GAO, CRS, NHTSA | These are publishers of sources, which `knowledge.sources.publisher` and `identity.organisations` already hold. S5's `identifier_authority` covers the identifier case. |
| A `table_of_contents` module | AM White Paper has a literal `TABLE OF CONTENTS` heading, but `.claude/rules/content-modeling.md` 4 requires derived representations to be generated from the structured source. A ToC is derived from the heading modules. Storing one would let it go stale. |
| Relaxing `content_versions` immutability for markings | A published document's classification marking is part of what was published. Changing it is a new version. |

## 2.5 A configuration question, not a schema question

`supabase/seed.sql` sets `requires_methodology = true` and
`requires_limitations = true` for `report`, `white_paper` and `data_story`, and
`requires_limitations = true` for `brief` and `case_study`. The publication gates
`methodology_present` and `limitations_present` enforce that.

**No document in the corpus has either section** (F15). Every one of the fourteen
would be refused publication as a `white_paper` today.

This is not a schema defect and the gates are not wrong. Three courses exist:

1. **Map the existing material.** Seven documents have a front-matter sources-and-
   scope statement that *is* a methodology note ("draws exclusively on publicly
   available and officially released sources; no classified information is
   referenced", plus the `ASSESSMENT SCOPE` block naming what was drawn on). Map
   `ASSESSMENT SCOPE` + the sources statement → `methodology`. That is honest: it
   describes how the work was carried out.
2. **Author the missing limitations.** No document has a limitations section, and
   six have limitation *statements* embedded in prose (F15). Extracting those into a
   `limitations` value is editorial judgement about the author's own work — it needs
   the author, not an importer.
3. **Publish the corpus under a content type with a lower standard.** `article`
   requires neither and sets `minimum_evidence_standard = 'recommended'`.

**Recommendation: 1 and 2 for the first document, 3 for nothing.** Option 3 is the
tempting one and it is how a publishing platform's evidence standard quietly becomes
decorative: a `white_paper` filed as an `article` to clear a gate is a mislabelled
document. The first vertical slice should publish **one** document as a
`white_paper`, with its methodology mapped and its limitations authored, precisely
because that is the path that proves the gates work. See
[document 11](11-implementation-sequence.md).

## 2.6 Summary of recommendations

| ID | Change | Kind | Demonstrated by |
|---|---|---|---|
| S1 | `content_versions.subtitle` | new column | F1 — 14 of 14 |
| S2 | `cms.distribution_markings` + FK on version | new table + column | F3 — 13 of 14 |
| S3 | `stated_date` + `stated_date_precision` | new columns | F4 — 14 of 14 |
| S4 | organisational contributor (person XOR organisation) | relaxed NOT NULL + new column + check | F5 — 13 of 14 |
| S5 | `report_number`/`legislation`/`docket` schemes + `identifier_authority` | check + new column | F20 — 35 identifier forms |
| S6 | numeric claim requires a unit | new check | F24, and T1 |
| S7 | `callout.label` | catalogue row update | F11 — 17 boxes |
| S8 | `references` module payload schema | catalogue row update | F17, F18 — 263+ entries |

Eight changes. Two are catalogue rows, not DDL. Five are additive. One relaxes a
`NOT NULL` behind an XOR check.

No proposal weakens a security control, an immutability trigger, an RLS policy or a
publication gate.
