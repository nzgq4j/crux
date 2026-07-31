# 8. Acceptance test catalogue

Tests derived from the corpus. Each states what it proves, which document supplies
the fixture, and what "pass" means. They are specifications, **not implemented
tests** — nothing here has been run.

Denied-access tests are mandatory for every authorization boundary
(`.claude/rules/testing.md` 4) and are marked **DENIAL**. A boundary tested only on
its permitted path is untested.

## 8.0 Fixture policy — decide this before writing any of them

The corpus is client research carrying distribution markings, and the repository is
a working repository. Committing 14 full documents into `tests/fixtures/` publishes
them by another route.

**Recommendation:** commit *structural* fixtures only — module skeletons, heading
trees, table shapes, source-entry forms, and excerpts short enough to be fair
quotation — and keep full texts outside the repository. Where a test needs full
text (search ranking, chunking), generate the fixture from a checked-in extract of
one document chosen with the client's agreement, and record which one and why.

This is a decision for the client, not for engineering, and it blocks writing the
tests in §8.5 and §8.6. Recorded as [document 09](09-product-backlog.md) B01.

Test data must contain no real personal data (`testing.md` 14). The corpus contains
one real personal email address, in the C-UAS Acquisition `PRODUCED BY` block (F5).
It is not reproduced anywhere in this analysis and must not appear in any fixture,
in any excerpt, or in any seeded row.

## 8.1 Ingestion fidelity

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| ING-01 | Title and subtitle are stored separately | Sensor Fusion (F1) | `title` = "Sensor Fusion and the Common Operating Picture"; `subtitle` = the 13-word remainder; `standfirst` is null or a distinct lede |
| ING-02 | The stated date renders at month precision | any (F4) | Rendered output contains "April 2026" and no day number; `stated_date_precision = 'month'` |
| ING-03 | The marking is stored verbatim and rendered unaltered | Integrated Effects (F3) | Output contains `UNCLASSIFIED // FOR OFFICIAL DISCUSSION` exactly, in the title block and the footer |
| ING-04 | The three callout kinds are distinguished | AM Tactical, C-UAS Generative, TADSS (F11) | `THE FEEDSTOCK IMPERATIVE` → `callout` with `label`; the Gen. Rainey box → `quote` with attribution; `THREE CRITICAL FINDINGS` → `key_findings` |
| ING-05 | Print furniture is discarded | ADTech001 (§5.8) | No module contains `THIS SPACE INTENTIONALLY BLANK`, a page number, or the repeated running header |
| ING-06 | Enumerated summaries become list structure | ADTech001 (F8) | Eight list items; no item begins with a literal numeral character |
| ING-07 | Fragment identifiers are stable across a reorder | any multi-section document | Reordering modules changes `position`, never `fragment_id` |
| ING-08 | A document with no heading styles is flagged, not silently flattened | Traffic Records (F10) | The editor raises a warning; the version is still saveable |
| ING-09 | Organisational attribution is recorded without inventing a person | any of the 13 (F5) | Contributor row has `organisation_id` set, `person_id` null; no `identity.people` row is created |
| ING-10 | Personal attribution is recorded where stated | C-UAS Acquisition (F5) | Contributor row has `person_id`; the other 13 documents do not gain one |

## 8.2 Structure and content model

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| STR-01 | A module payload failing its registered schema is refused | a `callout` with no `text` | Insert rejected |
| STR-02 | An unregistered module key is refused | `module_key = 'sidebar'` | FK violation |
| STR-03 | A table module without a caption is refused | any of the 25 (F13) | Rejected, and the message names the caption |
| STR-04 | A figure without alternative text is refused | Traffic Records' 2 images (§6.6) | Rejected |
| STR-05 | Derived plain text and markdown regenerate on module change | any | `plain_text` and `markdown` change; neither is authored |
| STR-06 | A numeric claim with no unit is refused | the 39,254 fatality figure (S6) | Rejected |
| STR-07 | An interval claim stores both bounds | "6 to 9 percent" (F24) | `value_lower = 6`, `value_upper = 9`, `unit = 'percent'` |
| STR-08 | Nine claim types map to five evidence classes and cannot drift | one claim of each type | `evidence_class` matches the documented mapping; direct write to it is refused |

## 8.3 Immutability

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| IMM-01 | A published version's body cannot change | any published corpus document | UPDATE to `title`, `executive_summary` or `plain_text` raises `insufficient_privilege` |
| IMM-02 | Modules of a published version cannot be inserted, updated or deleted | as above | All three refused |
| IMM-03 | Contributors of a published version cannot change | as above | Refused |
| IMM-04 | A published version cannot be deleted | as above | Refused |
| IMM-05 | A published version cannot return to draft | as above | Refused; only `superseded` and `withdrawn` permitted |
| IMM-06 **DENIAL** | Immutability holds for a privileged caller too | as above, as `service_role` | Refused. If the privileged path can rewrite published content, immutability is a convention, not a control |

## 8.4 Workflow gates

