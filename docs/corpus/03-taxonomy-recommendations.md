# 3. Taxonomy recommendations

The seeded taxonomy in `supabase/seed.sql` was built for a management-consultancy
corpus: eight industries from *aerospace and defence* to *technology*, ten
capabilities from *artificial intelligence* to *workforce*, six CxO roles, five
topics. The validation corpus is defence, national-security, advertising-technology
and transportation-policy research addressed to government and institutional
decision-makers.

The mismatch is not total, and the recommendations below are limited to what the
fourteen documents actually demonstrate.

## 3.1 How the corpus lands on the existing vocabularies

### `industry` — 4 of 8 seeded terms are exercised, 3 documents have no home

| Seeded term | Corpus documents |
|---|---|
| `aerospace-defence` | 10 — the six C-UAS/C-UxS papers, both AM feedstock papers, Integrated Effects, VUCA |
| `government-public` | 14 — every document addresses a government or institutional audience |
| `technology` | 3 — the ADTech papers, and arguably Sensor Fusion |
| `industrial-manufacturing` | 2 — both AM feedstock papers |
| `automotive-mobility` | partial — Traffic Records concerns road safety, not vehicle manufacture |
| `banking-capital-markets` | 0 |
| `energy-utilities` | 0 |
| `healthcare` | 0 |

**Three subjects have no term:** commercial advertising and media (ADTech001–003),
transportation safety policy (Traffic Records), and commercial maritime shipping
(C-UxS Maritime, whose subject is the merchant marine fleet, not defence
procurement).

**Recommendation T1 — add three industry terms.**

| Slug | Name | Demonstrated by |
|---|---|---|
| `media-advertising` | Media and advertising | ADTech001, ADTech002, ADTech003 |
| `transport-logistics` | Transport and logistics | Traffic Records; both AM feedstock papers on the sustainment side |
| `maritime-shipping` | Maritime and shipping | C-UxS Maritime |

**Recommendation T2 — do not remove the four unexercised terms.**
`.claude/rules/general.md` 6 forbids deleting something because it appears unused,
and `banking-capital-markets`, `energy-utilities` and `healthcare` are seeded
demonstration terms with demonstration content attached to them. They are orphans
with respect to *this* corpus, not with respect to the database. The orphan-term
detection required by `.claude/rules/content-modeling.md` 15a should report them;
it should not delete them.

### `capability` — the seeded terms describe consulting practice, not research subject

Of the ten, `data-analytics` fits the ADTech and Traffic Records papers,
`artificial-intelligence` fits ADTech002 and ADTech003, `operations` and
`risk-resilience` fit loosely across the defence papers, and `cybersecurity` fits AM
White Paper's DODIG-2021-098 challenge domain. The remaining five —
`digital-strategy`, `organisation-leadership`, `sustainability`,
`technology-modernisation`, `workforce` — have at most incidental purchase.

**Recommendation T3 — add capability terms only where a document is substantially
*about* the capability**, not where it mentions it:

| Slug | Name | Demonstrated by |
|---|---|---|
| `acquisition-procurement` | Acquisition and procurement | C-UAS Acquisition (whole paper); AM White Paper §VI Federal Acquisition Implications; C-UAS Generative §5 |
| `doctrine-training` | Doctrine and training | TADSS (whole paper); IPB (whole paper); VUCA (whole paper); Integrated Effects §III |
| `supply-chain-industrial-base` | Supply chain and industrial base | Both AM feedstock papers; C-UAS Acquisition §4 |
| `sensing-detection` | Sensing and detection | Sensor Fusion (whole paper); C-UAS Generative §3 metamaterials; C-UxS §4.1 detection layer |
| `measurement-assurance` | Measurement and assurance | ADTech001–003 (all three are about whether a measurement can be trusted); Traffic Records (data quality) |

Five terms, each supported by at least one document whose *subject* it is.

Deliberately not proposed: `additive-manufacturing`, `counter-uas`,
`unmanned-systems`, `electronic-warfare`. These are topics, not cross-cutting
capabilities, and belong in the `topic` vocabulary below where hierarchy is
available.

### `role` — the seeded audience is CxO; the corpus's addressees are named in its own tables

The corpus does not have to be guessed at here. Eleven documents carry
recommendation tables whose `Lead`, `Responsible Organization` or
`Primary Actor` column names the addressee, and three name their addressees as
headings (C-UxS §6.2: *For Shipowners and Operators*, *For Flag States*,
*For the International Maritime Organization*).

**Recommendation T4 — add six audience-role terms, each taken from a corpus
addressee:**

