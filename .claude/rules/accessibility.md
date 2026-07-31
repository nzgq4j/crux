# Accessibility Rules

## Target

1. WCAG 2.2 Level AA across every public and administrative surface. This is the
   minimum, not the aspiration.
2. Explicitly verify the criteria added in WCAG 2.2: focus not obscured, dragging
   movement alternatives, target size, consistent help, redundant entry, and
   accessible authentication.
3. Accessibility is a completion requirement of the block that introduces a surface,
   not deferred work for Block 20.

## Keyboard operation

4. Every interaction has a keyboard path. A pointer-only affordance is a defect.
5. Where drag-and-drop is offered, a keyboard alternative is mandatory — reordering in
   the structured editor especially.
6. Tab order follows visual order. No keyboard trap except an intentional, escapable
   dialog.
7. Document any shortcut and ensure it does not conflict with assistive technology.

## Focus

8. A visible focus indicator on every interactive element, meeting non-text contrast
   and focus-appearance requirements.
9. Never remove a focus indicator without an equivalent replacement.
10. Manage focus deliberately across structural changes: on dialog open and close, on
    module insert, delete, and move, and after navigation. Focus is never lost to the
    document body.
11. Focus must not be obscured by sticky headers, footers, or overlays.

## Screen-reader semantics

12. Correct roles, names, and states. Prefer a native element over an ARIA
    re-implementation.
13. Landmarks on every page, one `h1`, and a logical heading hierarchy.
14. Form controls have programmatic labels; errors are associated with their field.
15. Announce asynchronous results, save state, validation, and errors through live
    regions with appropriate politeness — without over-announcing.
16. Link text is meaningful out of context.

## Editor controls

17. Every structured-editor action — insert, move, delete, duplicate, attach, detach,
    save, preview — has a labelled, keyboard-operable control.
18. Reordering announces the module's new position.
19. Module boundaries, types, and positions are exposed to assistive technology.
20. Alternative text and caption fields are required, labelled, and have associated
    inline error messaging.

## Tables, figures, and charts

21. Tables use header cells with scope, a caption, and a summary where complex.
22. Sortable columns expose their sort state programmatically.
23. Horizontal scroll regions are keyboard-reachable and labelled.
24. Figures have meaningful alternative text; decorative images are correctly hidden.
25. Every chart has a text alternative or an accessible data table, and never
    distinguishes series by colour alone.

## Presentation

26. No meaning is conveyed by colour alone.
27. Contrast meets AA; measure and record ratios rather than asserting them.
28. Honour `prefers-reduced-motion`.
29. Content reflows without loss of function at 320 CSS pixels width and at 400
    percent zoom.

## Verification

30. Automated checks are necessary and **not sufficient**. Manual verification is
    mandatory.
31. Manually verify keyboard-only completion of every primary path.
32. Manually verify with a screen reader and record the assistive technology and
    browser combination used.
33. Record known non-conformances with impact and a remediation plan. Never omit one.
34. **Never remove function to pass a check**, and never weaken a security control to
    ease conformance — provide a compliant alternative instead.
35. Accessibility sign-off comes from `accessibility-reviewer`, not from the
    implementing agent.