Each of these has teeth only if it fails before the fix. `.claude/rules/testing.md` 8
requires inverting the control and confirming the test fails, then restoring.

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| WF-01 | `methodology_present` refuses a `white_paper` with no methodology | any corpus document as-is (F15) | Publication refused, naming the gate |
| WF-02 | `limitations_present` refuses a `white_paper` with no limitations | as above | Refused, naming the gate |
| WF-03 **DENIAL** | `separation_of_duties` refuses self-approval | one account authoring and approving (§6.4) | Refused. Then confirm two distinct accounts succeed |
| WF-04 **DENIAL** | A rejected approval does not satisfy `approval_recorded` | an approval row with `decision = 'rejected'` | Publication refused. (This defect existed and was fixed; the regression test stays) |
| WF-05 | `evidence_standard_met` refuses a mandatory-standard type with unlinked claims | Sensor Fusion with claims but no `claim_sources` (§6.3) | Refused |
| WF-06 | `quantitative_traceability` refuses a `quantitative_finding` with no analysis run | a cited figure misclassified (§6.5) | Refused. Reclassified as `observed_fact` with a source link, it passes |
| WF-07 | An undeclared transition is refused | `draft → published` directly | Refused by the guard, not by application code |
| WF-08 | A correction whose predecessor is absent is publishable | Traffic Records (§6.8) | Publishes with `correction_reason` set and `supersedes_id` null; no placeholder version is created |
| WF-09 **DENIAL** | An account without `content.publish` cannot publish | an `author` account | Refused with a permission error, not a 404 that leaks nothing and tells nobody |
| WF-10 **DENIAL** | A draft is invisible to an anonymous reader | any ingested draft | Not returned by the public reader, the API, or search |
| WF-11 | The publication transaction is all-or-nothing | force a failure in a late step | No partial state: no search document, no state row, no published version |
| WF-12 | Publication is idempotent under retry | replay the same publication | One published version, one audit trail, no duplicate |

## 8.5 Search and retrieval

Depends on the §8.0 fixture decision.

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| SRCH-01 | Acronym and expansion both retrieve | `counter-unmanned aircraft system` vs `C-UAS` (R1) | Both return the C-UAS documents; the difference in result sets is recorded |
| SRCH-02 | Hyphenated-token behaviour is measured, not assumed | `C-UAS`, `DOTMLPF-P`, `left-of-launch` (R2) | Behaviour recorded as the baseline; the test fails when it changes |
| SRCH-03 | A source identifier retrieves the citing document | `GAO-23-105868` (R3) | C-UAS Acquisition is returned. Fails today — `sources_text` does not exist |
| SRCH-04 | Weighting holds: a title match outranks a body match | a term in one title and several bodies | Title-match document first |
| SRCH-05 | The 18-query ranking baseline holds | [document 04](04-search-recommendations.md) R5 | Measured positions recorded; a regression below the recorded threshold fails the build |
| SRCH-06 | A hit deep-links to its section | any chunk hit | Result carries the `fragment_id` and the link resolves to that section |
| SRCH-07 | A table module is never split across chunks | the 11-row TADSS roadmap (R4) | Either one chunk, or row groups each carrying the header, with the repetition recorded |
| SRCH-08 | Near-duplicates both surface | `additive manufacturing` (R7) | Both AM papers returned, each with its subtitle in the snippet |
| SRCH-09 **DENIAL** | Search returns nothing unpublished | an ingested draft | Absent for every actor who cannot read it, including via a crafted query |
| SRCH-10 **DENIAL** | Search does not leak existence | a restricted item, if any exist | A restricted and a non-existent item are indistinguishable in response and, where feasible, in timing |

## 8.6 Rendering and accessibility

Automated checks are necessary and not sufficient (`accessibility.md` 30); the
manual rows say so.

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| A11Y-01 | One `h1`, logical hierarchy, no phantom heading from a callout | Sensor Fusion (D5) | Outline is `h1` → `h2` → `h3` with no gaps; callouts are `aside` |
| A11Y-02 | A six-column table scrolls in a keyboard-reachable labelled region | AM Tactical's 6-column material table (D6) | Region is focusable, named, and shows a visible focus indicator |
| A11Y-03 | Content reflows at 320 CSS px and 400% zoom without loss of function | the same table | No horizontal page scroll; the table scrolls within its own region |
| A11Y-04 | Priority and status are not colour-only | TADSS's `Priority` column (D6) | The word is present in the accessible name |
| A11Y-05 | The marking is text, not a coloured band | Integrated Effects (D2) | Present in the accessibility tree |
| A11Y-06 | Every figure has alternative text | Traffic Records' 2 images | Present and meaningful; decorative images correctly hidden |
| A11Y-07 (manual) | Keyboard-only completion of the read path | any published document | Recorded, with the browser used |
| A11Y-08 (manual) | Screen-reader pass over a full document | Sensor Fusion | Recorded, with the assistive technology and browser combination |
| A11Y-09 | Contrast ratios measured, not asserted | the title block including the marking | Ratios recorded |
| REN-01 | The banner is composed from parts, not stored | Sensor Fusion (D1) | Changing the pillar term changes the banner |
| REN-02 | The contents list is generated | AM White Paper (D11) | Renaming a heading changes the contents list with no separate edit |
| REN-03 | The revision notice renders publicly | Traffic Records (D12) | The five-item statement appears on the public page |
| REN-04 | The article body is complete in the initial HTML | any | Full body present with JavaScript disabled (`frontend.md` 8) |