| Slug | Name | Where the corpus names it |
|---|---|---|
| `defence-acquisition-official` | Defence acquisition official | C-UAS Acquisition, recommendation table `Primary Actor` column |
| `military-commander-staff` | Military commander and staff | VUCA (LSCO commanders and staff, stated in the scope); IPB; Integrated Effects |
| `training-capability-manager` | Training and capability manager | TADSS `Lead` column (CPE STRI, CTCs) |
| `policy-legislative-staff` | Policy and legislative staff | C-UAS Acquisition `Legislative Vehicle` column; AM White Paper NDAA analysis |
| `commercial-operator` | Commercial operator | C-UxS §6.2 *For Shipowners and Operators* |
| `regulator-standards-body` | Regulator and standards body | C-UxS *For Flag States* and *For the IMO*; Traffic Records (NHTSA); ADTech003 (regulatory oversight) |

The six seeded CxO roles stay. `chief-information-security` and `chief-technology`
have a legitimate claim on the ADTech papers.

### `topic` — the open hierarchical vocabulary is where most of the corpus's subject matter belongs

`topic` is the only seeded vocabulary with `is_closed = false` and the only one with
`term_relationships` in use. The corpus's subject matter is deep and hierarchical
and this is where it goes.

**Recommendation T5 — seed a topic hierarchy from the corpus's own section
structure.** Proposed, with the broader/narrower edges:

```
counter-unmanned-systems
├── counter-uas
├── counter-unmanned-maritime          (C-UxS §2: UAV, USV, UUV threat taxonomy)
├── uas-threat-characterisation         (IPB §4; C-UxS §2)
└── defeat-mechanisms                   (C-UAS Generative §4.3; C-UxS §4.2)

additive-manufacturing
├── am-feedstock                        (both AM papers, whole subject)
├── expeditionary-manufacturing         (AM Tactical §6; C-UAS Generative §2.3)
└── digital-thread                      (AM White Paper §VII; C-UAS Generative §5.1)

military-doctrine
├── intelligence-preparation-battlefield (IPB, whole paper)
├── targeting-and-effects                (Integrated Effects §III–IV)
├── mission-command                      (VUCA §3.3)
└── multi-domain-operations              (Integrated Effects §III.B; VUCA §2.3)

command-and-control
├── sensor-fusion                        (Sensor Fusion §4.3)
├── common-operating-picture             (Sensor Fusion §4.4)
└── data-interoperability                (Sensor Fusion §3.4 CJADC2; Traffic Records §II)

advertising-accountability
├── programmatic-supply-chain            (ADTech001 §I)
├── invalid-traffic-and-fraud            (ADTech001 §II; ADTech002 §II–III)
├── attribution-and-incrementality       (ADTech001 §IV; ADTech002 §V)
└── platform-transparency                (ADTech003, whole paper)

traffic-safety-data
├── crash-records-systems                (Traffic Records §I)
├── data-model-standardisation           (Traffic Records §II)
└── safety-performance-management        (Traffic Records, whole paper)

simulation-and-training
├── tadss                                (TADSS, whole paper)
└── synthetic-training-environment       (TADSS §4.3)
```

Seven broader terms, twenty-two narrower. Every one is a section subject in a named
document. Terms for subjects the corpus merely *mentions* — electronic warfare,
directed energy, metamaterials, nanotechnology, GNSS spoofing — are deliberately
excluded at this stage: they appear as sub-sections, and
`.claude/rules/content-modeling.md` 14 makes term creation a governed operation, not
an incidental one. Add them when a document is about them.

## 3.2 New vocabularies

### T6 — `pillar` (closed)

**Evidence:** F7. Six values, stated in the banner line of nine documents, and
distinct from the series.

| Slug | Name | Documents |
|---|---|---|
| `materials-logistics` | Materials and Logistics | AM Tactical |
| `generative-technologies` | Generative Technologies | C-UAS Generative |
| `dotmlpf-p-intelligence` | DOTMLPF-P Intelligence | IPB |
| `training-simulation` | Training and Simulation | TADSS |
| `intelligence-architecture` | Intelligence Architecture | Sensor Fusion |
| `doctrine-leadership` | Doctrine and Leadership | VUCA |

Closed, because a pillar is an editorial programme structure that Crucible Insight
governs, not a subject that emerges from content.

A pillar is not a topic: *Intelligence Architecture* as a pillar is a slot in a
publishing programme, and the Sensor Fusion paper's topics are sensor fusion and the
common operating picture. Both should be assigned.

### T7 — `region` (closed) — recommended, with a caveat

**Evidence:** geographic scope is a section-level organising principle in three
documents. C-UxS Maritime §3 is three named theatres —
*The Red Sea and Bab al-Mandab Strait*, *The Black Sea Theater*,
*The Persian Gulf and Strait of Hormuz*. VUCA's scope names *Ukraine, the Middle
East, and multi-domain competition with China*. Integrated Effects §VII covers
*The Russia-Ukraine Conflict*, *China's Integrated Systems Warfare Approach*,
*Israel's Operation Rising Lion (June 2025)*. Traffic Records and the ADTech papers
are explicitly scoped to the United States.

