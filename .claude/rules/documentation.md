# Documentation Rules

## Documentation accompanies implementation

1. Documentation ships in the same change as the functionality it describes.
2. Update the affected document when behaviour changes. Stale documentation is a
   defect, not a cosmetic issue.
3. `docs/README.md` indexes every document with its owner and the date it was last
   verified against the implementation.

## Commands must be tested

4. **Every documented command must have been executed as written** and must have
   produced the documented result. An untested command is not documentation.
5. Verify the setup path on a clean checkout. If documentation alone is insufficient
   to get the platform running, that is a defect to record.
6. Include the expected output where it helps the reader confirm success.

## Environment variables

7. Document every environment variable by name, purpose, whether it is required,
   whether it is public or server-only, and its per-environment source.
8. **Never document a value.** `.env.example` contains names only.
9. When a block introduces a variable, it updates `.env.example` and the deployment
   configuration matrix in the same change.

## Architecture decisions

10. Record every meaningful technical decision as an ADR under
    `docs/architecture-decisions/`, numbered sequentially.
11. Each ADR records context, the decision, the alternatives considered, and the
    consequences — including the ones you dislike.
12. Superseding an ADR means writing a new one that references it, not editing the
    original.

## Honesty

13. **Do not document functionality that is not implemented.** Planned work belongs in
    the roadmap, clearly marked as not built.
14. State known limitations explicitly, with their impact and their remediation plan.
    Omitting a limitation is a form of false claim.
15. A document asserting that a security control exists must reference the test
    proving it.
16. Report the conformance level actually achieved, not the level targeted.

## Safety

17. No credential, token, private key, internal hostname, or production connection
    string appears in any document.
18. The threat model documents mitigations without publishing a working attack recipe.
19. Security issue templates must not solicit public disclosure of exploit detail.

## Form

20. Diagrams are text-sourced so they remain reviewable in diff.
21. Use real headings, meaningful link text, and table headers — documentation is a
    surface with accessibility obligations too.
22. Cross-references must resolve; a link check runs in CI.
