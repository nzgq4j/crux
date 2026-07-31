# Block 21 — SEO and Machine Discovery

## Objective

Make published Crux research accurately discoverable and correctly interpretable by
search engines and machine consumers, without cloaking, machine-only claims, or any
divergence from the public HTML.

## Scope

### In scope

- Canonical URLs, sitemaps, feeds, structured data, alternate machine-readable
  representations, `llms.txt`, the research corpus manifest, and crawl validation.

### Out of scope

- The public HTML surfaces themselves (Block 11) and citation metadata (Block 17),
  which this block serialises.

## Dependencies

Blocks 11, 17.

## Required Inputs

- `.claude/prompts/11-public-experience.md`, `.claude/prompts/17-citation-authority.md`.
- `.claude/rules/frontend.md`, `.claude/rules/content-modeling.md`.

## Required Outputs

- Sitemap, feed, structured data, and alternate representation routes.
- `llms.txt` and the research corpus manifest.
- A crawl validation test suite.
- `docs/machine-discovery.md`.

## Functional Requirements

1. **Canonical URLs.** Every page declares a single canonical URL. Paginated,
   filtered, and parameterised variants declare the correct canonical and are not
   duplicated in sitemaps.
2. **Sitemap index.** A sitemap index referencing every child sitemap, respecting
   entry and size limits.
3. **Content sitemap.** All published articles and pages with last-modified dates.
4. **Report sitemap.** All published reports and white papers, with gated items
   included at their metadata URL only.
5. **Author sitemap.** All public expert and author profiles.
6. **Dataset sitemap.** All publicly classified datasets.
7. **RSS.** A valid RSS feed of recent publications.
8. **Atom.** A valid Atom feed of the same.
9. **JSON-LD.** Structured data embedded in the page, derived from the same metadata
   as the visible content.
10. **Organization markup.** Publisher identity, canonical URL, and organisational
    identifiers.
11. **Person markup.** Author and expert markup with affiliation and external
    identifiers such as ORCID.
12. **Article markup.** Headline, author, publisher, publication and modification
    dates, section, and canonical URL.
13. **Report markup.** Report-appropriate markup including identifier, licence,
    methodology reference, and citation metadata.
14. **Dataset markup.** Dataset markup including variables, distribution, licence,
    temporal coverage, and creator.
15. **Alternate Markdown.** A Markdown representation of each published version,
    generated from the stored Markdown rendering in Block 05, declared as an
    alternate and byte-consistent with the HTML content.
16. **Alternate JSON.** A JSON representation of each published version equivalent to
    the Block 18 content resource, declared as an alternate.
17. **`llms.txt`.** A machine-readable index describing the platform, its licensing,
    its authoritative surfaces, and where structured research may be retrieved.
18. **Optional `llms-full.txt`.** Where produced, it contains only content already
    published in HTML, with no additional or divergent material.
19. **Research corpus manifest.** A manifest enumerating the published corpus with
    identifiers, versions, canonical URLs, licences, and last-modified dates, so a
    machine consumer can retrieve the corpus reliably.
20. **Crawl-quality validation.** Automated validation of sitemaps, feeds, structured
    data, canonical consistency, redirect chains, and orphaned URLs.

### Integrity constraints

- **Public HTML remains authoritative.** Every machine-readable representation is
  derived from the same stored version data as the HTML. Where they can diverge,
  the HTML wins and the divergence is a bug.
- **No cloaking.** Content served to a crawler is identical to content served to a
  person at the same URL. User-agent-conditional content is prohibited.
- **No machine-only claims.** No structured data, feed, manifest, or `llms.txt` may
  assert a fact, finding, credential, or endorsement that is not published in the
  human-readable HTML.
- **No guarantee claim.** No document produced by this block may state or imply that
  these measures guarantee citation, ranking, or inclusion by any search engine or
  large language model. See `.claude/prompts/17-citation-authority.md`, which owns
  this statement.

## Technical Requirements

- Sitemaps and feeds are generated from published data and regenerate on publication,
  correction, supersession, and withdrawal.
- Structured data is generated from the citation metadata assembly function in
  Block 17, not hand-authored per template.
- All generated artefacts carry correct content types and caching headers.
- Large sitemaps split according to specification limits.

## Data Requirements

- Only published, non-withdrawn, publicly classified content appears in any
  discovery artefact.
- Withdrawn content is removed from sitemaps and feeds; its tombstone remains
  addressable with a correct status.
- Gated content appears at its metadata URL only; its protected payload is never
  referenced.

## Security Requirements

- Private assets, restricted datasets, draft and scheduled content, and
  administrative routes never appear in any sitemap, feed, manifest, or alternate
  representation.
- `llms.txt` and the corpus manifest disclose no internal endpoints, no
  administrative paths, and no restricted identifiers.
- Feed and sitemap endpoints are rate-limited and cached.
- Robots directives are applied to preview, administrative, and gated payload routes.

## Accessibility Requirements

Structured data and alternate representations must never substitute for accessible
HTML. Semantic HTML from Block 11 remains the accessible source of truth, and this
block must not alter markup in a way that degrades the accessibility established in
Block 20.

## Testing Requirements

- Validation tests for sitemap XML, RSS, and Atom against their specifications.
- Structured data validation against the applied vocabulary, per content type.
- A test proving no draft, scheduled, restricted, or private URL appears in any
  discovery artefact.
- A test proving crawler and browser user agents receive identical content.
- A test proving the Markdown and JSON alternates match the HTML content.
- A test proving withdrawn content is removed from sitemaps and feeds.
- A test proving canonical URLs are single and consistent across HTML, sitemap,
  feed, structured data, and API.
- Redirect chain and orphan detection tests.

## Documentation Requirements

- `docs/machine-discovery.md`: every artefact, its URL, its generation trigger, its
  caching, and its validation. State the no-cloaking and no-machine-only-claims
  policies explicitly, and reference the citation limitation statement.

## Acceptance Criteria

- [ ] Canonical URLs are single, consistent, and correct across every representation.
- [ ] Sitemap index and all four child sitemaps validate and regenerate on change.
- [ ] RSS and Atom feeds validate.
- [ ] Organization, Person, Article, Report, and Dataset structured data validate.
- [ ] Markdown and JSON alternates exist, are declared, and match the HTML.
- [ ] `llms.txt` exists; any `llms-full.txt` contains only published HTML content.
- [ ] The research corpus manifest enumerates the published corpus correctly.
- [ ] No draft, scheduled, gated payload, or private URL appears anywhere.
- [ ] Crawler and browser receive identical content, proven by test.
- [ ] No artefact contains a machine-only claim or a guarantee of citation.
- [ ] Crawl validation passes with no redirect chains or orphans.

## Completion Report

Report: artefacts generated with their URLs, generation and invalidation triggers,
structured data types implemented and their validation results, alternate
representations and their consistency evidence, `llms.txt` and manifest contents,
exclusion evidence for non-public content, no-cloaking test result, crawl validation
findings, tests added with results, and documentation written.
