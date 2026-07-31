# 11. Suggested implementation sequence

## 1. The constraint this sequence works within

Two standing instructions shape everything below.

**Database infrastructure is frozen** unless a release blocker emerges. That freeze
was imposed after PR #7 for a good reason: infrastructure work is easy to keep doing
and had been crowding out the thing that proves any of it works.

**The vertical slice comes first.** Authentication → administration → authoring →
review → publication → public rendering, for one article, before the workflow engine
is expanded again.

This corpus analysis produces eight schema recommendations and a long backlog. None
of them is a release blocker, so **none of them lifts the freeze**. The sequence
below is built so that the vertical slice can be completed with the schema exactly
as it stands.

## 2. Wave 0 — Decisions (days, not weeks)

Seven decisions from [document 09](09-product-backlog.md) Band 0. Six need the
client; one needs an hour of engineering judgement written down.

| Decision | Why it must come first |
|---|---|
| B03 second editorial account | Nothing publishes without it (§6.4) |
| B02 cited figures are `observed_fact` | Wrong choice is invisible and permanent (R10) |
| B04 which document goes first | §3 below |
| B01 corpus fixture policy | Blocks the search and rendering tests (R6) |
| B07 access-date policy | Blocks source creation (R1) |
| B05 markings and access control | Blocks C06, shapes rendering (R3) |
| B06 taxonomy term set | Blocks every term assignment (R12) |

B03, B02, B04 and B07 block Wave 1. B01, B05 and B06 block Wave 2 but should be
settled in the same conversation.

## 3. Which document to publish first

Six candidates were considered against four criteria: whether its citations are
already annotated (F18, which halves the claim-linkage work), whether it has a
methodology-equivalent to map (F15), how many structural features it exercises, and
how much authoring the missing limitations would require.

| Candidate | Annotated sources | Methodology mappable | Structure exercised | Verdict |
|---|---|---|---|---|
| **Sensor Fusion (Paper 9 of 10)** | Yes, 25 entries | Yes — `ASSESSMENT SCOPE` + sources statement | Series + sequence + pillar, 27 headings, 2 tables, 1 callout, marking | **Recommended** |
| C-UAS Acquisition | Yes, 27 entries | Yes | Named author (the only one), 6 tables, 2 callouts, a quotation callout | Strong second |
| TADSS | Yes, 23 entries | Yes | 3 tables, 2 callouts, series | Good |
| Traffic Records | No | No | Correction case, 27 URLs, no headings at all | Last — it is the hardest of the fourteen |
| ADTech001 | No (PDF) | No | Enumerated summary, trilogy membership | Later, with the trilogy |
| AM Tactical | Yes, 23 entries | Yes | 6-column table, 3 callouts | Good |

**Recommendation: Sensor Fusion.** It has annotated sources, a mappable methodology,
a marking, series membership *with* a declared sequence (which forces the
declared-total problem into the open early, REL-02), and a heading structure deep
enough to test fragment addressing. It has only one callout and two tables, so it
does not front-load the table accessibility work.

**Second: C-UAS Acquisition**, specifically because it is the one document with a
named author (F5) and therefore the one that proves the personal-attribution path
while Sensor Fusion proves the organisational one.

**Not first: Traffic Records.** No heading styles (F10), no annotated sources, 27
URLs with no access dates (F22), and the correction case with a missing predecessor
(§6.8). Every one of the corpus's hard problems in one document. It is the right
*fourth* document, as a deliberate stress test.

## 4. Wave 1 — The vertical slice, no schema change

Everything here runs against the current schema. Two compromises are accepted, both
temporary, both recorded:

- The subtitle goes into `standfirst` until C03 exists. It is wrong, it is one
  document, and it is a five-minute correction later.
- The distribution marking goes into a `callout` module at the top of the body until
  C06 exists. Also wrong, also one document.

Both compromises are recorded here rather than discovered later, and both are
reversed in Wave 2 for the same document.