| Slug | Name |
|---|---|
| `united-states` | United States |
| `red-sea-bab-al-mandab` | Red Sea and Bab al-Mandab |
| `black-sea` | Black Sea |
| `persian-gulf-hormuz` | Persian Gulf and Strait of Hormuz |
| `ukraine` | Ukraine |
| `china-indo-pacific` | China and the Indo-Pacific |
| `middle-east` | Middle East |

**The caveat:** geography in this corpus is often *evidential* rather than
*topical* — Ukraine is cited as the source of lessons in five documents that are not
about Ukraine. A `region` assignment that does not distinguish "this paper is about
X" from "this paper draws evidence from X" will make regional filtering useless.
Recommendation: assign `region` only where the region is the paper's subject or a
top-level section, and record the rule in the editorial guidance. Evidence-source
geography is a property of the source, not of the content item.

### T8 — Acronym synonyms across every vocabulary

**Evidence:** §1.5. The corpus uses acronyms in preference to expansions, and often
expands them only once.

`taxonomy.synonyms` exists and is currently seeded with five entries. It should
carry, at minimum, the acronym form of every term whose subject the corpus names by
acronym:

`C-UAS` / `CUAS` / *counter-UAS* / *counter-unmanned aircraft system* →
`counter-uas`; `UxS` / `C-UxS` → `counter-unmanned-systems`;
`AM` → `additive-manufacturing`; `IPB` → `intelligence-preparation-battlefield`;
`TADSS` → `tadss`; `COP` → `common-operating-picture`;
`SIVT` / *sophisticated invalid traffic* → `invalid-traffic-and-fraud`;
`MFA` / *made-for-advertising* → `programmatic-supply-chain`;
`CTV` / *connected television* → `platform-transparency`;
`DOTMLPF-P` → `military-doctrine`; `LSCO` → `multi-domain-operations`;
`STE` → `synthetic-training-environment`; `MMUCC` / `NEMSIS` →
`data-model-standardisation`.

This is a search-quality requirement more than a taxonomy one; the retrieval
consequences are in [document 04](04-search-recommendations.md) §2.

`MFA` is a live example of why synonyms must be scoped to a vocabulary rather than
matched globally: in this corpus it means *made-for-advertising*, and in almost
every other corpus it means multi-factor authentication.

## 3.3 Not recommended

| Considered | Why not |
|---|---|
| A `series` vocabulary | A series is an ordered set of documents with its own page and canonical URL, which is a `collection` content item — not a term. Modelling it as both would give two answers to "what is in this series". See [document 07](07-relationship-graph.md) §3. The trade-off: a term would be cheaper for filtering. A collection is right because `PAPER 9 OF 10` implies order and a declared total, which a flat term cannot carry. |
| A `classification` vocabulary | Markings are per-version metadata with rendering obligations, not a subject axis. [Document 02](02-schema-validation.md) S2. |
| An `issuing-agency` vocabulary (GAO, CRS, NHTSA, DoD, IMO) | These are publishers of *sources*. `knowledge.sources.publisher` and `identity.organisations` hold them. A taxonomy term would duplicate the fact and let the two disagree. |
| A `document-type` vocabulary | `cms.content_types` already. |
| A `time-period` vocabulary (FY2024, FY2026 NDAA) | Fiscal years are attributes of cited legislation and of claim periods; `claims.period_start`/`period_end`/`period_label` already carry them. |
| Free-text tagging as an interim | Forbidden by `.claude/rules/content-modeling.md` 13 where a controlled vocabulary exists. It would also be a one-way door: free-text tags applied during ingestion become the de facto taxonomy. |

## 3.4 Governance notes

1. **Term creation is a governed operation** (`content-modeling.md` 14). The terms
   above are a *recommendation for a seeded set*, to be reviewed by whoever owns
   editorial taxonomy before any are created. They are not to be created
   incidentally during ingestion.
2. **Orphan detection will fire immediately** on the unexercised seeded terms
   (T2). That is the mechanism working, and the report should be read rather than
   silenced.
3. **A term merge must preview its content impact and leave a redirect**
   (`content-modeling.md` 15). If `automotive-mobility` is later merged into
   `transport-logistics`, that path must be exercised — see
   [document 08](08-acceptance-tests.md) TAX-05.
4. **Assignment counts to expect.** On the recommendation above, a typical corpus
   document would carry roughly 2 industry terms, 1–2 capability terms, 1 pillar,
   1–2 roles, 2–4 topics and 0–1 regions: eight to twelve assignments. That is the
   number the tagging interface has to make comfortable, and it is the number the
   `taxonomy_text` search field will be built from.
