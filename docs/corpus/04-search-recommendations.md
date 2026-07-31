# 4. Search recommendations

`search.documents` already does the structurally hard part correctly: a weighted
`tsvector` generated as a stored column, so it cannot go stale, with title at
weight A, summary and key findings at B, headings, taxonomy and authors at C, and
body and claim text at D. `search.chunks` cuts at module boundaries and keeps the
`fragment_id`, so a semantic hit deep-links to a section. Neither needs
redesigning for this corpus.

What follows is what *this* corpus will do to that machinery.

## 4.1 The corpus's retrieval profile

- **Fourteen documents of 5,570–9,901 words.** Small corpus, long documents. Lexical
  ranking across fourteen items is nearly meaningless — almost everything matches
  something. Ranking quality will be dominated by *which section* is returned, not
  which document, which puts the weight on chunk-level semantic retrieval and on
  fragment deep-links rather than on `ts_rank`.
- **Heavy vocabulary overlap inside clusters.** Six C-UAS papers share their
  terminology almost completely. A query for "counter-UAS sensors" must
  discriminate between six documents that all discuss counter-UAS sensors.
  Discrimination will have to come from taxonomy terms, pillar and section
  structure, not from term frequency.
- **Section titles are unusually informative.** *"Gap 1: No System TADSS for Fielded
  C-UAS Equipment"*, *"Layer Three: The Fusion Engine (Operational Level)"*,
  *"4.2 The Metal Powder Supply Chain and Critical Material Dependencies"*. Headings
  sit at weight C. For this corpus they are closer in value to the summary than to
  the body.
- **One document has no heading structure at all** (F10, Traffic Records), so its
  `headings_text` will be empty unless the hierarchy is reconstructed at ingestion.

## 4.2 Findings and recommendations

### R1 — Acronym and expansion do not match each other, and the corpus depends on it

**Evidence:** §1.5. `C-UAS` appears hundreds of times; *counter-unmanned aircraft
system* appears a handful. `TADSS` is used throughout a paper whose title expands it
once. `SIVT`, `MFA`, `IPB`, `COP`, `DOTMLPF-P` behave the same way.

English stemming will not relate `C-UAS` to *counter-UAS* to *counter-unmanned
aircraft systems*. A reader who searches the expansion will get nothing; a reader
who searches the acronym will get everything.

**Recommendation:** expand the query through `taxonomy.synonyms` (document 03 T8)
before it reaches `to_tsquery`, rather than adding a PostgreSQL synonym dictionary
to the `search.crux_english` configuration.

Both work. Query-time expansion is the right one here because the synonym set is
editorial data that changes with the taxonomy, and a text-search-dictionary file is
a deployment artefact that changes with a migration. A synonym added by an editor
should take effect without a database migration.

The cost is that expansion must be applied consistently to lexical and semantic
retrieval, and must be visible in the query explanation shown to the user
("also searched: counter-UAS, CUAS").

### R2 — Hyphenated tokens fragment, and one fragment is noise

**Evidence:** `C-UAS`, `C-UxS`, `DOTMLPF-P`, `left-of-launch`, `made-for-advertising`,
`pre-bid`, `Bab al-Mandab`, `ATP 2-01.3`.

The default parser emits, for `C-UAS`, both the compound and its parts. The part
`c` is a single character that will match nothing useful and cost index space; the
part `uas` is genuinely useful. `DOTMLPF-P` produces `dotmlpf` and `p`.

**Recommendation:** do not change the parser. Add a test
([document 08](08-acceptance-tests.md) SRCH-02) that asserts a search for `C-UAS`
returns the six C-UAS documents and a search for `UAS` returns those plus IPB and
AM Tactical, and record the actual behaviour rather than the assumed behaviour. The
parser's handling of these tokens is a fact to measure, not to predict.

### R3 — Source identifiers are searchable text, and there is nowhere to put them

**Evidence:** F19, F20. Over 300 source entries corpus-wide, using 35 distinct
identifier forms. `GAO-25-107283` appears in C-UAS Acquisition's front matter and
nowhere the index can see it.

A defence analyst who has a GAO report number and wants to know which Crucible
Insight papers cite it is a realistic and valuable query. Today it returns nothing:
`search.documents` has columns for title, summary, key findings, headings, taxonomy,
authors, body and claims — and none for the version's sources.

**Recommendation:** add a `sources_text` column at weight **C**, flattened by the
index worker from the version's resolved `knowledge.sources` rows — title,
publisher, identifier value and authority.

```sql
-- PROPOSAL — NOT APPLIED
ALTER TABLE search.documents ADD COLUMN sources_text text NOT NULL DEFAULT '';
-- and add to the generated search_vector:
--   || setweight(to_tsvector('search.crux_english', coalesce(sources_text, '')), 'C')
```

Weight C, alongside taxonomy: a paper that *cites* GAO-25-107283 should be findable
by it, but should not outrank a paper whose title or summary is about the subject.

Changing the generated column means rebuilding the index, which is a real
operational cost and belongs in the sequencing
([document 11](11-implementation-sequence.md)).

Identifier tokens also need R2's treatment: `GAO-25-107283` and `DOT HS 813 486`
tokenise unpredictably, and `2-01.3` even more so.

### R4 — Chunking will mostly produce one chunk per section, which is right

**Evidence:** documents run 5,570–9,901 words across 20–39 headings, so sections
average 200–350 words — roughly 270–470 tokens. The `chunks_token_count_bounded`
constraint caps a chunk at 1024 tokens.

