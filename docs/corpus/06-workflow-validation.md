# 6. Workflow validation

The editorial state machine — nine states, eighteen declared transitions, eleven
publication gates — has been tested against synthetic fixtures. This document walks
it against fourteen real documents and reports what would actually happen.

The short version: **the state machine is sound and the gates are correct, and if
the corpus were ingested today every document would be refused publication.** Two
gates and one control account for all of it, and none of the three is wrong.

## 6.1 The path a corpus document would take

Take the Sensor Fusion paper (`PAPER 9 OF 10`) as the worked example.

| Step | Transition | Permission | Gates | Would it pass? |
|---|---|---|---|---|
| 1 | `draft → in_review` | `content.submit_for_review` | none | Yes |
| 2 | `in_review → approved` | `content.approve` | `review_complete`, `approval_recorded`, `separation_of_duties` | **No — separation of duties** (§6.4) |
| 3 | `approved → published` | `content.publish` | nine gates | **No — methodology, limitations, evidence standard** (§6.2, §6.3) |

The machinery reached at step 1 works. Everything that stops the document is a
content or organisational fact, not a defect in the workflow.

## 6.2 `methodology_present` and `limitations_present` refuse all fourteen

**Evidence:** F15. No document has a Methodology section. No document has a
Limitations section. Zero of fourteen, by heading.

Both gates apply to `approved → scheduled` and `approved → published`, and both are
driven by `cms.content_types.requires_methodology` / `requires_limitations`, which
`supabase/seed.sql` sets to `true` for `report`, `white_paper` and `data_story`.

Thirteen of the fourteen documents call themselves a white paper, a strategic white
paper, or a research paper. Filed as `white_paper`, none can publish.

