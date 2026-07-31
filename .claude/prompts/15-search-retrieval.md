# Block 15 — Search and Retrieval

## Objective

Implement permission-aware hybrid retrieval combining PostgreSQL full-text search
with pgvector semantic search, with measurable ranking quality and no leakage of
restricted content.

## Scope

### In scope

- The `search` schema, weighted tsvector indexing, semantic chunking, embeddings,
  hybrid ranking, and permission-aware retrieval.
- Zero-result analysis, synonyms, boosts, suppressions, and ranking tests.

### Out of scope

- The public search interface (Block 11) and machine-discovery surfaces (Block 21),
  which consume this block.

## Dependencies

Blocks 05, 07.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/07-rls-security.md`.
- `.claude/rules/database.md`, `.claude/rules/security.md`.

## Required Outputs

- Migrations creating the `search` schema, indexes, and retrieval functions.
- The embedding pipeline and its queue.
- A ranking test harness with a labelled query set.
- `docs/search.md`.

## Functional Requirements

1. **PostgreSQL full-text search.** A search document per published content version,
   maintained on publication and correction, built from title, summary, headings,
   body text, key findings, claim text, taxonomy terms, and author names.
2. **Weighted tsvector.** Apply weights so that title and summary outrank headings,
   which outrank body text. Use a configured text search configuration with
   `unaccent`. Index with GIN. Record the weight assignment and its rationale.
3. **pgvector.** Store embeddings with a fixed, recorded dimensionality and an index
   appropriate to the corpus size. The embedding model identifier is stored with
   every vector so that a model change is detectable and re-embedding is scoped.
4. **Semantic chunks.** Chunk version content at module and section boundaries with
   a bounded token size and recorded overlap. Each chunk retains its fragment
   identifier so a result can deep-link to the section.
5. **Claims embeddings.** Embed claim assertion text so that claim-level retrieval is
   possible independently of surrounding prose.
6. **Finding embeddings.** Embed key findings separately so that a summary-level
   query can match a finding without matching the full body.
7. **Hybrid ranking.** Combine lexical and semantic scores through a documented
   fusion method with tunable weights. Recency, content type, and authority signals
   may adjust the score; every adjustment is documented and configurable, not hidden
   in code.
8. **Permission-aware retrieval.** Permission filtering happens inside the retrieval
   query, not as a post-filter on results. Result counts, facet counts, pagination
   totals, and snippets must all reflect only what the requesting user may read.
9. **Zero-result analysis.** Log queries returning no results, with normalised query
   text and frequency, surfaced in the Block 09 search-quality manager.
10. **Synonyms.** A synonym table applied at query time, manageable through the
    administrative surface, with a documented precedence over stemming.
11. **Boosts.** A boost table allowing an administrator to raise specified content or
    terms, with a recorded reason and an optional expiry.
12. **Suppressions.** A suppression table removing specified content from results,
    with a recorded reason. Suppression is a ranking control and never a substitute
    for an access control.
13. **Ranking tests.** A labelled set of queries with expected relevant results, run
    as a test producing precision and recall style metrics. A ranking change that
    regresses the metric below the recorded threshold fails the build.

## Technical Requirements

- Indexing and embedding are performed asynchronously from a queue populated by the
  publication transaction; a provider outage must never fail publication.
- The embedding provider sits behind the Block 03 abstraction.
- Retrieval functions are `SECURITY INVOKER` where possible so RLS applies naturally;
  where `SECURITY DEFINER` is required, the permission predicate is explicit and
  documented.
- Queries are parameterised. No user input is concatenated into SQL.
- Retrieval latency targets are recorded and asserted by test at seed corpus scale.

## Data Requirements

- Search documents and embedding rows carry the visibility of their source version
  and are removed or updated on withdrawal, correction, and supersession.
- Re-embedding is resumable and does not require full corpus downtime.
- The embedding queue records attempts, errors, and dead-letter state.

## Security Requirements

- Restricted content must be undetectable through search: not through results, not
  through counts, not through facets, not through snippets, and not through
  latency differences that reliably disclose existence.
- Semantic similarity must not surface a restricted document's content as a snippet
  of a permitted one.
- Search endpoints are rate-limited; expensive vector queries have a cost ceiling.
- Query logs are redacted of personal data before retention.
- This block requires independent review by `database-security-reviewer`.

## Accessibility Requirements

- Result counts and loading state are announced through live regions.
- Facets and filters are keyboard-operable, labelled, and expose selected state.
- Zero-result states offer actionable suggestions in text.
- Result snippets do not rely on colour alone to indicate matched terms.
- Pagination is keyboard-operable and announces the current position.

## Testing Requirements

- Ranking tests against the labelled query set, with recorded metrics and a
  regression threshold.
- A test proving a restricted document is absent from results, counts, and facets
  for an unauthorised user.
- A test proving permission filtering occurs in-query, by asserting counts rather
  than only inspecting the returned page.
- Tests for synonym application, boost effect, and suppression effect.
- A test proving withdrawal removes a document from the index.
- A test proving the embedding queue retries and dead-letters correctly.

## Documentation Requirements

- `docs/search.md`: document construction, weight assignment, chunking strategy,
  embedding model and dimensionality, fusion method and weights, permission
  filtering mechanism, synonym and boost precedence, and the ranking test procedure.
- Document the re-embedding runbook.

## Acceptance Criteria

- [ ] Weighted tsvector documents exist for every published version and are GIN-indexed.
- [ ] Embeddings exist for chunks, claims, and findings, each recording its model.
- [ ] Hybrid ranking is documented, tunable, and reproducible.
- [ ] Permission filtering occurs inside the query, proven by count-based tests.
- [ ] Restricted content is undetectable through any search signal.
- [ ] Zero-result queries are logged and surfaced administratively.
- [ ] Synonyms, boosts, and suppressions work and are administrable.
- [ ] Ranking tests run with recorded metrics and a regression threshold.
- [ ] Indexing and embedding are asynchronous and cannot fail publication.
- [ ] `database-security-reviewer` has signed off.

## Completion Report

Report: search document definition and weights, chunking strategy, embedding model
and dimensionality, index types chosen, fusion method and weights, permission
filtering implementation, administrative controls delivered, ranking metrics
achieved, latency measured, tests added with results, reviewer sign-off, and
documentation written.
