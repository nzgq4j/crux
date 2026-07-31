# 5. Rendering recommendations

What the public surface has to be able to render, established from the fourteen
documents rather than from a design intention. Accessibility obligations are called
out where the corpus creates them, because
`.claude/rules/accessibility.md` 3 makes conformance a completion requirement of the
block that introduces the surface, not deferred work.

## 5.1 The title block

**Evidence:** F1, F3, F4, F5, F6, F7.

Every document opens with more metadata than a title. A faithful title block needs:
series and pillar, title, subtitle, stated date at its true precision, distribution
marking, and attribution.

```
C-UAS WHITE PAPER SERIES · PAPER 9 OF 10 · INTELLIGENCE ARCHITECTURE PILLAR
Sensor Fusion and the Common Operating Picture
The Intelligence Architecture Required for Effective C-UAS Integration Across Echelons
April 2026 · Crucible Insight · UNCLASSIFIED // FOR OFFICIAL USE ONLY
```

Rules that follow from the corpus:

1. **The subtitle is inside the `h1`**, not a sibling heading and not the standfirst.
   It is part of the document's name (F1). A visually smaller second line inside the
   same heading element keeps the accessible name complete and keeps the heading
   hierarchy at one `h1`.
2. **The banner line is composed, never stored.** It renders series, sequence and
   pillar — three separately modelled facts
   ([document 02](02-schema-validation.md) §2.4). Storing the composed string would
   let it drift from its parts.
3. **The date renders at its stated precision.** "April 2026", never "1 April 2026"
   (F4). This needs S3; without it, the renderer either invents a day or has to
   special-case a timestamp it cannot trust.
4. **Attribution degrades honestly.** One document names a person (F5); thirteen
   attribute to the organisation. Render what is recorded. Do not render "Crucible
   Insight" as a byline for the one document that names David Daniel, and do not
   render a person for the thirteen that do not.
5. **The marking is rendered verbatim.** `UNCLASSIFIED // FOR OFFICIAL USE ONLY`,
   with the double slash, not normalised to `UNCLASSIFIED (FOUO)`. Five distinct
   strings exist (F3) and the difference between
   `FOR OFFICIAL USE ONLY` and `FOR OFFICIAL DISCUSSION` is the author's, not the
   platform's, to smooth over.

## 5.2 Distribution markings in page furniture

**Evidence:** F3. Integrated Effects repeats its marking in the page footer with the
date appended. The ADTech PDFs repeat their distribution statement on every page.
C-UxS Maritime puts the marking in a labelled block as the first element of the
document.

**Recommendation:** render the marking at the top of the document and again in the
document footer, and include it in the print stylesheet on every printed page —
which is where the authors put it, and where a printed extract loses its context
without it. The `repeats_in_furniture` flag in the S2 proposal exists for the
`UNCLASSIFIED`-only case, which does not need repetition.

**Accessibility:** the marking must not be conveyed by a coloured band alone
(`accessibility.md` 26). It is text, and it must remain text.

## 5.3 Callouts

**Evidence:** F11. Seventeen boxes across eight documents, each with a label, some
containing attributed quotations.

- Render as `<aside>` with an accessible name taken from the label (S7), **not** as a
  heading. Putting `THE FEEDSTOCK IMPERATIVE` in an `h2` inserts a phantom section
  into the document outline and breaks the logical heading hierarchy that
  `accessibility.md` 13 requires.
- Labels are ALL CAPS in the source. Render them in normal case in the markup and
  apply capitals with `text-transform` if the design wants them, so a screen reader
  does not spell out the letters.
- Boxes that are wholly a quotation with an attribution
  (Gen. Rainey; the GAO-23-105868 passage) should be `quote` modules with an
  attribution, not `callout` modules. The distinction matters for citation export:
  a quotation has a source and a location; a callout is the author's own emphasis.
- The three boxes that are enumerated findings
  (`THREE CRITICAL FINDINGS`, `THE SIX IPB GAPS THE UAS ERA CREATES`,
  `THE THREE FOUNDATIONAL FUNCTIONS OF C-UAS INTELLIGENCE ARCHITECTURE`) should be
  `key_findings` modules. They are the document's headline findings, boxed.

Three source constructs, three different modules. Ingestion cannot be mechanical
here, and [document 08](08-acceptance-tests.md) ING-04 exists to check the choice
was made deliberately.

## 5.4 Tables

**Evidence:** F12, F13. Twenty-five data tables, 2–6 columns, 4–11 rows, none with a
caption, several of which are the document's actual conclusion.

- **Header cells with `scope`**, a `<caption>`, and a summary for the complex ones
  (`accessibility.md` 21). No table in the corpus supplies a caption (F13), so
  every one is authored at ingestion — see [document 02](02-schema-validation.md)
  T3.
- **Horizontal scroll must be keyboard-reachable and labelled**
  (`accessibility.md` 23). A six-column decision matrix will not fit 320 CSS pixels
  (`accessibility.md` 29). The scroll region needs `tabindex="0"`, an accessible
  name, and a visible focus indicator.
- **Do not linearise a table into cards on small screens.** These are comparison
  matrices — *Gap / Current State / Consequence / Required Action / Priority* — and
  the comparison is the content. A card stack destroys the column relationship that
  makes the table worth reading. Scroll it.
- **Priority columns must not rely on colour.** TADSS's gap table has a `Priority`
  column with values like `High`. Rendered as a coloured chip alone it fails
  `accessibility.md` 26. The word stays.

