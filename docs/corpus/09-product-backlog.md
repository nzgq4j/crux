# 9. Product backlog

Work the corpus demonstrates a need for. Ordered by priority within each band, each
item tied to the finding that justifies it and the tests that would prove it.

Sizes are relative: **S** under a day, **M** one to three days, **L** a week or
more, **XL** a multi-week programme. They are judgements, and the first item
completed in each band should be used to correct them.

`Blocked by` names the thing that must happen first. `Freeze` marks items that
require lifting the database-infrastructure freeze — see
[document 11](11-implementation-sequence.md).

## Band 0 — Decisions, not engineering

These block work and cost nothing but a conversation. Every one of them, made wrongly
or made late, is more expensive than making it now.

| ID | Item | Size | Evidence | Notes |
|---|---|---|---|---|
| B01 | **Decide the corpus fixture policy** — what, if anything, from the corpus may live in the repository | S | §8.0 | Blocks SRCH-01…10, most of §8.6. Client decision |
| B02 | **Decide `observed_fact` vs `quantitative_finding` for cited figures**, and write it into editorial guidance | S | F24, T1, §6.5 | Blocks all claim authoring. Invisible if wrong; permanent |
| B03 | **Provision a second editorial account** so separation of duties can be satisfied | S | F5, §6.4 | Blocks every publication. Client action |
| B04 | **Choose the first document to publish end-to-end** | S | §6.11 | See [document 11](11-implementation-sequence.md) §3 |
| B05 | **Decide whether distribution markings are ever an access-control input** | S | F3, S2, R8 | Current recommendation: no. Needs the client to confirm |
| B06 | **Confirm the taxonomy term set** before any term is created | M | [document 03](03-taxonomy-recommendations.md) | Term creation is a governed operation |
| B07 | **Establish the access-date policy for cited URLs** | S | F22, T2 | Verification date vs omit-the-URL. Never a guessed date |

## Band 1 — The first vertical slice

Publishing one real document through the real workflow. Nothing in Band 2 or 3 is
worth doing before this exists.

| ID | Item | Size | Evidence | Tests | Blocked by |
|---|---|---|---|---|---|
| V01 | Authentication completed: registration, email verification, password recovery, session invalidation on password change, rate limiting | L | Block 06 remainder | existing auth suite | — |
| V02 | Minimal administrative surface: sign in, list content, open a version | M | Block 09 thinnest slice | WF-09, WF-10 | V01 |
| V03 | Ingest one document by hand through the editor — no importer | L | whole corpus | ING-01…10 | B01–B04, V02 |
| V04 | Map methodology and author limitations for that document | M | F15, §6.2 | WF-01, WF-02 | B04 |
| V05 | Create that document's sources and link its claims | L | F18, F19, §6.3 | SRC-01…07, WF-05 | B02, B07 |
| V06 | Walk it through review, approval and publication with two accounts | M | §6.1 | WF-03, WF-04, WF-11, WF-12 | B03, V03–V05 |
| V07 | Public rendering: title block, body, marking, sources, contents | L | D1–D13 | REN-01…04, A11Y-01…09 | V06 |
| V08 | Record the real numbers — hours per document, claims per document — and correct the estimates in this backlog | S | §6.3 | — | V07 |

## Band 2 — Schema and catalogue changes the corpus demonstrates

All eight are from [document 02](02-schema-validation.md) §2.6. Ordered by how
early the absence hurts. `Freeze` on every DDL item.

| ID | Item | Size | Evidence | Tests | Note |
|---|---|---|---|---|---|
| C01 | `callout.label` in the module catalogue (S7) | S | F11 — 17 boxes | ING-04 | Catalogue row, no DDL |
| C02 | `references` module payload schema (S8) | M | F17, F18 | SRC-06, D7 | Catalogue row, no DDL |
| C03 | `content_versions.subtitle` (S1) | S | F1 — 14 of 14 | ING-01, SRCH-08 | Freeze |
| C04 | `stated_date` + `stated_date_precision` (S3) | S | F4 — 14 of 14 | ING-02, SRC-09 | Freeze |
| C05 | Numeric claim requires a unit (S6) | S | F24 | STR-06 | Freeze |
| C06 | `cms.distribution_markings` + FK (S2) | M | F3 — 13 of 14 | ING-03, A11Y-05 | Freeze; depends on B05 |
| C07 | Organisational contributor, person XOR organisation (S4) | M | F5 — 13 of 14 | ING-09, ING-10 | Freeze; relaxes a NOT NULL behind a check |
| C08 | Report-number identifier schemes + `identifier_authority` (S5) | M | F20 — 35 forms | SRC-01, SRC-02 | Freeze; dedup index changes with it |

C03, C04 and C05 are one-line additive changes and should ship as a single
migration. C06, C07 and C08 each carry a data-model consequence and should not.

## Band 3 — Taxonomy