## 8.7 Taxonomy

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| TAX-01 | A closed vocabulary refuses an unregistered term | `pillar` (T6) | Rejected |
| TAX-02 | Free-text tagging is impossible where a vocabulary exists | any | No path stores an unregistered subject string |
| TAX-03 | Synonym expansion is vocabulary-scoped | `MFA` (T8) | Resolves to made-for-advertising in this corpus, and the scoping is explicit |
| TAX-04 | Orphan terms are reported, not deleted | `healthcare`, `energy-utilities` (T2) | Appear in the orphan report; still present in the database |
| TAX-05 | A term merge previews impact and leaves a redirect | a merge of two proposed topic terms | Preview lists affected items; the old term's URL redirects |
| TAX-06 **DENIAL** | Term creation is governed | an account without the permission | Refused |

## 8.8 Sources, claims and citation

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| SRC-01 | A government report number is storable with its authority | `GAO-23-105868` (S5) | `identifier_scheme = 'report_number'`, `identifier_authority = 'GAO'`. Fails today |
| SRC-02 | The same source cited by two documents deduplicates | DoDI 5000.93 (§7.3) | One `knowledge.sources` row, two claim links |
| SRC-03 | A URL without an access date is refused | Traffic Records' 27 URLs (T2) | Rejected. Do not weaken the constraint to make this pass |
| SRC-04 | Credibility assessment is recorded and rendered as text | the Wikipedia entry (F23) | `credibility` set with `credibility_notes`; rendered as words, never colour alone |
| SRC-05 | A contradicting source is recorded with a mandatory note | Traffic Records' baseline note (F26) | Stored with `relationship = 'contradicts'` or `'partially_supports'` and a note |
| SRC-06 | An annotated source entry becomes a claim link | a `Principal Sources` entry (F18) | The annotation lands in `claim_sources`, not in prose |
| SRC-07 | A quotation records its location in the source | the GAO-23-105868 passage (F25) | `quotation` and `location`/`location_type` populated |
| SRC-08 | A citation export resolves to the cited version after supersession | any superseded version | Export cites the version actually read, and it resolves |
| SRC-09 | A citation renders month precision | any (F4) | "April 2026", never a fabricated day |
| SRC-10 | A section citation addresses a fragment | Sensor Fusion §4.3 | Export includes the fragment and it resolves |

## 8.9 Relationships

| ID | Proves | Fixture | Pass |
|---|---|---|---|
| REL-01 | Series membership is ordered editorially, not by date | the ADTech trilogy (§7.2) | Order follows `position`, not `published_at` |
| REL-02 | A declared series total larger than the held set renders honestly | C-UAS series, 10 declared / 3 held (§7.2) | The page does not renumber the three as 1–3, and "Paper 9 of 10" still renders on paper 9 |
| REL-03 | An editorial-judgement relationship is distinguishable from a stated one | the AM pair (§7.3) | The distinction is recorded and visible to an editor |
| REL-04 | A slug change leaves a redirect | any | Old path 301s; no canonical URL breaks |

## 8.10 Meta

| ID | Proves | Pass |
|---|---|---|
| META-01 | A new table in an exposed schema without RLS and without a denial test fails the suite | The existing meta-test (`testing.md` 6) continues to pass, and fails when a table is added without either |
| META-02 | Every gate test has teeth | For each of WF-01…WF-06, inverting the gate locally makes the test fail; restored afterwards |
| META-03 | No fixture contains real personal data | No fixture contains the C-UAS Acquisition author's email address, or any other real address (§8.0) |
| META-04 | Coverage gaps are recorded, not implied | The gaps in §8.11 appear in `docs/known-limitations.md` |

## 8.11 What this corpus cannot test

Recorded explicitly (`.claude/rules/testing.md` 18).

- **Scheduling.** No document indicates a future publication date (§6.9).
- **Withdrawal and the public tombstone.** No withdrawn document (§6.9).
- **`changes_requested` and review iteration.** The corpus is finished work with no
  editorial history (§6.9).
- **Routine supersession.** Only a correction is present, and its predecessor is
  missing (§6.8).
- **Chart modules.** No document contains a chart; the three images are figures
  (§6.6).
- **`cites` between platform documents.** No corpus document cites another as a
  source (§7.5).
- **Entitlement-gated downloads.** No document indicates gated distribution.
- **Multiple locales.** The corpus is entirely US English.
- **Figure-heavy documents.** Three images in fourteen documents does not stress the
  alternative-text gate (§6.6).

These need synthetic fixtures, and a synthetic fixture for a workflow state is
legitimate — a review history is not research content and inventing one fabricates
nothing.