## 5.5 Front-matter source blocks

**Evidence:** F17, F18. Six documents open with a pipe-delimited `PRIMARY SOURCES`
line; seven close with an annotated `Principal Sources` list of 18–27 entries.

```
GAO-23-105868 (Directed Energy Weapons)  |  GAO-25-107283 (Defense Industrial Base)  |  CRS R48477 (Counter-UAS)
```

That is a list rendered as a string. Rendered faithfully it is an unreadable
paragraph of pipes, and it is not machine-readable at all.

**Recommendation:** render as a real list, with each entry resolving to its
`knowledge.sources` row, its identifier and its parenthetical gloss. The annotated
terminal blocks (F18) render as a definition list — source, then what it
establishes — because that is the shape of the content.

## 5.6 Executive summaries

**Evidence:** F8. Prose in the eleven `.docx`; enumerated numbered findings in the
three PDFs.

The enumerated form must render as an ordered list, with list semantics rather than
literal numerals in the text. The extractor recovered ADTech001's summary as
`1The programmatic advertising supply chain transfers...2Sophisticated invalid
traffic...` — numerals glued to text. If those numerals are ingested as characters,
the summary is unreadable by a screen reader, unsortable, and the numbering will not
match if a finding is later removed.

## 5.7 Documents with no heading structure

**Evidence:** F10. Traffic Records: 7,516 words, zero heading styles.

Its sections exist (`I. The Six Core Data Systems`,
`II. The Common Data Model`) as visually formatted paragraphs. Ingested naively it
becomes 161 consecutive `prose` modules with one `h1` and no outline — which fails
`accessibility.md` 13, produces an empty `headings_text` for search
([document 04](04-search-recommendations.md) §4.1), and gives citations nothing to
address but the whole document.

**Recommendation:** the structured editor should warn — not refuse — when a version
over some length has no `heading` module. A warning, because a short page
legitimately has none; over a certain length it is almost certainly a defect.

## 5.8 Print artefacts must not become content

**Evidence:** the PDF extraction recovered `THIS SPACE INTENTIONALLY BLANK`,
`Page 2`, and a repeated running header (`CRUCIBLE INSIGHT` + the short title) on
every page.

These are page furniture from a print layout. They must be dropped at ingestion, not
stored as prose. The running header in particular would otherwise appear thirty
times in the body text and pollute the search index.

## 5.9 Table of contents

**Evidence:** AM White Paper has a literal `TABLE OF CONTENTS` heading with an
authored list.

**Recommendation:** generate the contents from the version's `heading` modules;
never store an authored one. `.claude/rules/content-modeling.md` 4 requires derived
representations to be generated from the structured source, and an authored ToC goes
stale the first time a section is renamed. With documents of 5,500–9,900 words and
20–39 headings, a generated in-page contents list is worth having on every long
document, not only the one that asked for it.

## 5.10 Revision notices

**Evidence:** F26. Traffic Records states, on its cover, the five things this
revision changed.

That statement is `correction_reason` / `correction_scope` content, and it must
render on the published page rather than only in an editorial view. A reader
arriving at a revised edition needs to know what changed, and a reader arriving at
the superseded edition needs to be told a newer one exists — which is what
`.claude/rules/content-modeling.md` 10 requires when it says a superseded version
stays resolvable at its own URL.

## 5.11 House style is not to be imposed on content

**Evidence:** §1.5. The corpus is US-spelled defence writing. The platform's chrome
and documentation are UK-spelled.

Rewriting *analyze* to *analyse* in a client's research alters the source. The
mismatch between chrome and content is the correct outcome and should be recorded
in the editorial guidance so that a future contributor does not "fix" it.

## 5.12 Reading affordances

Documents run 5,570–9,901 words. Some affordances follow from that length and can be
generated rather than authored: a contents list (§5.9), a reading-time estimate
derived from word count, and section anchors from `fragment_id` so a reader can link
to *Layer Three: The Fusion Engine* directly. The last of these is not cosmetic —
it is the mechanism that makes the platform's own citation model usable, since
`fragment_id` is what a citation addresses.

## 5.13 Summary

| ID | Recommendation | Obligation |
|---|---|---|
| D1 | Subtitle inside the `h1`; banner composed from parts | F1, F6, F7 |
| D2 | Marking verbatim, top and footer, in print CSS, never colour-only | F3, a11y 26 |
| D3 | Date at stated precision | F4 |
| D4 | Attribution renders what is recorded, person or organisation | F5 |
| D5 | Callouts as `<aside>`, not headings; quotes and findings split out | F11, a11y 13 |
| D6 | Tables: scope, caption, labelled keyboard-reachable scroll, no card linearisation, no colour-only priority | F12, F13, a11y 21/23/26/29 |
| D7 | Source blocks as lists resolving to `knowledge.sources` | F17, F18 |
| D8 | Enumerated summaries as ordered lists, not glued numerals | F8 |
| D9 | Warn on a long version with no heading module | F10, a11y 13 |
| D10 | Drop print furniture at ingestion | PDF extraction |
| D11 | Generate the contents list; never store one | content-modeling 4 |
| D12 | Render the revision notice publicly | F26, content-modeling 10 |
| D13 | Do not normalise content spelling to house style | §1.5 |

None of these requires a schema change beyond S1, S2 and S3, which
[document 02](02-schema-validation.md) already proposes.
