# Architecture Decision Records

Every meaningful technical decision in Crux is recorded here as a numbered ADR.

## Rules

1. Number sequentially: `NNNN-short-kebab-title.md`, starting at `0001`.
2. Each ADR records **context**, the **decision**, the **alternatives considered**,
   and the **consequences** — including the unwelcome ones.
3. Superseding a decision means writing a new ADR that references the old one. Never
   edit a superseded ADR except to add the supersession note.
4. Record the status: Proposed, Accepted, Superseded by NNNN, or Rejected.

## Template

```markdown
# NNNN — Title

- Status: Proposed | Accepted | Superseded by NNNN | Rejected
- Date: YYYY-MM-DD
- Block: NN
- Deciders: <agent or person>

## Context
What forced a decision. The constraints in play.

## Decision
What was decided, stated plainly.

## Alternatives considered
Each alternative and why it was not chosen.

## Consequences
What this makes easy, what it makes hard, and what it commits us to.
```

## Index

| ADR | Title | Block | Status |
|---|---|---|---|
| — | None recorded yet | — | — |

## ADRs required by the architecture

These are named explicitly in the prompt blocks and must exist by the time their block
completes:

| Expected ADR | Block | Subject |
|---|---|---|
| `0001-baseline-repository-state.md` | 01 | The starting state and the constraints it imposes |
| `0002-product-scope.md` | 02 | Scope, deferred capabilities, and their rationale |
| Architecture decisions | 03 | One per binding architectural choice |
| Extension and schema choices | 04 | PostgreSQL extensions and the schema namespace set |
| Original identity direction | 12 | Confirming no third-party trade dress was used |
| Automatic-linking policy | 28 | The OAuth account-linking security trade-off |
