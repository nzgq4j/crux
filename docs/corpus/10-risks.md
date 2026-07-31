# 10. Risks

Risks the corpus creates or reveals. Impact and likelihood are judgements.
"Detection" says how you would know it had happened, because a risk with no
detection is a risk you find out about from a reader.

## R1 — Fabrication during ingestion

**Impact: severe. Likelihood: high without a control.**

Fourteen documents have to be broken into structured modules, claims, sources and
metadata. At every step there is a field with no value in the source and a plausible
value available: a publication day for a month-precision date (F4), an author for
the thirteen documents that name none (F5), a DOI for a journal article that does
not state one (F21), an access date for a URL (F22), a caption for a table (F13), a
position in a series for papers that do not state one (§7.2).

Each individually looks like tidying. Together they would produce a corpus of
research metadata that is partly invented, published under a research organisation's
name, in a platform whose entire proposition is provenance.
`.claude/rules/content-modeling.md` 24 and 25 forbid it, and the reason it is the
first risk here is that every one of these is a small, reasonable-feeling decision
made under time pressure.

**Mitigation.** Omit rather than fill (rule 25). Write the rule into the ingestion
guidance before the first document, not after. Where an absent value must be
supplied to satisfy a constraint, the supplied value must be true of the ingestion —
a verification date is a real date, and it is not the author's retrieval date, and
the difference must be recorded.

**Detection.** A reviewer comparing a published version against its source document,
field by field, for the first document ingested — and spot checks thereafter.
Automated detection is not available: an invented DOI is well-formed.

## R2 — The evidence standard becomes decorative

**Impact: severe. Likelihood: moderate.**

Every corpus document fails `methodology_present`, `limitations_present` and, under
`mandatory`, `evidence_standard_met` (§6.2, §6.3). The path of least resistance is
to file white papers as `article`, which requires none of them, or to change the
seeded content-type configuration so that `white_paper` requires less.

Either move makes the gates ornamental. The second is worse, because it is invisible:
the gate still exists, still passes, and no longer means anything.

**Mitigation.** Publish the first document as a `white_paper` with the gates
satisfied honestly (§2.5). It is slower and it is the only way to know the gates
work. `.claude/rules/testing.md` 7 already forbids weakening a control to make a
test pass; this is the same principle applied to content.

**Detection.** A count of published items by content type against their evidence
standard. A platform whose entire corpus is `article` has answered this question by
accident.

## R3 — A distribution marking is mistaken for an access control

**Impact: high. Likelihood: moderate.**

Thirteen of fourteen documents carry a marking, eight of them
`UNCLASSIFIED // FOR OFFICIAL USE ONLY` (F3). Rendered on a public page, and
especially rendered next to a search result, that string invites a reader to believe
the platform is enforcing something. It is not: these are documents the author
intends to publish, and nothing in the corpus indicates the marking restricts
readership on this platform.

Two failure modes. A reader assumes content is being withheld from them. Or someone
implements the assumption — wiring the marking to RLS — and invents an access policy
the client never stated.

**Mitigation.** Decide it explicitly (B05), record the decision, and render the
marking as the author's label with surrounding copy that does not imply an
entitlement check (R8, D2). If the client *does* want marking-driven access control,
that is a real feature with real denial tests, not a rendering detail.

**Detection.** Review of the rendered surface, and of any RLS policy that references
a marking.

## R4 — Separation of duties discovered at the moment of publication

**Impact: high. Likelihood: high if not raised now.**

The corpus names one individual (F5). A single-account organisation cannot satisfy
`separation_of_duties` (§6.4). If this is discovered when the first document is ready
to publish, the pressure to disable the trigger "just for the first one" will be
considerable.

**Mitigation.** Raise it with the client now, as B03. Provision the second account
before V03 rather than after V06.

**Detection.** It detects itself, loudly and at the worst moment. That is the risk.

## R5 — The real cost is claim authoring, and it is not an engineering cost

**Impact: high. Likelihood: high.**