| Step | Work | From |
|---|---|---|
| 1.1 | Finish authentication: registration, verification, recovery, session invalidation on password change, rate limiting | V01 |
| 1.2 | Thinnest administrative surface — sign in, list, open | V02 |
| 1.3 | Structured editor sufficient to author Sensor Fusion's modules by hand | V03 |
| 1.4 | Map its methodology; author its limitations | V04 |
| 1.5 | Create its 25 sources; author and link its claims | V05 |
| 1.6 | Review, approve and publish with two accounts | V06 |
| 1.7 | Public rendering of that one document | V07 |
| 1.8 | **Measure.** Hours, claims, sources, and what hurt | V08 |

Step 1.8 is the point of the wave. Everything downstream is currently planned against
estimates.

**Exit criterion.** One document, authored in the application, reviewed by a second
account, published through the real gates, readable at a canonical URL, with its
sources and claims linked and its marking rendered. Not a demonstration path — the
real one.

## 5. Wave 2 — Lift the freeze, once, for a batch

Only after Wave 1 exits. Then the eight schema recommendations ship as **three**
migrations, not eight — a single freeze lift with a single rehearsal, rather than
eight separate reasons to touch the database.

| Migration | Contents | Why grouped |
|---|---|---|
| M1 — additive columns | C03 subtitle, C04 stated date + precision, C05 numeric-unit check | Three one-line additive changes, no data-model consequence, no backfill |
| M2 — attribution and markings | C06 `distribution_markings` + FK, C07 organisational contributor | Both change how a version is attributed or labelled; both need the first document corrected afterwards |
| M3 — sources and search | C08 identifier schemes + authority + dedup index, Q03 `sources_text` + `search_vector` rebuild | Both touch the source and index path; batching them means one index rebuild |

C01 and C02 (the two module-catalogue rows) are not migrations and can ship in
Wave 1 whenever convenient.

Wave 2 also carries the taxonomy (X01–X08) and the search work that depends on it
(Q01, Q02, Q05–Q07), neither of which is DDL beyond Q03.

**Exit criterion.** The Wave 1 document re-rendered with its real subtitle, its real
marking, its organisational attribution and its month-precision date — and the
ranking baseline recorded.

## 6. Wave 3 — Rendering and accessibility properly

P01–P11 from Band 5, with P04 (tables) as the largest single item and the one most
likely to be under-estimated (R8). Manual screen-reader and keyboard verification
(A11Y-07, A11Y-08) is part of this wave, not after it —
`.claude/rules/accessibility.md` 3.

This wave is where the second and third documents get ingested, because rendering
work needs more than one document to be honest about.

**Exit criterion.** Three documents published, accessibility manually verified with
the assistive technology recorded, non-conformances written down with a remediation
plan (accessibility rule 33).

## 7. Wave 4 — The rest of the corpus

N01–N04. An editorial programme, sized from V08's measurement rather than from the
estimates in this analysis. Ordered cheapest-first: the seven documents with
annotated `Principal Sources` (F18) before the seven without.

Traffic Records fourth overall, deliberately, as the stress test (§3).

N05 — the assisted importer — is considered only once N01 is under way, and may
never be worth building for fourteen documents (R11).

## 8. What this sequence deliberately does not do

- **It does not lift the freeze for the first document.** Two compromises are cheaper
  than an early freeze lift, and both are reversible.
- **It does not build an importer.** Fourteen documents, ingested by hand, will teach
  more about the model than an importer written against assumptions.
- **It does not expand the workflow engine.** Nothing in this analysis requires a new
  state, a new transition or a new gate. The corpus is blocked by three existing
  gates working correctly (§6.10), not by a missing one.
- **It does not weaken anything.** No item in any wave relaxes a gate, a constraint,
  a trigger or a policy. Where the corpus does not satisfy a control, the resolution
  is editorial work, and that is what the estimates are for.

## 9. The honest summary

The content model survives contact with fourteen real research documents. Its
structural core — typed modules, stable fragments, immutable versions, nine claim
types, a declared state machine — is validated, not merely plausible.

The eight recommended changes are small, and seven of them are additive. The
expensive part of this corpus is not the schema. It is that a research-publishing
platform with a real evidence standard requires someone to do the evidence work, and
fourteen finished documents that were never written for such a platform do not
contain it in a form the platform can accept.

That is the platform working as intended. It is also several weeks of editorial work
that no engineering decision will remove, and the plan should say so out loud rather
than discover it in Wave 4.
