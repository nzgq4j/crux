# Content Corpus Initialization

A validation corpus of fourteen Crucible Insight research documents was supplied on
31 July 2026. This directory holds the analysis of that corpus and the eleven
deliverables derived from it.

**Nothing here has been imported into any database, and no schema change has been
applied.** Every schema, taxonomy, search and workflow item in these documents is a
*recommendation*, justified by named documents. The database-infrastructure freeze
recorded in the Block 07 completion notes remains in force.

## The documents

| # | Document | Purpose |
|---|---|---|
| 01 | [Corpus analysis](01-corpus-analysis.md) | What the fourteen documents actually contain, and how that was established |
| 02 | [Schema validation](02-schema-validation.md) | Where the content model fits the corpus, where it strains, and what is missing |
| 03 | [Taxonomy recommendations](03-taxonomy-recommendations.md) | Vocabularies and terms the corpus demonstrates a need for |
| 04 | [Search recommendations](04-search-recommendations.md) | Retrieval behaviour this corpus will require, and a ranking baseline |
| 05 | [Rendering recommendations](05-rendering-recommendations.md) | What the public surface must render, including accessibility obligations |
| 06 | [Workflow validation](06-workflow-validation.md) | The editorial state machine walked against real documents |
| 07 | [Relationship graph](07-relationship-graph.md) | Series, companion and correction relationships the documents state |
| 08 | [Acceptance test catalogue](08-acceptance-tests.md) | Corpus-derived tests, including the denial tests |
| 09 | [Product backlog](09-product-backlog.md) | Prioritised work, each item tied to a finding and a test |
| 10 | [Risks](10-risks.md) | What could go wrong, and what would contain it |
| 11 | [Implementation sequence](11-implementation-sequence.md) | The order to do it in, against the current freeze |

## How to read the citations

Findings in document 01 are numbered `F1`…`F26`. Every recommendation in documents
02–11 cites the finding it rests on and the document that supplies the evidence.
A recommendation with no `F` reference is an inference, and says so.

## What this analysis did not do

- **No document was imported.** The corpus was read from the upload directory, never
  written to PostgreSQL.
- **No schema was altered.** Proposed DDL appears in fenced blocks marked
  *proposal — not applied*.
- **Nothing was inferred that is not present.** Where a document is silent — an
  author name, an access date, a publication day — that is recorded as absent, not
  filled in. Rule 25 of `.claude/rules/content-modeling.md` forbids the alternative.
- **The three PDFs were read from their content streams only.** Table structure in a
  PDF is a layout artefact, so table counts in document 01 cover the eleven `.docx`
  files and explicitly exclude the PDFs.

## Provenance of the analysis

Extraction used two purpose-written scripts (OOXML via `zipfile` and
`xml.etree`; PDF via content-stream text operators), with no third-party parsing
library, so that every reported field is traceable to a byte in the package rather
than to a library's interpretation of it. The extraction scripts and their output
live in the session scratchpad and are not committed: they contain the full text of
client research. See document 01 §1 for the method and the file hashes.

---

Owner: platform engineering. Last verified against the corpus: 31 July 2026.