**This gate is correct and should not be relaxed.** The resolution is in
[document 02](02-schema-validation.md) §2.5: map the front-matter
`ASSESSMENT SCOPE` block plus the sources statement
(*"draws exclusively on publicly available and officially released sources; no
classified information is referenced"*) to `methodology` — that is an honest
description of how the work was done — and have the author write the limitations,
which no importer can do on their behalf.

Six documents contain limitation statements in body prose that the author can lift
(F15). One, ADTech003, states its central limitation in the executive summary:
AI methods *"can narrow uncertainty around walled garden performance but cannot
resolve it"*. That is a limitations section waiting to be written down.

The temptation — filing the corpus as `article`, which requires neither — is the
failure mode. It is recorded as [document 10](10-risks.md) R2.

## 6.3 `evidence_standard_met` is the real cost of ingestion

`white_paper` and `report` carry `minimum_evidence_standard = 'mandatory'`. The gate
requires claim-to-source linkage across the version.

The corpus has source *lists*, not claim linkage. Converting one document means:

1. Creating `knowledge.sources` rows for its 18–27 cited sources (F19).
2. Identifying its claims and classifying each into one of the nine types.
3. Linking each claim to the sources that support it, with a location.

Step 3 is far cheaper than it looks for seven of the documents, because the
`Principal Sources` blocks already say what each source establishes (F18):

> *War Quants: Factory-to-Frontline Pipeline analysis (March 2025): Ukraine 20,000
> to 200,000/month FPV production scale; commodity polymer feedstock supply chain…*

That is a claim-to-source link written in prose. For those seven documents the work
is transcription. For the other seven — AM White Paper, C-UxS Maritime, Integrated
Effects, Traffic Records and the three PDFs — the linkage has to be reconstructed by
reading the body against the bibliography, which is materially harder.

**Sizing.** ADTech001's executive summary alone carries eight numbered claims, each
with a figure (F24). A realistic estimate for a full document is 40–80 claims. At
300+ source entries corpus-wide, full ingestion of all fourteen is a multi-week
editorial programme, not an import script. That estimate is a judgement from the
document structure, not a measurement, and the first document ingested should be
used to replace it with a real number.

## 6.4 `separation_of_duties` cannot be satisfied by the organisation as it stands

**Evidence:** F5. One individual is named anywhere in the corpus.

The trigger refuses a review or approval by the author of the version, and
[document 02](02-schema-validation.md) T4 records it. The control is right —
`.claude/rules/security.md` and the Block 08 contract both require it, and a
self-approved publication is exactly what an editorial workflow exists to prevent.

It is also, for a small research organisation, a real operational constraint:
**Crucible Insight needs at least two accounts with editorial permissions before any
document can be published through the workflow.** Author, reviewer and approver may
be two people (the reviewer may approve, on the current transition set), but they
cannot be one.

This is a fact to put in front of the client early, because the alternative is
discovering it at the moment of first publication and being tempted to weaken the
trigger. Weakening it is not on the table
(`.claude/rules/testing.md` 7).

## 6.5 `quantitative_traceability` — and why §2.3 T1 matters here

The gate requires every `quantitative_finding` to resolve to an analysis run, and
`.claude/rules/content-modeling.md` 18a makes that absolute.

The corpus has no analysis runs (F24 — its figures are cited, not computed). If a
cited figure is classified as `quantitative_finding`, the gate refuses it, correctly,
and there is no honest way to satisfy it: inventing an analysis run to hold a number
read in a GAO report is fabrication.

The resolution is the classification decision in
[document 02](02-schema-validation.md) T1 — cited figures are `observed_fact` — and
it must be made *before* the first ingestion. Made wrongly, it is invisible on the
rendered page and permanently corrupts the evidence model.

The Traffic Records paper is the case that keeps the gate honest: if Crucible
Insight re-derives fatality rates from NHTSA data rather than quoting NHTSA's
published rate, that *is* a quantitative finding and *should* be blocked until the
dataset version and run are recorded.

## 6.6 `figure_text_alternatives` — nearly untested by this corpus

Three embedded images across fourteen documents (F/§1.2): one in Integrated Effects,
two in Traffic Records. None carries alternative text in the source.

The gate will fire on Traffic Records and Integrated Effects and pass trivially on
the other twelve. It is therefore *exercised* but not *stressed* by this corpus. A
figure-heavy document would test it properly, and the corpus does not contain one —
recorded as a coverage gap rather than implied to be covered
(`.claude/rules/testing.md` 18).

## 6.7 `confidence_source_resolvable`

`knowledge.claims.confidence` defaults to `medium`. The gate requires
high-confidence claims to resolve to sources.

The corpus hedges explicitly and often — *"approximately"*, *"an estimated"*,
*"ranges from 6 to 9 percent"*, *"unverifiable due to structural prohibition on
independent measurement"* — and states some things flatly: the 39,254 fatality
figure is *"confirmed by NHTSA's final data release on April 1, 2026"*. The corpus
therefore supplies both high- and lower-confidence claims naturally, and the
confidence field should be populated from the author's own hedging rather than
defaulted. Where a document says *unverifiable*, that is a `low` confidence claim
with a rationale, not an omission.

## 6.8 The correction path, and the version that is not there

**Evidence:** F26. Traffic Records is an explicitly revised edition with a five-item
change statement, and **its predecessor is not in the corpus**.

The declared path is
`published → correction_pending → superseded`, with `reason_recorded` on both ends
and a new version published in between. That path assumes the platform holds the
version being corrected.

Here it does not. The options are:

1. Publish the revised edition as version 1 with `correction_reason` and
   `correction_scope` populated and `supersedes_id` null, and render the revision
   notice (D12). Honest: it says what changed, and does not claim to hold what it
   does not.
2. Create a placeholder for the predecessor. **Rejected** — it would mean
   publishing a version whose content the platform does not have, which is
   fabrication by another name.

**Recommendation: option 1**, and a `content_relationships` edge is *not* created
either, since there is nothing to point at. If the predecessor edition is later
supplied, it can be ingested as version 1 and the revision as version 2, and the
supersession recorded properly at that point.

This is worth an acceptance test in its own right
([document 08](08-acceptance-tests.md) WF-08): a correction whose predecessor is
absent must be publishable without inventing one.

## 6.9 States the corpus does not exercise

Recorded explicitly rather than left to look covered.

| State / transition | Corpus evidence | Status |
|---|---|---|
| `scheduled` (and `schedule_in_future`) | none — no document indicates a future publication date | **Untested by this corpus** |
| `withdrawn` and the public tombstone | none — no document is withdrawn or references a withdrawn predecessor | **Untested by this corpus** |
| `changes_requested` | none — the corpus is finished work, with no review history | **Untested by this corpus** |
| `published → superseded` (without correction) | none directly; Traffic Records is a correction, not a routine supersession | **Untested by this corpus** |
| `draft → withdrawn` | none | **Untested by this corpus** |

These need synthetic fixtures. The corpus is finished research and contains no
editorial history, which is the one thing a workflow test most wants.

## 6.10 Gate-by-gate summary

| Gate | Corpus verdict |
|---|---|
| `review_complete` | Passes once a review is recorded — no corpus obstacle |
| `approval_recorded` | Passes once an approval is recorded — no corpus obstacle |
| `separation_of_duties` | **Blocks** until a second editorial account exists (§6.4) |
| `methodology_present` | **Blocks** all 14 until methodology is mapped (§6.2) |
| `limitations_present` | **Blocks** all 14 until limitations are authored (§6.2) |
| `evidence_standard_met` | **Blocks** under `mandatory` until claims are linked (§6.3) |
| `quantitative_traceability` | Passes if cited figures are `observed_fact`; blocks correctly otherwise (§6.5) |
| `confidence_source_resolvable` | Passes with honest confidence values (§6.7) |
| `figure_text_alternatives` | Fires on 2 of 14; under-exercised (§6.6) |
| `schedule_in_future` | Not exercised (§6.9) |
| `reason_recorded` | Exercised only by Traffic Records (§6.8) |

## 6.11 What this means for the first vertical slice

Publishing one document end-to-end through the real workflow requires, in order:

1. A second editorial account (§6.4).
2. The `observed_fact` versus `quantitative_finding` classification decision, written
   into editorial guidance (§6.5).
3. Methodology mapped and limitations authored for that one document (§6.2).
4. That document's sources and claims created and linked (§6.3).

None of it is engineering. All of it is a prerequisite to the engineering being
demonstrable, which is the useful thing this corpus has established.

The document to choose is analysed in
[document 11](11-implementation-sequence.md) §3.
