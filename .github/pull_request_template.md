## Summary

<!-- What this change does and why. One or two paragraphs. -->

## Functional block

<!-- Which block in .claude/prompts/ this implements, e.g. "Block 07 — RLS and Security".
     If this is not block work (a fix, a chore), say so and skip the block-specific sections. -->

- Block:
- Dependencies verified complete:

## Requirements addressed

<!-- Requirement IDs from docs/requirements-traceability.md. State the status change for each. -->

| Requirement ID | Status before | Status after |
|---|---|---|
|  |  |  |

## Files changed

<!-- Group by area. Note anything created, renamed, or deleted. -->

## Database changes

- [ ] No database changes
- [ ] Migrations added — list them in order:
- [ ] Schema or table names introduced:
- [ ] Constraints, triggers, or functions added:
- [ ] Indexes added, and the access path each serves:
- [ ] Reverse procedure documented at:
- [ ] Rehearsed against a production-equivalent dataset

## RLS impact

- [ ] No RLS impact
- [ ] RLS enabled and forced on every new table
- [ ] Policies added or changed — list relation, operation, and predicate:
- [ ] Denied-access tests added for every new boundary
- [ ] RLS enumeration meta-test passes

## Security impact

- [ ] No security impact
- [ ] Authorization changes:
- [ ] Secret handling changes:
- [ ] New privileged-client usage — permission check and audit write at:
- [ ] Rate limiting or abuse controls affected:
- [ ] Independent review by `database-security-reviewer` required and obtained

Confirm:

- [ ] No secret, token, or private key is present in this change
- [ ] No control was weakened, disabled, or bypassed to make a test pass

## Accessibility impact

- [ ] No user-facing surface changed
- [ ] Automated accessibility checks pass
- [ ] Keyboard-only path verified
- [ ] Screen-reader verification performed — AT and browser used:
- [ ] Contrast verified for any new token pairing
- [ ] `accessibility-reviewer` sign-off required and obtained

## Tests performed

<!-- Tiers exercised and their results. Include counts. Report failures honestly. -->

- [ ] Unit
- [ ] Database
- [ ] RLS / denied-access
- [ ] Storage policy
- [ ] Integration
- [ ] End-to-end
- [ ] Accessibility
- [ ] Security
- [ ] Full suite green at commit:

Skipped tests and their recorded reasons:

## Documentation updated

- [ ] No documentation change needed
- [ ] Documents updated:
- [ ] Every documented command was executed as written
- [ ] `.env.example` updated for any new variable (names only, no values)
- [ ] ADR recorded at:
- [ ] `docs/implementation-status.md` updated
- [ ] `docs/requirements-traceability.md` updated
- [ ] `.claude/architecture-manifest.md` updated

## Screenshots

<!-- For user-facing changes. Include the keyboard-focus state and, where relevant,
     the empty and error states. Omit this section if not applicable. -->

## Known limitations

<!-- What this change does not do, and anything accepted rather than fixed.
     Record it here and in docs/known-limitations.md. "None" is an acceptable answer
     only if it is true. -->

## Rollback considerations

<!-- How to undo this. Note anything that is not cleanly reversible — especially
     destructive migrations, published-version effects, and external side effects
     such as sent email or provider state. -->
