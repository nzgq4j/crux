# 1. Corpus analysis

Fifteen files were supplied. Fourteen are distinct documents: two uploads of
`CUxS_Merchant_Marine_Threat_Analysis.docx` are byte-identical
(sha256 `fb5377feb44c92e77e7ff63b39c5c193960ef58a6aab497acfcad53c513897a0`).

Eleven are Word documents (OOXML). Three are PDFs.

## 1.1 Method

Both extractors were written for this analysis rather than taken from a library, so
that every field reported below is traceable to a byte in the source package:

- **`.docx`** — the package is opened with `zipfile`, and `word/document.xml`,
  `word/footnotes.xml`, `word/endnotes.xml`, `docProps/core.xml` and `word/media/`
  are read directly with `xml.etree`. Heading level comes from the paragraph's
  `w:pStyle`, not from font size, so a paragraph that merely *looks* like a heading
  is not counted as one. Footnote and endnote counts exclude the `separator` and
  `continuationSeparator` placeholders Word writes into every document.
- **`.pdf`** — text is recovered from page content streams (`Tj`/`TJ` operators)
  only. An earlier pass that also read embedded font tables produced spurious
  "headings" and was discarded. Because table structure in a PDF is a layout
  artefact rather than a declared structure, **no table counts are reported for the
  three PDFs**, and the corpus-wide table figures below cover the eleven `.docx`
  files only.

Word counts are whitespace-delimited tokens of the extracted body text and will
differ slightly from Word's own count.

### File inventory and hashes

| File | sha256 (first 16) | Bytes |
|---|---|---|
| `AM_Feedstock_White_Paper.docx` | `fae9283b00d16533` | 29,881 |
| `AM_Feedstock_Tactical_Environment.docx` | `ee23260fff56e492` | 32,719 |
| `CUAS_Acquisition_Industrial_Base_WhitePaper.docx` | `6e4fff713704583b` | 49,655 |
| `CUAS_Generative_Technologies_WhitePaper_copy.docx` | `a76dd9eb71c52abe` | 41,990 |
| `CUAS_IPB_UAS_Era_copy.docx` | `1cb0d3859c872fec` | 39,804 |
| `CUAS_TADSS_WhitePaper_copy.docx` | `af3ad7b772bd7899` | 40,377 |
| `CUAS_WP9_Sensor_Fusion_COP.docx` | `f05888c1b7a809f9` | 33,233 |
| `CUxS_Merchant_Marine_Threat_Analysis.docx` (×2) | `fb5377feb44c92e7` | 31,773 |
| `Integrated_Effects_Planning.docx` | `b172c22562a3ac25` | 2,303,694 |
| `Traffic_Records_Integration_REVISED_May2026_copy.docx` | `43377340025f2c87` | 3,191,824 |
| `VUCA_VUCAPrime_Modern_Battlespace_copy.docx` | `292c7dc4e6c04d77` | 43,498 |
| `ADTech001.pdf` | `0412d1035d16a566` | 512,839 |
| `ADTech002.pdf` | `398f178bed481254` | 593,835 |
| `ADTech003.pdf` | `156d8dc77bd84e88` | 325,287 |

The two large `.docx` files are large because of embedded images, not text: they hold
all three embedded images in the corpus.

## 1.2 Inventory

`H` = paragraphs carrying a Heading style. `Tbl` = data tables (multi-row).
`Box` = single-cell tables used as callout boxes. `Img` = embedded images.
`Fn/En` = footnotes / endnotes.

