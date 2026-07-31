# 12. Lessons from the first publication

*Sensor Fusion and the Common Operating Picture* was ingested and published through
the real editorial workflow on 31 July 2026. This records what actually happened,
including the parts that were wrong, and replaces the estimates in
[document 09](09-product-backlog.md) with measurements where measurements now exist.

## 12.1 What was published

| | |
|---|---|
| Content type | `white_paper` — evidence standard `mandatory` |
| Modules | 88: 57 prose, 27 heading, 2 table, 1 key_findings, 1 callout |
| Sources | 25, from the paper's own `Principal Sources` block |
| Claims | 12, with 17 claim-to-source links |
| Public version id | `v-…` assigned by the platform; item `crux-…` |
| Rendered page | 210 KB of server-side HTML: one `h1`, 18 `h2`, 21 `h3`, 2 tables each with a caption |
| Workflow path | `draft → in_review → approved → published`, four distinct actors |
| Controls exercised | 6 of 6 refused what they should refuse |

Both temporary compromises were applied as planned: the subtitle occupies
`standfirst`, and the distribution marking is a labelled `callout` module at
position 0. Both render.

## 12.2 The corpus analysis was wrong about how many people this needs

[Document 06](06-workflow-validation.md) §6.4 said "author, reviewer and approver may
be two people". **That is wrong. It needs four.**

Three separations are enforced, not one:

1. `private.is_version_author` — an author may not approve their own version.
2. **The reviewer of record may not also approve.** `workflow.record_approval`
   refuses with *"the reviewer of record may not also approve"*. Reviewing and
   approving are different people, not merely different acts.
3. `content.approve` and `content.publish` are held by different roles
   (`managing_editor` and `publisher`), and `db-verify.sh` asserts no role holds
   both. Approving and publishing are different people again.

So publishing one white paper requires **four accounts**: author, reviewer, managing
editor, publisher. For a research organisation whose corpus names one individual
(F5), that is the single most consequential operational finding of this exercise, and
it is a far bigger ask than the analysis implied. It should go to the client now, not
at the next publication.

The controls are right. The estimate was wrong.

## 12.3 The publisher must be assigned to the version

The first walk failed at publication with *"actor is not assigned to version … and
lacks `content.edit_any`"*. Holding `content.publish` is not sufficient:
`workflow.perform_transition` requires the actor to be assigned to the version or to
hold `content.edit_any`.

Neither the corpus analysis nor the backlog anticipated this. Practically, either
every publisher is assigned to every version they publish — which is workflow noise —
or the publisher role carries `content.edit_any`, which is a wider grant than it
sounds. **This is a real design question and it is not resolved.** It is recorded here
rather than settled, because settling it by widening a grant during a demonstration is
exactly the wrong way to decide it.

## 12.4 Claims form an ordered graph, and the importer has to know that

Two constraints refused the first ingestion run:

- `claims_interpretation_requires_basis` — an interpretation must name the finding it
  reads.
- `claims_recommendation_requires_basis` — a recommendation must name the finding it
  rests on.

Claims are therefore not a list. They are a dependency graph, and an importer must
topologically order them so a basis exists before the claim citing it. The ingester
now does. The plan file carries a `key` on every claim and a `basis` on those that
need one.

This is a genuine modelling insight the document-level analysis missed entirely, and
it will apply to all thirteen remaining documents: **every interpretation and every
recommendation needs an identified basis claim, which means the basis claim must be
authored too.** It raises the claim count per document above the estimate.

## 12.5 A doubted source must say why

`sources_credibility_notes_when_doubted` refused the first run: a source marked
`mixed`, `contested` or `unreliable` must carry `credibility_notes`. Five of the
twenty-five sources are vendor, trade-press or consultancy publications and are marked
`mixed`; each now records why in one sentence.

The constraint is right and the cost is trivial. Worth noting because it is the kind
of field an importer would happily leave null.

## 12.6 The published page states the wrong date

The rendered article shows **31 July 2026** twice and **April 2026** not at all.

