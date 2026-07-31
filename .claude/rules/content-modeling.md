# Content Modeling Rules

## Structure

1. Content is composed of typed, ordered modules. **Never store an opaque
   full-document HTML blob.**
2. Every module payload is JSON validated against a schema registered in
   `cms.content_modules`.
3. A new module type is registered in the catalogue with its schema before it is used.
4. Derived representations — plain text and Markdown — are generated from the
   structured source, never authored separately.

## Identifiers

5. Every content item has a permanent public identifier, independent of slug and
   title, that never changes and is never reused.
6. Every published version has a permanent version identifier.
7. Every module has a fragment identifier that is unique within its version and stable
   across edits and reorderings, so a citation can address a section.
8. A slug change creates a redirect. A canonical URL never silently breaks.

## Versions

9. Published versions are immutable. Corrections create a new version; they never
   edit a published one.
10. A superseded version remains resolvable at its own canonical URL.
11. A withdrawn item retains its identifier and citation record and serves a tombstone.
12. Drafts are never publicly readable.

## Taxonomy

13. Use the controlled vocabulary in the `taxonomy` schema. Free-text tagging is not
    permitted where a controlled vocabulary exists.
14. Term creation, merge, and deprecation are governed operations, not incidental
    writes.
15. Term merges preview their content impact before applying, and create a redirect
    from the merged term so no existing URL breaks.
15a. Orphan terms — those with no content assignment and no child term — are detected
    and reported, never silently retained.

## Claims and evidence

16. Every claim carries exactly one type from the controlled set: observed fact,
    derived finding, quantitative finding, interpretation, forecast, recommendation,
    assumption, opinion, or definition.
17. Claim type is an enforced constraint, not advisory metadata.
18. Claim-to-source linkage follows the **minimum evidence standard declared on the
    content type** in `cms.content_types`. Where that standard requires linkage,
    observed facts require a source and interpretations, recommendations, and
    forecasts reference their basis.
18a. Quantitative findings **always** require an analysis run resolving to dataset
    versions and variables. This requirement is absolute and is never configurable
    downward by a content type.
18b. Every claim carries exactly one of the nine storage types, and the five §45
    evidence classes — observed, derived, interpretive, forecast, recommendation —
    are derived from them by a database-enforced mapping. Never set the two
    independently.
19. Data figures require provenance resolving to their analysis run.
20. Record a contradicting source rather than omitting it.

## Sources and versions

21. Sources are deduplicated on normalised external identifier and normalised title.
22. Citations are version-aware: they record which version was cited and resolve to it
    even after supersession.
23. A dataset version referenced by published content is immutable.

## Honesty

24. **Never fabricate a claim, source, citation, dataset, identifier, credential,
    affiliation, or institutional authority** — not in code, seeds, fixtures,
    examples, or documentation.
25. When a metadata field has no value, omit it. Never fill it with a plausible one.
26. Do not state or imply that structured data, `llms.txt`, or any technical measure
    guarantees citation by a large language model.

## Accessibility of content

27. Every figure module requires alternative text. Every table module requires
    headers, a caption, and a summary where complex. Every chart requires a text
    alternative or an accessible data table.
28. A module type that renders a visual without a text-alternative field is not an
    acceptable module type.