| Document | Fmt | Words | H | Tbl | Box | Img | Fn/En | Date | Marking |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| AM Feedstock — Tactical Environment | docx | 6,641 | 20 | 2 | 3 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| AM Feedstock — Sustaining the Digital Thread | docx | 5,598 | 39 | 2 | 0 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED |
| C-UAS Acquisition & Industrial Base | docx | 6,359 | 30 | 4 | 2 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| C-UAS Generative Technologies | docx | 6,118 | 27 | 2 | 2 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| IPB in the Era of UAS | docx | 6,029 | 26 | 2 | 1 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| TADSS and C-UAS Training | docx | 5,570 | 21 | 3 | 2 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| Sensor Fusion and the COP (Paper 9 of 10) | docx | 7,145 | 27 | 2 | 1 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| C-UxS in the Maritime Domain | docx | 6,728 | 32 | 3 | 0 | 0 | 0/0 | Jul 2026 | UNCLASSIFIED // FOUO |
| Integrated Kinetic and Non-Kinetic Effects | docx | 6,022 | 36 | 1 | 3 | 1 | 0/0 | Jul 2026 | UNCLASSIFIED // FOR OFFICIAL DISCUSSION |
| State Traffic Records Integration (revised) | docx | 7,516 | **0** | 1 | 1 | 2 | 0/0 | May 2026 | *none* |
| VUCA and VUCA Prime | docx | 6,913 | 22 | 3 | 2 | 0 | 0/0 | Apr 2026 | UNCLASSIFIED // FOUO |
| Counting What Isn't There (ADTech001) | pdf | 8,135 | — | — | — | — | — | Jun 2026 | *distribution statement* |
| The Algorithmic Audit (ADTech002) | pdf | 9,901 | — | — | — | — | — | Jun 2026 | *distribution statement* |
| The Glass Wall (ADTech003) | pdf | 7,677 | — | — | — | — | — | Jun 2026 | *distribution statement* |

Totals for the eleven `.docx`: **25 data tables, 17 callout boxes, 3 embedded
images, 0 footnotes, 0 endnotes.**

## 1.3 Findings

### Identity and front matter

**F1 — Every document has a title and a substantial subtitle, and they are
different things.** 14 of 14. Examples: *Bridging the Gap:* / *How C-UAS Acquisition
Strategy Must Meet Battlespace Requirements to Sustain Industry Engagement and Scale
Decisive Capabilities*; *Counting What Isn't There* / *Fraud, Mismanagement, and the
Forensic Standard for Trust in U.S. Advertising Technology*. Subtitles run 10–30
words and carry the analytical proposition. They are not ledes.

**F2 — Two front-matter dialects.**

*Banner dialect* (7 documents: the five C-UAS papers, VUCA, AM Tactical
Environment). A pipe-delimited banner line, then title, then subtitle, then a
labelled block of fields: `ASSESSMENT SCOPE` or `SCOPE` or `PREMISE`,
`PRIMARY SOURCES`, `DATE`, and in one case `PRODUCED BY`.