| ID | Item | Size | Evidence | Tests | Blocked by |
|---|---|---|---|---|---|
| X01 | Three industry terms (T1) | S | ADTech, Traffic Records, C-UxS | TAX-01 | B06 |
| X02 | Five capability terms (T3) | S | named documents per term | TAX-01 | B06 |
| X03 | Six audience-role terms (T4) | S | corpus recommendation tables | — | B06 |
| X04 | `pillar` vocabulary, six terms (T6) | S | F7 | TAX-01, REN-01 | B06 |
| X05 | Topic hierarchy, 7 broader + 22 narrower (T5) | M | corpus section structure | TAX-01 | B06 |
| X06 | `region` vocabulary, seven terms, with the subject-vs-evidence rule (T7) | M | C-UxS §3, VUCA, Integrated Effects §VII | — | B06 |
| X07 | Acronym synonym set (T8) | M | §1.5 | TAX-03, SRCH-01 | B06 |
| X08 | Orphan-term report surfaced to editorial (T2) | S | F/§3.1 | TAX-04 | — |

## Band 4 — Search

| ID | Item | Size | Evidence | Tests | Blocked by |
|---|---|---|---|---|---|
| Q01 | Query-time synonym expansion via `taxonomy.synonyms` (R1) | M | §1.5 | SRCH-01 | X07 |
| Q02 | Measure and record hyphenated-token behaviour (R2) | S | 8 compound forms | SRCH-02 | B01 |
| Q03 | `search.documents.sources_text` at weight C (R3) | M | F19, F20 | SRCH-03 | Freeze; needs an index rebuild |
| Q04 | Never split a table module across chunks (R4) | M | 25 tables | SRCH-07 | — |
| Q05 | Record the 18-query ranking baseline and set the threshold from measurement (R5) | M | R5 | SRCH-05 | B01, several documents ingested |
| Q06 | Zero-result log surfaced as an editorial signal (R6) | S | 14-document corpus | — | — |
| Q07 | Result snippets carry the subtitle; no result-level dedup (R7) | S | §1.4 | SRCH-08 | C03 |

## Band 5 — Rendering and accessibility

| ID | Item | Size | Evidence | Tests |
|---|---|---|---|---|
| P01 | Title block: composed banner, subtitle in `h1`, precision date, honest attribution (D1, D3, D4) | M | F1, F4, F5, F6, F7 | ING-01, REN-01 |
| P02 | Marking rendering, including print CSS and the footer (D2) | S | F3 | ING-03, A11Y-05 |
| P03 | Callout, quote and key-findings rendering as distinct elements (D5) | M | F11 | ING-04, A11Y-01 |
| P04 | Table rendering: scope, caption, labelled keyboard-reachable scroll, no linearisation, no colour-only priority (D6) | L | F12, F13 | A11Y-02, A11Y-03, A11Y-04 |
| P05 | Source blocks as lists resolving to `knowledge.sources` (D7) | M | F17, F18 | SRC-06 |
| P06 | Ordered-list executive summaries (D8) | S | F8 | ING-06 |
| P07 | Warning on a long version with no heading module (D9) | S | F10 | ING-08 |
| P08 | Print-furniture stripping at ingestion (D10) | S | §5.8 | ING-05 |
| P09 | Generated contents list (D11) | M | AM White Paper | REN-02 |
| P10 | Public revision notice (D12) | S | F26 | REN-03 |
| P11 | Section anchors from `fragment_id` (§5.12) | S | whole corpus | SRC-10, SRCH-06 |

## Band 6 — Ingestion at scale

Only after V08 has replaced the estimates with measurements.

| ID | Item | Size | Evidence | Note |
|---|---|---|---|---|
| N01 | Ingest the remaining thirteen documents | XL | whole corpus | Editorial programme, not engineering. §6.3 |
| N02 | Six collections with membership and positions | M | §7.6 | Includes the declared-total problem, REL-02 |
| N03 | `relates_to` for the AM pair, flagged as judgement | S | §7.3 | REL-03 |
| N04 | Synthetic fixtures for the states the corpus cannot test | M | §8.11 | Scheduling, withdrawal, review iteration, routine supersession |
| N05 | An assisted `.docx` structural importer | L | 11 `.docx` | **Do not build before N01 is under way.** Building an importer against assumptions rather than against the manual work is how importers get built twice |

## Sequencing constraints

- **Band 0 before everything.** Seven decisions, none of them engineering.
- **Band 1 before Bands 2–6.** The standing instruction is to resist re-hardening
  until a vertical slice exists, and this backlog does not contradict it: V03–V07 can
  be done without any Band 2 item, accepting that the subtitle lands in `standfirst`
  and the marking lands in prose for the first document. That is a known, recorded,
  temporary compromise, and it is cheaper than lifting the freeze first.
- **C01 and C02 are catalogue rows** and can ship inside Band 1 without touching the
  freeze.
- **Q03 rebuilds the search index** and should be batched with any other change to
  the generated `search_vector`.
- **N05 last, and possibly never.** Fourteen documents can be ingested by hand. An
  importer is worth building when there are fifty.

## What is deliberately absent

- No item to relax `methodology_present`, `limitations_present`,
  `separation_of_duties`, `evidence_standard_met` or
  `quantitative_traceability`. Each blocks the corpus, and each is correct
  ([document 06](06-workflow-validation.md)).
- No item to weaken `sources_url_requires_access_date` (T2) or the table caption
  requirement (T3).
- No bulk-import path that bypasses the editor. There is no such path, and adding one
  would be a second, unreviewed write path into published content.