Over 300 source entries corpus-wide (F19), an estimated 40–80 claims per document
(§6.3). Full ingestion is a multi-week editorial programme. A plan that budgets for
"import the corpus" as an engineering task will be wrong by an order of magnitude,
and the gap will be closed by cutting evidence linkage — which is R2 arriving by a
different route.

**Mitigation.** Ingest one document (V03–V07), measure it (V08), and re-plan from the
measurement. The seven documents with annotated `Principal Sources` blocks (F18) are
substantially cheaper than the other seven; that difference should shape the order.

**Detection.** V08. If it is skipped, the estimates in
[document 09](09-product-backlog.md) stay unvalidated indefinitely.

## R6 — Corpus text committed to the repository

**Impact: high. Likelihood: moderate.**

Search and chunking tests want real text. The obvious place to put it is
`tests/fixtures/`. That publishes fourteen marked client research documents through
the repository, and one of them contains a real email address (F5), which
`.claude/rules/testing.md` 14 forbids in test data.

**Mitigation.** B01, decided before any test in §8.5 or §8.6 is written. Structural
fixtures by default; full text only for one agreed document.

**Detection.** The existing secret scanner does not look for this. A review of what
lands in `tests/fixtures/`, and a check for the known email address, would.

## R7 — Search fails silently on the vocabulary the corpus actually uses

**Impact: moderate. Likelihood: high without R1/R3 of document 04.**

A reader searching *counter-unmanned aircraft system* gets nothing, because the
corpus says `C-UAS` (§1.5). A reader searching `GAO-23-105868` gets nothing, because
source identifiers are not indexed (F20, R3). Neither failure produces an error;
both produce an empty result page that looks like an absence of content.

**Mitigation.** Q01 and Q03. Q05's ranking baseline turns silent failure into a
build failure.

**Detection.** The zero-result log (R6 of document 04), read as an editorial signal
rather than ignored.

## R8 — Table accessibility is deferred and then inherited

**Impact: moderate. Likelihood: moderate.**

Twenty-five tables, up to six columns, several of which carry the document's
conclusion (F12), none with a caption (F13). Doing this properly — caption, scope,
labelled keyboard-reachable scroll region, reflow at 320 CSS pixels, no colour-only
priority — is a week of work (P04). Doing it badly is an afternoon, and the result
passes an automated check while being unusable with a screen reader.

`.claude/rules/accessibility.md` 3 makes conformance a completion requirement of the
block that introduces the surface. A table component shipped without it becomes
everyone's inherited debt.

**Mitigation.** P04 sized honestly, and A11Y-07/08 as manual verification with the
assistive technology recorded. Automated checks are necessary and not sufficient
(accessibility rule 30).

**Detection.** Manual screen-reader verification. Nothing else finds it.

## R9 — Month-precision dates fabricate a day

**Impact: moderate. Likelihood: high without S3.**

`published_at` is a `timestamptz`. Every corpus document states a month (F4).
Rendering "1 April 2026", or emitting it in a citation export, invents a fact — and
citation exports are the artefact most likely to be quoted elsewhere, where the
invented day acquires a life of its own.

**Mitigation.** C04. Until then, render the month explicitly from the known
precision rather than formatting the timestamp.

**Detection.** SRC-09 and ING-02.

## R10 — A misclassified quantitative claim corrupts the evidence model invisibly

**Impact: high. Likelihood: moderate.**

If cited figures are recorded as `quantitative_finding` rather than `observed_fact`
(T1, §6.5), the publication gate refuses them, and the pressure is then to invent an
analysis run — which is R1 in its most damaging form, because a fabricated analysis
run is a fabricated provenance chain.

The reverse error is quieter: if a figure Crucible Insight genuinely computed is
recorded as `observed_fact`, the traceability gate never fires and a derived number
is published as though it were a citation.

**Mitigation.** B02, decided and written down before any claim is authored. Both
directions of the error stated in the guidance, not just the first.

**Detection.** For the first direction, the gate itself. For the second, nothing
automatic — it needs a reviewer who knows which numbers Crucible Insight produced.