`published_at` is the platform event. The document's stated date is April 2026, month
precision. Nothing in the page tells a reader the paper is an April 2026 assessment —
and for defence research whose currency is exactly its date, that is not cosmetic.

This is risk [R9](10-risks.md) arriving in production form on the first page
published, and it is the strongest argument for S3 being in Batch A rather than later.

## 12.7 Module labels are silently dropped

The `key_findings` module was ingested with `label` =
"THE THREE FOUNDATIONAL FUNCTIONS OF C-UAS INTELLIGENCE ARCHITECTURE" and its three
items. The items render. **The label does not**, because neither the registered schema
nor the renderer knows about it.

S7 proposed adding `label` to the `callout` schema. This shows `key_findings` needs
the same, and that a payload key absent from the registered schema is accepted at
write time and lost at render time — which is worse than being refused. Both belong
in Batch B (C01), and the renderer change belongs with them.

## 12.8 A draft URL returns 200

`/research/unreleased-sector-analysis` — the seeded draft — returns **HTTP 200** with
the page shell and no content.

**Nothing leaks.** The draft's title, standfirst and body marker are all absent from
the response; RLS refuses the read and the boundary renders not-found. But the status
code is 200, because `notFound()` inside a streamed Suspense boundary cannot change
headers that have already been sent.

So this is a correctness and SEO defect, not a security one, and it should be recorded
as such rather than escalated. The fix is to resolve existence before the streaming
boundary opens.

## 12.9 The environment nearly produced a false result

Two environment problems cost real time and both are worth recording:

- The app was serving from the **deployed** Supabase over PostgREST, which returned
  `403 for published_content`, so the first render check showed an empty page for
  *every* article — including the seeded ones. Nothing was wrong with the publication.
  `NEXT_PUBLIC_*` values are inlined at build time, so testing against the local
  database needs a rebuild, not just a different runtime variable.
- `next start` sets `NODE_ENV=production`, so `CRUX_ENV` fails closed to `production`
  and `resolveDatabaseUrl` correctly refused a loopback `DATABASE_URL`. That is
  Workstream 1 working exactly as designed, and it means a local production-mode run
  needs `CRUX_ENV=development` explicitly.

Both are documentation gaps rather than defects. A "run the app against local data"
recipe belongs in `docs/local-development.md`.

## 12.10 My own verification was wrong twice

Recorded because a verification method that reports success wrongly is worse than no
verification.

**A zero-row UPDATE read as a successful tamper.** The immutability probe ran
`UPDATE … SET title` as an API role, ignored `rowCount`, and reported "immutability did
not hold". RLS had matched no row — the write was refused. Counting affected rows is
what distinguishes a refusal from a tamper, and any probe of an RLS-protected write
must do it.

**A probe ran against the wrong state.** The same probe ran even when publication had
failed, so it mutated a *draft* — which is correct behaviour — and reported it as an
immutability failure. Worse, a later run then published the mutated draft, which is how
a version briefly carried the title "Tampered". The version was discarded and the
publication redone from a clean ingest.

Both were my errors, not the platform's. The corrected probe checks state first,
counts rows, and tests as both an API role and the owner. It now reports 6 of 6
controls refusing correctly:

| Probe | Result |
|---|---|
| Author reviews own work | refused — lacks `content.review` |
| Approver publishes | refused — `approved → published` requires `content.publish` |
| Publisher updates published title (API role) | refused — RLS matched no row |
| Owner updates published title | refused — immutability trigger |
| Owner inserts a module into a published version | refused — module immutability |
| Owner deletes a published version | refused — DELETE not permitted |

During cleanup of the polluted rows I disabled the `content_versions_immutable`
trigger to delete a published test version, then re-enabled it and verified
(`tgenabled = 'O'`). That was a one-off on local test data of my own making. It must
not become a habit, and it is recorded here so that it is visible rather than
forgotten.

## 12.11 Measurements, replacing the estimates

| Quantity | Estimate in doc 09 | Actual |
|---|---|---|
| Claims per document | 40–80 | **12** authored — but see below |
| Sources per document | 18–27 | **25**, matching |
| Claim-to-source links | not estimated | **17** |
| Modules per document | not estimated | **88** |

