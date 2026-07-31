# Block 10 — Structured Editor

## Objective

Build the structured authoring surface in which editorial staff compose content as
typed modules with attached claims, citations, sources, figures, tables,
methodologies, and limitations — never as opaque HTML.

## Scope

### In scope

- Module insertion, editing, reordering, and deletion.
- Attachment of claims, citations, sources, figures, tables, methodology, and
  limitations to modules.
- Autosave, manual save, preview, version comparison, validation, and
  concurrent-edit awareness.

### Out of scope

- The claims and provenance schema itself (Block 16); this block consumes it.
- Publication (Block 08); the editor submits, it does not publish.

## Dependencies

Blocks 05, 08, 09.

## Required Inputs

- `.claude/prompts/05-database-content-model.md`, `.claude/prompts/08-editorial-workflow.md`,
  `.claude/prompts/09-admin-dashboard.md`.
- `.claude/rules/frontend.md`, `.claude/rules/accessibility.md`, `.claude/rules/content-modeling.md`.

## Required Outputs

- The editor surface under `/admin`.
- Server actions for module mutation, autosave, and validation.
- `docs/authors.md` — the authoring guide.

## Functional Requirements

1. **Structured modules.** Author content as an ordered list of typed modules drawn
   from the registered module catalogue: heading, prose, list, quotation, figure,
   table, chart, callout, claim, methodology, limitations, key findings, references,
   and disclosure.
2. **Typed content storage.** Each module persists as JSON validated against its
   registered schema. The editor never serialises a document to opaque HTML.
3. **Block insertion.** Insert a module at any position through a control that is
   reachable and operable by keyboard, with the module type chosen from a labelled
   list rather than a pointer-only affordance.
4. **Reordering.** Move a module up or down, and to an arbitrary position, using
   keyboard-operable controls. Drag-and-drop, if offered, is an addition to keyboard
   reordering and never the only mechanism.
5. **Keyboard-accessible controls.** Every editor action — insert, move, delete,
   duplicate, attach, detach, save, preview — has a keyboard path with a visible,
   documented affordance.
6. **Stable fragments.** Each module carries a stable fragment identifier, visible to
   the author, preserved across edits and reorderings, and used by citations.
7. **Claims.** Attach a claim to a module, classify it by claim type, and record its
   assertion text. Quantitative claims require a value, unit, and period.
8. **Citations.** Attach a citation to a claim or module, referencing a source and,
   where applicable, a specific location within that source.
9. **Sources.** Search existing sources and create new ones with full bibliographic
   metadata. Duplicate sources are detected on external identifier or normalised
   title before creation.
10. **Figures.** Upload or select an asset, require alternative text, require a
    caption, and record provenance for any figure derived from a dataset.
11. **Tables.** Author tables with header rows, header scope, a caption, and a
    summary. A table without headers is a validation failure.
12. **Methodologies.** Attach a methodology statement describing approach, data
    sources, and analysis method for content types that require one.
13. **Limitations.** Attach a limitations statement for content types that require
    one.
14. **Autosave.** Persist draft changes automatically at a defined interval and on
    blur, with a visible, announced save state and an explicit failure state that
    does not silently discard work.
15. **Manual save.** An explicit save control that reports success or failure.
16. **Preview.** Render the draft exactly as the public surface will render it,
    reachable only by authorised users and never publicly addressable.
17. **Version comparison.** Compare the working draft against any prior version,
    module by module, showing added, removed, moved, and modified modules.
18. **Validation.** Run the publication gates from Block 08 in advisory mode inside
    the editor, listing each unmet gate with its remedy, so that submission failures
    are predictable.
19. **Concurrent-edit awareness.** Detect that another user is editing the same
    version, show who and since when, and prevent a silent overwrite by detecting a
    stale write and offering the author an explicit resolution.

## Technical Requirements

- The editor is a Client Component; all persistence goes through server actions that
  re-verify permission and assignment.
- Autosave is debounced, cancellable, and safe under rapid edits; the last write
  wins only after a staleness check.
- Module schema validation runs on the server; client validation is an aid, never
  the authority.
- Large payloads are chunked or streamed rather than blocking the interface.

## Data Requirements

- The editor writes only to draft versions. It may not write to a published version;
  the attempt must fail at the database, not merely be hidden in the interface.
- Every save records the acting user and timestamp for the version's edit history.

## Security Requirements

- Every mutation verifies the user's assignment to the version as well as the role
  permission.
- Uploaded files pass the Block 13 validation pipeline before attachment.
- Authored content is sanitised on render; no author-supplied markup may execute.
- Preview URLs are session-authorised, unguessable, and non-indexable.

## Accessibility Requirements

- The editor is fully operable by keyboard alone, with a documented shortcut list.
- Focus is never lost on insert, delete, move, or autosave; after a structural
  change focus rests on a predictable, announced element.
- Module boundaries, types, and positions are exposed to assistive technology.
- Save state, validation results, and concurrent-edit notices use live regions with
  appropriate politeness.
- Reordering announces the module's new position.
- Alternative-text and caption fields are required fields with programmatic labels
  and inline, associated error messaging.
- `accessibility-reviewer` sign-off is mandatory for this block.

## Testing Requirements

- End-to-end tests for insert, edit, reorder, delete, attach claim, attach citation,
  attach figure, and submit.
- A test proving keyboard-only completion of the full authoring path.
- A test proving autosave failure surfaces and does not discard the buffer.
- A test proving a stale write is detected rather than silently overwriting.
- A test proving the editor cannot mutate a published version.
- A test proving a table without headers and a figure without alternative text fail
  validation.
- Automated and manual accessibility verification, recorded.

## Documentation Requirements

- `docs/authors.md`: module catalogue, authoring procedure, claim classification
  guidance, citation attachment, keyboard shortcuts, and validation gate remedies.
- Document the concurrent-edit resolution procedure.

## Acceptance Criteria

- [ ] All registered module types are insertable, editable, and removable.
- [ ] Content persists as validated typed JSON; no opaque HTML is stored.
- [ ] Every action has a keyboard path; the full path is completable keyboard-only.
- [ ] Fragment identifiers are visible and stable across edits and reorderings.
- [ ] Claims, citations, sources, figures, tables, methodology, and limitations
      attach correctly.
- [ ] Figures require alternative text; tables require headers, caption, and summary.
- [ ] Autosave works, announces state, and fails visibly without data loss.
- [ ] Preview matches public rendering and is not publicly reachable.
- [ ] Version comparison shows added, removed, moved, and modified modules.
- [ ] Validation lists unmet publication gates with remedies.
- [ ] Concurrent editing is detected and stale writes are prevented.
- [ ] Published versions are unmodifiable from the editor, proven by test.
- [ ] `accessibility-reviewer` has signed off.

## Completion Report

Report: module types implemented, persistence and validation approach, keyboard
paths and shortcuts, autosave behaviour and failure handling, preview mechanism,
comparison implementation, validation gates surfaced, concurrent-edit strategy,
tests added with results, accessibility findings and resolutions, and documentation.
