# Block 11 — Public Experience

## Objective

Build the public-facing surfaces of Crux, with report and article bodies delivered as
server-rendered semantic HTML that is complete and readable without client-side
JavaScript.

## Scope

### In scope

- All public routes listed below, their data loading, and their rendering.
- Canonical URL handling, redirects, and error surfaces.

### Out of scope

- Visual language and component primitives (Block 12), search implementation
  (Block 15), citation export mechanics (Block 17), and structured data (Block 21).

## Dependencies

Blocks 05, 07.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/07-rls-security.md`.
- `docs/product-requirements.md`, `.claude/rules/frontend.md`, `.claude/rules/accessibility.md`.

## Required Outputs

- The public route tree with every surface below implemented.
- `docs/public-surfaces.md` mapping route to data source and caching strategy.

## Functional Requirements

Implement each surface with real data and correct empty and error states:

1. **Home** — positioning, featured research, recent publications, and entry points
   into hubs and search.
2. **Insights** — the aggregate listing of published content with filtering by type,
   topic, industry, technology, and date.
3. **Articles** — article listing and article reading surface.
4. **Reports** — report listing and the full report reading surface with section
   navigation, figures, tables, references, methodology, and limitations.
5. **White papers** — listing and reading surface, including gated download entry
   where the item is access-controlled.
6. **Datasets** — dataset listing, dataset detail with variables and versions, and
   access-controlled download entry.
7. **Research collections** — curated multi-item collections with their own
   canonical URL and ordering.
8. **Industry hubs** — industry-scoped landing surfaces drawing on the controlled
   taxonomy.
9. **Technology hubs** — technology-scoped landing surfaces on the same basis.
10. **Topics** — topic term surfaces listing associated content.
11. **Expert / author profiles** (§45.4.1 "author pages") — expert identity,
    affiliation, disclosures, expertise terms, external identifiers, and authored
    content. State explicitly whether every byline author receives a page or only
    designated experts; if only experts, non-expert bylines must still resolve to a
    stable, linkable author reference so citations do not dead-end.
12. **Search** (§45.4.4) — the public search surface consuming Block 15, covering four
    elements: the query input with full-text behaviour; keyboard-operable filters and
    facets; **ranking display**, meaning result order reflects the Block 15 hybrid
    score with the active sort or relevance basis stated visibly and programmatically,
    so a user can tell whether they are seeing relevance or recency; and
    permission-safe results, where counts and facets reflect only what the user may
    read.
13. **Subscriptions** — newsletter subscription and preference surfaces consuming
    Block 14.
14. **Organization identity** — about, mission, and organisational information.
15. **Methodology** — the platform's research methodology statement.
16. **Editorial standards** — the editorial policy, review process, and
    independence statement.
17. **Corrections policy** — the corrections policy plus the public corrections
    register listing issued corrections.
18. **Legal pages** — terms, privacy, cookie policy, and licensing.
19. **Error pages** — 404, 403, 410 for withdrawn content, 500, and an offline or
    degraded state.

## Technical Requirements

- Main report and article content is server-rendered. The body must be present in
  the initial HTML response; progressive enhancement may add behaviour but never
  content.
- Server Components by default. Client Components only for genuinely interactive
  affordances.
- **Stable fragment navigation (§45.4.1).** Every module's stable fragment identifier
  from Block 05 is emitted as the `id` of its rendered section, so that a citation
  addressing a section resolves to it. Fragment identifiers survive re-rendering and
  pagination; a deep link to a section must not break because the page was rebuilt.
  Section navigation and in-page anchors use these identifiers rather than
  position-derived ones.
- Canonical URLs are single and stable per version; alternates are declared, not
  duplicated.
- `cms.redirects` is honoured with the recorded status code.
- Withdrawn content returns a tombstone with an appropriate status, retaining the
  citation record, rather than a bare 404.
- Caching strategy is stated per route; publication and correction invalidate the
  affected routes.

## Data Requirements

- Public surfaces read only published, non-withdrawn versions, relying on RLS rather
  than application-side filtering as the primary control.
- Listing queries paginate; no route loads an unbounded set.

## Security Requirements

- No draft, scheduled, or restricted content is reachable through any public route,
  including through listing counts, pagination totals, or metadata.
- Gated items disclose their existence and metadata but not their protected payload.
- Author-supplied content is rendered sanitised.
- No privileged key or server-only value reaches the client bundle.

## Accessibility Requirements

- Semantic landmarks, one `h1` per page, and a logical heading hierarchy.
- Skip-to-content link, visible focus, and a keyboard-operable navigation.
- Report section navigation is keyboard-operable and exposes current position.
- Figures carry alternative text; tables carry captions, header scope, and summaries;
  charts carry a text alternative or accessible data table.
- Link text is meaningful out of context.
- Colour contrast meets WCAG 2.2 AA; no meaning is conveyed by colour alone.
- Reduced-motion preference is honoured.

## Testing Requirements

- Rendering tests per surface, including empty and error states.
- A test proving the report body is present with JavaScript disabled.
- Tests proving draft, scheduled, and restricted content are unreachable publicly.
- A test proving redirects resolve and do not loop.
- A test proving withdrawn content serves a tombstone with the citation record.
- Automated accessibility checks on every surface plus recorded manual verification
  of the report reading path.

## Documentation Requirements

- `docs/public-surfaces.md`: route, data source, caching, and invalidation trigger.
- Document the tombstone and redirect behaviour.

## Acceptance Criteria

- [ ] All nineteen surfaces are implemented with real data.
- [ ] Report and article bodies render server-side without client JavaScript.
- [ ] Canonical URLs are stable and single per version.
- [ ] Redirects resolve correctly and loop detection passes.
- [ ] Withdrawn content serves a tombstone retaining the citation record.
- [ ] Draft, scheduled, and restricted content are unreachable, proven by test.
- [ ] Every listing paginates.
- [ ] Every surface has empty and error states.
- [ ] Accessibility checks pass and manual verification is recorded.

## Completion Report

Report: surfaces implemented, rendering strategy per surface, caching and
invalidation, redirect and tombstone behaviour, pagination approach, negative tests
proving non-public content is unreachable, accessibility results, and documentation.