**The claim count needs care.** Twelve claims is what was needed to satisfy
`evidence_standard_met` for this document with honest coverage of its principal
assertions. It is not full claim coverage of a 7,145-word paper: the estimate of 40–80
described exhaustive claim extraction, and what was done is the load-bearing subset —
every claim the executive summary makes, plus the interpretations and recommendations
that rest on them.

So the honest statement is: **a publishable minimum is around 12 claims and roughly
half a day per document once the pattern is known; exhaustive claim coverage remains
unmeasured** and would be several times that. Which of the two the client wants is a
decision that has not been taken, and it changes the corpus programme's size by a
factor of four or more.

The seven documents with annotated `Principal Sources` blocks (F18) were expected to
be substantially cheaper, and that held: the twenty-five source records and their
`establishes` annotations transcribed directly from the paper with no interpretation
required.

## 12.12 What changes in the plan

| Change | Where |
|---|---|
| Four editorial accounts, not two | [09](09-product-backlog.md) B03; raise with client now |
| Publisher assignment vs `content.edit_any` — unresolved design question | new, §12.3 |
| Claims are an ordered graph; basis claims must be authored | [09](09-product-backlog.md) N01 sizing |
| S3 (stated date) is the highest-value Batch A item | [11](11-implementation-sequence.md) §5 |
| `key_findings` needs a `label` too, and the renderer must read it | [09](09-product-backlog.md) C01 |
| Draft URLs return 200 — correctness defect, no leak | `docs/known-limitations.md` |
| Local-development recipe for running against local data | `docs/local-development.md` |
| Decide: publishable-minimum claims or exhaustive coverage | new, §12.11 |

Nothing in this list is a control to weaken. Three of the four surprises —
the reviewer/approver separation, the basis-claim requirement, the credibility-notes
requirement — were constraints refusing work that was not yet good enough, which is
what they are for.

## 12.13 The ingester across the rest of the corpus

Dry-run against all eleven `.docx` before ingesting any of them. It completes on every
one, and the run surfaced a defect worth recording because of how quietly it failed.

**Terminal source blocks were being swallowed.** In three documents — AM Feedstock
*Sustaining the Digital Thread*, C-UxS Maritime and Integrated Effects — the
bibliography heading is a styled `Heading1`, not a plain paragraph. The classifier
tested for headings first, so `REFERENCES`, `Bibliography` and
`REFERENCES AND SOURCE NOTES` were classified as body headings and their entries
became prose modules. The documents reported **zero** source lines and produced 134,
146 and 140 modules respectively.

Nothing errored. The output looked plausible. Only comparing the source-line counts
against F19 — 24, 27 and 21 — showed they were missing.

Reordering the check and broadening the pattern to the six spellings the corpus uses
recovers all three exactly, and drops those documents to 109, 118 and 118 modules.
Sensor Fusion is unchanged at 87, so there is no regression.

**The lesson generalises.** An importer's failures are mostly silent: it produced
modules, it exited zero, and the only signal was a number that disagreed with an
independent count made earlier. Every remaining document should be dry-run and its
counts checked against document 01 before it is ingested.

### Shape of the remaining ten

| Document | Modules | Source lines | Tables needing a caption |
|---|---:|---:|---:|
| AM Feedstock — Tactical Environment | 71 | 23 | 2 |
| AM Feedstock — Digital Thread | 109 | 24 | 2 |
| C-UAS Acquisition | 90 | 27 | 4 |
| C-UAS Generative Technologies | 97 | 25 | 2 |
| IPB in the Era of UAS | 72 | 18 | 2 |
| TADSS | 80 | 23 | 3 |
| C-UxS Maritime | 118 | 27 | 3 |
| Integrated Effects | 118 | 21 | 1 |
| Traffic Records | 92 | 28 | 1 |
| VUCA | 77 | 22 | 3 |

Traffic Records confirms F10 in the worst way: **92 modules, 90 of them prose, and not
a single heading.** Its hierarchy has to be reconstructed by a human, and it remains
the right document to attempt fourth, as a deliberate stress test.

Twenty-three table captions must be authored across the ten.