## R11 — An importer built against assumptions

**Impact: moderate. Likelihood: moderate.**

Eleven near-identically structured `.docx` files make an importer look obviously
worth building. But the structure is not uniform — two front-matter dialects (F2),
three heading-numbering conventions (F9), one document with no headings at all
(F10), seventeen callouts encoded as tables that map to three different modules
(F11, §5.3). An importer built before anyone has ingested a document by hand will
encode a wrong model of the corpus and will then have to be rewritten.

**Mitigation.** N05 is last in the backlog and explicitly gated on N01 being under
way. Fourteen documents can be ingested by hand.

**Detection.** Fixture-level: if the importer's output for two documents needs
substantially different manual correction, the model is wrong.

## R12 — The seeded taxonomy is silently stretched to fit

**Impact: moderate. Likelihood: moderate.**

Three subjects — advertising, transportation safety, merchant shipping — have no
industry term (§3.1). Under time pressure, ADTech gets filed under `technology` and
Traffic Records under `government-public`, and the taxonomy quietly stops describing
the corpus. Term creation is a governed operation
(`content-modeling.md` 14), so the wrong assignments are easier than the right terms.

**Mitigation.** B06 before ingestion, so the terms exist when they are needed.

**Detection.** A distribution of content items across terms. A term carrying
everything is a term carrying nothing.

## R13 — Two mechanisms for series

**Impact: low. Likelihood: low, now that it is written down.**

A series could be a `collection` content item or a taxonomy term. Both are
plausible; [document 03](03-taxonomy-recommendations.md) §3.3 and
[document 07](07-relationship-graph.md) §3 recommend the collection. Implementing
both would give two answers to "what is in this series" and let them disagree.

**Mitigation.** Recorded here so the decision is visible. If the client prefers the
term, that is fine — but not both.

## R14 — The corpus's coverage gaps are mistaken for coverage

**Impact: moderate. Likelihood: moderate.**

Fourteen real documents feel like thorough validation. They exercise no scheduling,
no withdrawal, no review iteration, no charts, no gated downloads, no second locale,
no inter-document citation (§8.11). A test suite built only from the corpus would be
green and would have tested none of those.

**Mitigation.** §8.11 exists, N04 provisions synthetic fixtures, and META-04 puts
the gaps in `docs/known-limitations.md`. `.claude/rules/testing.md` 18 requires
recording known coverage gaps rather than implying full coverage.

**Detection.** The gap list, if it is maintained. If it is not, nothing.

## Summary

| ID | Risk | Impact | Likelihood | Primary mitigation |
|---|---|---|---|---|
| R1 | Fabrication during ingestion | Severe | High | Omit rather than fill; first-document review |
| R2 | Evidence standard becomes decorative | Severe | Moderate | Publish document one as a real `white_paper` |
| R3 | Marking mistaken for access control | High | Moderate | B05, and copy that does not imply enforcement |
| R4 | Separation of duties found at publication | High | High | B03 now |
| R5 | Claim authoring under-budgeted | High | High | Measure with V08, re-plan |
| R6 | Corpus text committed | High | Moderate | B01 before §8.5 tests |
| R7 | Search fails silently on acronyms and identifiers | Moderate | High | Q01, Q03, Q05 |
| R8 | Table accessibility deferred | Moderate | Moderate | P04 sized honestly; manual verification |
| R9 | Fabricated publication day | Moderate | High | C04 |
| R10 | Misclassified quantitative claims | High | Moderate | B02, both error directions documented |
| R11 | Importer built against assumptions | Moderate | Moderate | N05 last |
| R12 | Taxonomy stretched to fit | Moderate | Moderate | B06 before ingestion |
| R13 | Two series mechanisms | Low | Low | Decision recorded |
| R14 | Coverage gaps read as coverage | Moderate | Moderate | §8.11, N04, known-limitations |

Four risks — R1, R2, R4, R10 — share a shape: a correct control meets real content
that does not satisfy it, and the cheapest resolution is to weaken the control or
invent the content. That is the thing to watch for over the next several weeks.