*Cover-page dialect* (7 documents: AM White Paper, C-UxS Maritime, Integrated
Effects, Traffic Records, and the three PDFs). Organisation name, sometimes a
practice line ("Defense and Policy Research", "Transportation Policy & Data Systems
Research"), a document-class line ("WHITE PAPER", "STRATEGIC WHITE PAPER — REVISED
EDITION", "A Crucible Insight Research Paper"), title, subtitle, series line, date,
marking.

**F3 — Classification and distribution markings are present on 13 of 14, in five
distinct forms.**

| Marking | Count | Documents |
|---|---:|---|
| `UNCLASSIFIED // FOR OFFICIAL USE ONLY` | 8 | AM Tactical, C-UAS Acquisition, C-UAS Generative, IPB, TADSS, Sensor Fusion, C-UxS Maritime, VUCA |
| `UNCLASSIFIED` | 1 | AM White Paper |
| `UNCLASSIFIED // FOR OFFICIAL DISCUSSION` | 1 | Integrated Effects |
| `For Distribution to Advertising Industry Professionals` | 1 | ADTech001 |
| `For Distribution to Advertising Technology and Policy Professionals` | 2 | ADTech002, ADTech003 |
| *none* | 1 | Traffic Records |

Integrated Effects repeats its marking in the page footer as
`UNCLASSIFIED // FOR OFFICIAL DISCUSSION // JULY 2026`. C-UxS Maritime places the
marking in a two-row table labelled `CLASSIFICATION` as the first element of the
document. The ADTech PDFs repeat their distribution statement on every page.

**F4 — Dates are month-precision.** 14 of 14. No document states a day. Traffic
Records adds `| Revised and Updated`.

**F5 — Only one document names an author.** C-UAS Acquisition carries a
`PRODUCED BY` block naming David Daniel as Principal Researcher at Crucible Insight,
with a personal email address (not reproduced here, and it must not appear in any
fixture — see [document 08](08-acceptance-tests.md) §8.0). The other thirteen
documents name no individual. The Word
`dc:creator` property is the literal string `Un-named` in all eleven `.docx`;
`cp:lastModifiedBy` is `David Daniel` in six and `Un-named` in five. Two documents
close with an organisational statement instead: ADTech001's *About Crucible Insight*
paragraph, and Integrated Effects' footer
`CRUCIBLE INSIGHT | The Daniel Group LLC`.

**F6 — Series and sequence metadata is explicit in nine documents.**

| Series as stated | Documents | Sequence stated |
|---|---|---|
| `C-UAS WHITE PAPER SERIES` | C-UAS Generative, IPB, Sensor Fusion | Sensor Fusion: `PAPER 9 OF 10` |
| `C-UAS STRATEGY SERIES` | TADSS | — |
| `DOTMLPF-P SERIES` | VUCA | — |
| `Crucible Insight Research Series` | Integrated Effects | — |
| `Crucible Insight Policy Research Series` | Traffic Records | — |
| Advertising Technology Accountability Series | ADTech002 ("A Companion to *Counting What Isn't There*"), ADTech003 ("Third in the Advertising Technology Accountability Series") | ADTech003: third |

`PAPER 9 OF 10` asserts both an ordinal and a declared total. The corpus contains
four of the ten.

**F7 — Six named pillars.** `MATERIALS AND LOGISTICS`, `GENERATIVE TECHNOLOGIES`,
`DOTMLPF-P INTELLIGENCE`, `TRAINING AND SIMULATION`, `INTELLIGENCE ARCHITECTURE`,
`DOCTRINE AND LEADERSHIP`. A pillar is stated in the banner line, alongside but
distinct from the series.

### Body structure

**F8 — Executive summary is universal.** 14 of 14, and always first. Two forms: in
the eleven `.docx` it is 3–8 paragraphs of prose; in the three PDFs it is an
enumerated list of numbered findings (ADTech001: 8 items; ADTech002: 8; ADTech003:
6+), each a single dense sentence carrying a figure or a structural claim.

**F9 — Heading depth never exceeds three, and numbering is inconsistent across the
corpus.** Decimal (`1.`, `1.1`, `1.1.1`) in the C-UAS family; Roman-plus-letter
(`I.`, `A.`) in AM White Paper, Integrated Effects and the PDFs; unnumbered
`Gap 1:` / `Discipline 3:` / `Action 5:` labels for enumerated analytical units in
four documents.

**F10 — Traffic Records has zero heading styles.** Its 7,516 words carry no
`w:pStyle` heading at all; section titles are visually formatted paragraphs.
Reconstructing its hierarchy at ingestion requires a human, not a rule.

**F11 — Callout boxes are encoded as single-cell tables.** 17 instances across 8
documents. Each opens with an ALL-CAPS or bold label —
`THE FEEDSTOCK IMPERATIVE`, `Central Finding`, `THREE CRITICAL FINDINGS`,
`THE SIX IPB GAPS THE UAS ERA CREATES`, `GAP 1 FINDING`,
`VUCA PRIME APPLICATION: VISION`, `Key Doctrinal Reference`,
`Authority Challenge` — followed by one to six paragraphs. Several contain a
verbatim quotation with attribution (Gen. James Rainey at AUSA Global Force
Symposium, March 2025; the GAO-23-105868 finding on industry hesitation). These are
semantically callouts, key-finding blocks and pull quotes. They are tables only
because Word had no other box.

**F12 — Data tables are decision matrices, and the column archetypes recur.** 25
tables, 2–6 columns, 4–11 rows. Recurring shapes:

| Archetype | Columns | Appears in |
|---|---|---|
| Action plan | Action/Initiative, Timeline, Lead, Authority/Funding | AM Tactical, TADSS, Sensor Fusion, VUCA, C-UAS Acquisition (5 docs) |
| Gap analysis | Gap, Current State, Consequence, Required Action, Priority | TADSS, Sensor Fusion, IPB |
| Current-vs-required | Element, Current Approach, Extension Required | IPB, Sensor Fusion |
| Capability inventory | System, Requirement, Status, Gap | C-UAS Acquisition, TADSS, C-UxS Maritime |
| Comparison | two labelled columns | Integrated Effects (Kinetic / Non-Kinetic) |

**F13 — Not one of the 25 tables has a caption.** Two Traffic Records tables carry
an explanatory sentence immediately above ("Left column: GAO-10-454 (April 2010)
compliance rates…"), which is a caption in substance but not in structure.

**F14 — Recommendation sections in 11 of 14**, and in 8 of those the recommendations
are delivered as an action-plan table rather than prose.

**F15 — No document has a Methodology section, and no document has a Limitations
section.** Zero of fourteen, by heading. The nearest equivalents are real but
differently placed:

- A sources-and-scope statement in the front matter of seven documents, e.g.
  *"This paper draws exclusively on publicly available and officially released
  sources. No classified information is referenced."* (AM Tactical, TADSS, and
  five others in near-identical wording).
- `ASSESSMENT SCOPE` / `SCOPE` / `PREMISE` blocks stating what the paper examines
  and what it draws on (7 documents).
- Limitation statements embedded in body prose and in callouts, never sectioned:
  *"The Additive Manufacturing Limitations: The Mirage Problem"* (C-UAS Generative
  §2.5); *"Note on the 2010 Baseline"* (Traffic Records, a callout explaining that
  the 2010 figures are a structural baseline because no comparable later analysis
  exists); the ADTech003 executive-summary item stating AI methods *"can narrow
  uncertainty around walled garden performance but cannot resolve it"*.

This is the single most consequential structural finding. See
[document 06](06-workflow-validation.md) §2.

### Citation and evidence

**F16 — Zero footnotes and zero endnotes across all eleven `.docx`.** Not one.

**F17 — Four distinct citation mechanisms, and no document uses more than two.**

| Mechanism | Form | Documents |
|---|---|---|
| Front-matter `PRIMARY SOURCES` | pipe-delimited, identifier + parenthetical gloss: `GAO-23-105868 (Directed Energy Weapons)  \|  CRS R48477 (Counter-UAS)` | 6 (C-UAS Acquisition, C-UAS Generative, IPB, TADSS, Sensor Fusion, VUCA) |
| Terminal `Principal Sources` | one entry per line, *source: what it establishes* | 7 (the six above plus AM Tactical) |
| Terminal formal bibliography | `REFERENCES` (AM White Paper, APA-ish, grouped by source class), `Bibliography` (C-UxS, Chicago-ish), `SELECTED SOURCES` (the 3 PDFs, Chicago-ish) | 6 |
| Numbered inline markers + numbered list | superscript integer in body resolving to a numbered terminal list | 2 (Traffic Records, 1–27 with URLs; Integrated Effects, 1–18 with annotations) |

**F18 — The `Principal Sources` blocks already record what each source establishes.**
163 annotated entries across 7 documents (AM Tactical 23, C-UAS Acquisition 27,
C-UAS Generative 25, IPB 18, TADSS 23, Sensor Fusion 25, VUCA 22). Example:

> *War Quants: Factory-to-Frontline Pipeline analysis (March 2025): Ukraine 20,000
> to 200,000/month FPV production scale; commodity polymer feedstock supply chain…*

That is a claim-to-source linkage written in prose. It is the closest thing in the
corpus to the platform's evidence model, and it means the linkage work at ingestion
is *transcription*, not *reconstruction*, for those seven documents.

**F19 — Source volume.** At least **263 enumerable source entries** in the eleven
`.docx` (163 annotated + 24 AM White Paper + 27 C-UxS + 21 Integrated Effects + 28
Traffic Records), plus three PDF `SELECTED SOURCES` blocks not individually
enumerated by the extractor. Corpus-wide the figure is comfortably over 300.

**F20 — The identifiers the corpus cites are government and standards report
numbers, and none of them fit the platform's identifier schemes.** Observed:
`GAO-25-107283`, `GAO-23-105868`, `GAO-25-106454`, `GAO-16-56`, `GAO-10-454`,
`GAO-24-107059`, `CRS R48477`, `CRS R46925`, `CRS IN12459`, `CRS IN12310`,
`CRS IF10771`, `DODIG-2021-098`, `DODIG-2020-003`, `DoDI 5000.93`, `DOT HS 813 486`,
`DOT HS 813 762`, `DOT HS 813 710`, `DOT HS 812 601`, `NIST IR 8183 Rev 1`,
`NPS-AM-22-017`, `ATP 2-01.3`, `ATP 3-01.81`, `FM 3-0`, `FM 4-0`, `FM 2-0`,
`FM 3-60`, `ADP 4-0`, `ADP 6-0`, `JP 3-13`, `AR 350-38`, `DA Pam 350-9`,
`P.L. 119-60`, `RRA528-1`, `UNSCR 2722 (2024)`, `Civil Action No. 1:23-cv-00108`.
`knowledge.sources.identifier_scheme` permits `doi, isbn, issn, pmid, arxiv, handle,
urn, oclc`. Not one of the above is any of those.

**F21 — DOIs do exist, but only in the academic tail.** Peer-reviewed journal
citations appear in three documents (AM White Paper: *Journal of Cleaner
Production*, *International Materials Reviews*; ADTech001: *Marketing Science*,
*Journal of Marketing Research*, *Quarterly Journal of Economics*; Integrated
Effects: *International Review of the Red Cross*). None of them states a DOI in the
document text — the DOI would have to be looked up at ingestion.

**F22 — URLs appear with no access dates.** Traffic Records cites 27 sources, most
with a full URL, and states no retrieval date for any of them. No other document
gives URLs at all.

**F23 — One source is explicitly labelled as low-assurance by the author.** C-UxS
Maritime's bibliography contains
`Wikipedia (Open Source Synthesis). 2025. "Houthi Attacks on Commercial Vessels."
Last updated July 2025.` The parenthetical is the author's own credibility
signalling.

**F24 — Quantitative claims are dense, interval-shaped, and almost all cited rather
than computed.** ADTech001's executive summary alone carries eight: *35 to 60 cents
of every advertiser dollar*; *6 to 9 percent* SIVT in desktop display rising to
*14 to 18 percent* in CTV; MFA at *15 to 20 percent* of open-exchange volume;
last-touch attribution inflating apparent ROI by *30 to 70 percent*; walled gardens
at *50 to 60 percent* of U.S. digital ad spend. ADTech003 reports precision of
*plus or minus 3 to 8 percentage points*. Elsewhere: *$797 million* DoD AM spend in
FY2024 at *166 percent* year-over-year; *39,254* U.S. traffic fatalities in 2024
against *40,901* in 2023, a *3.6 percent* decline, and *1.10 per 100 million VMT*;
*more than 130* Houthi attacks between November 2023 and July 2025; *90 percent*
reduction in Red Sea container volume; *$10 billion per day* in cargo risk;
NHTSA data-system compliance at *71 / 60 / 47 / 46 / 42 / 38 / 13 percent*.

Two properties matter. The values are **ranges** far more often than points. And
they are, with the possible exception of the Traffic Records analysis, **attributed
to third-party measurement**, not produced by Crucible Insight.

**F25 — Direct quotation with attribution occurs in callouts and body prose.**
Gen. James Rainey (AUSA Global Force Symposium, March 2025); the verbatim
GAO-23-105868 passage on industry hesitation; JP 3-13's definition of information
operations; the JIATF 401 `$50M per-effort` premise quotation; DEVCOM ARL's
Dr. Eric Wetzel team's expeditionary feedstock problem statement; an unnamed
*"senior U.S. military official"* in Integrated Effects.

### Correction and revision

**F26 — One document is an explicitly revised edition and states its own change
log.** Traffic Records is headed `STRATEGIC WHITE PAPER — REVISED EDITION` and
carries, on the cover, an enumerated statement of what changed:

> *This revision incorporates final 2024 and preliminary 2025 fatality data,
> corrects the document's baseline data source characterization, updates the
> institutional context to reflect the current DOT administration, replaces an
> erroneous defense-sector data architecture reference, and amends the grant funding
> scale discussion.*

Five changes, one of which is a correction of an error and one a replacement of an
erroneous reference. The predecessor edition is **not in the corpus**. This document
is the corpus's only correction fixture and it is a good one, because it also
demonstrates the case where the superseded version is not held.

## 1.4 Subject coverage

The corpus is not the corpus the seeded taxonomy was built for.

| Cluster | Documents | Subject |
|---|---:|---|
| Counter-UAS / counter-unmanned systems | 6 | Acquisition and industrial base, generative manufacturing, IPB doctrine, TADSS training, sensor fusion architecture, maritime threat |
| Additive manufacturing logistics | 2 | Feedstock supply chain, forward-deployed AM |
| Defence doctrine and effects | 2 | Integrated kinetic/non-kinetic effects, VUCA/VUCA Prime |
| Advertising technology accountability | 3 | Programmatic fraud forensics, ML/data-mining forensics, walled-garden opacity |
| Transportation safety data | 1 | State traffic records integration |

Eleven of fourteen are defence or national-security research. Three are commercial
advertising-technology research. One is civilian transportation policy. All fourteen
address government or institutional decision-makers.

Two documents cover the same subject at different scope and structure — AM Feedstock
*Tactical Environment* (banner dialect, 7 numbered sections, tactical framing) and AM
Feedstock *Sustaining the Digital Thread* (cover-page dialect, Roman numerals, seven
named "challenge domains", formal references). Created a day apart. They are the
corpus's natural relatedness and near-duplicate test.

## 1.5 Language and house style

- **US spelling and defence terminology throughout** — *analyze*, *defense*,
  *program*, *modeling*. The platform's own documentation and design tokens use UK
  spelling (*organisation*, *analyse*). Content and chrome will not match, and
  content must not be normalised: rewriting a client's research to house spelling
  alters the source.
- **Acronym-dense, with the acronym dominant.** `C-UAS`, `C-UxS`, `UAS`, `UxS`,
  `TADSS`, `IPB`, `DOTMLPF-P`, `LSCO`, `CJADC2`, `SOSA`, `JIATF 401`, `MFA`, `SIVT`,
  `CTV`, `NTSDF`, `MMUCC`, `NEMSIS`, `PCASP`, `GNSS`. Expansions appear once, usually
  at first use, and often only in the subtitle.
- **Hyphenated and punctuated compounds are load-bearing** — *left-of-launch*,
  *reconnaissance-strike complex*, *made-for-advertising*, *Bab al-Mandab*,
  *pre-bid*, *post-hoc*, *walled garden*.
- **Em-dash-heavy prose** with the dash used for parenthetical qualification, at a
  density that will affect chunking if chunk boundaries are punctuation-sensitive.
- **Evidence-before-interpretation ordering** is consistent: what the auditors found,
  then what it means, then what to do. This matches the claim-type ladder the
  platform models (observed → derived → interpretive → recommendation).