Most sections fit in one chunk. The exceptions are the long callout boxes (F11) —
`THE SIX IPB GAPS THE UAS ERA CREATES` is a single cell of roughly 300 words — and
the largest recommendation tables (11 rows × 5 columns).

**Recommendation:** chunk at module boundaries as designed, and do not chunk *inside*
a table module. A table split across two chunks loses its header row from the second
half, which makes the second chunk both meaningless to a reader and misleading to an
embedding. Where a table exceeds the token bound, chunk it row-group-wise with the
header row repeated, and record that the header was repeated.

### R5 — Ranking cannot be evaluated without a baseline, and this corpus supplies one

`.claude/rules/testing.md` 19 makes a ranking regression below a recorded threshold
a build failure. There is no recorded threshold, because there has been no corpus.

**Recommendation:** adopt the following as the initial evaluation set. Each query is
one a real reader of this corpus would type; the expected winner is the document
whose *subject* it is, judged from the document's own scope statement. This is a
judgement, not a measurement, and it should be reviewed by whoever owns editorial
before it becomes a gate.

| # | Query | Expected first result | Also relevant |
|---|---|---|---|
| 1 | `feedstock storage humidity` | AM Tactical §2.1 | AM White Paper §III.A |
| 2 | `directed energy production capacity` | C-UAS Acquisition §4.2 | — |
| 3 | `GAO-23-105868` | C-UAS Acquisition | — |
| 4 | `IPB four steps drone` | IPB | — |
| 5 | `C-UAS simulator training gap` | TADSS | IPB §6 |
| 6 | `common operating picture sensor fusion` | Sensor Fusion | — |
| 7 | `Houthi merchant vessel attacks` | C-UxS Maritime §3.1 | — |
| 8 | `GPS spoofing shipping` | C-UxS Maritime §2.4 | — |
| 9 | `VUCA Prime commander's intent` | VUCA §3.1 | — |
| 10 | `non-kinetic effects authorities Title 10` | Integrated Effects §V.B | — |
| 11 | `made-for-advertising share of impressions` | ADTech001 | ADTech002 |
| 12 | `walled garden measurement restrictions` | ADTech003 | ADTech001 |
| 13 | `gradient boosted trees pre-bid latency` | ADTech002 §II | — |
| 14 | `state crash data integration` | Traffic Records | — |
| 15 | `MMUCC` | Traffic Records §I | — |
| 16 | `3D printed target drones training` | C-UAS Generative §2.2 | TADSS §2.2 |
| 17 | `counter-unmanned aircraft system` | any C-UAS paper | tests R1 |
| 18 | `additive manufacturing` | either AM paper | tests near-duplicate handling |

Queries 17 and 18 are the diagnostic pair. 17 fails today unless R1 is implemented.
18 has two legitimate winners (§1.4) and exists to check that the result set
presents both rather than burying one.

**Recommendation:** record the measured position of each expected result as the
baseline, and set the regression threshold from the measured values rather than from
an aspiration. `.claude/rules/testing.md` 20 forbids lowering a threshold later, so
the first number must be honest rather than flattering.

### R6 — Zero-result queries are a corpus-coverage signal, not just a search defect

`search.zero_result_queries` exists. With fourteen documents, most of the subject
space returns nothing — a reader searching *electronic warfare* or *directed energy*
will find those subjects discussed inside papers about other things.

**Recommendation:** treat the zero-result log as editorial input as well as
engineering input, and say so in the operations documentation. A repeated zero-result
query is at least as likely to be a gap in the corpus as a gap in the index.

### R7 — Near-duplicate documents must both surface

**Evidence:** §1.4. The two AM feedstock papers share a subject, a month and most of
their source set.

**Recommendation:** do not deduplicate at the result level. They are different
documents with different scope, one tactical and one policy-formal, and a reader
choosing between them needs to see both with enough context to choose. This is a
presentation requirement — the result snippet must carry the subtitle (S1), because
the titles alone (*Managing Feedstocks for Additive Manufacturing in a Tactical
Environment* vs *Sustaining the Digital Thread*) do not tell a reader which one they
want.

### R8 — Permission-aware search, and what the markings do not mean

`search.documents` holds published versions; drafts must never appear. That is the
denial test, and it is unaffected by this corpus.

What this corpus adds is a hazard rather than a requirement. Thirteen of fourteen
documents carry a classification or distribution marking (F3). A result list that
shows `UNCLASSIFIED // FOR OFFICIAL USE ONLY` next to a title invites the inference
that search is filtering on it — that an unmarked account is seeing a filtered set.

**Recommendation:** the marking renders on the document, and search results carry it
only if the surrounding copy makes clear it is the author's label rather than an
access decision. Whatever is chosen, the platform must not imply an entitlement
check it does not perform. See [document 10](10-risks.md) R3.

## 4.3 Summary

| ID | Recommendation | Kind | Demonstrated by |
|---|---|---|---|
| R1 | Query-time synonym expansion via `taxonomy.synonyms` | application | §1.5, acronym dominance |
| R2 | Measure hyphenated-token behaviour; add a test | test | 8 compound forms |
| R3 | `search.documents.sources_text` at weight C | schema | F19, F20 |
| R4 | Never split a table module across chunks | indexer | 25 tables, up to 11 rows |
| R5 | 18-query ranking baseline, threshold set from measurement | test | whole corpus |
| R6 | Zero-result log is an editorial signal | docs | 14-document corpus |
| R7 | No result-level dedup; snippets must carry the subtitle | UI | §1.4, the AM pair |
| R8 | Markings must not imply an access decision | UI/copy | F3 |

R3 is the only schema change, and it is additive.
