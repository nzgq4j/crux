# Block 20 — Accessibility

## Objective

Bring every public and administrative surface of Crux to WCAG 2.2 Level AA, verified
by automated testing and by recorded manual keyboard and screen-reader assessment.

## Scope

### In scope

- Conformance assessment and remediation across all surfaces listed below.
- The accessibility test suite and the conformance record.

### Out of scope

- Introducing new features. This block remediates and verifies; it does not extend
  functionality.

## Dependencies

Blocks 09, 10, 11, 12.

## Required Inputs

- `.claude/prompts/09-admin-dashboard.md`, `.claude/prompts/10-structured-editor.md`,
  `.claude/prompts/11-public-experience.md`, `.claude/prompts/12-design-system.md`.
- `.claude/rules/accessibility.md`, `.claude/rules/testing.md`.

## Required Outputs

- Remediation commits across the affected surfaces.
- An automated accessibility test suite in CI.
- `docs/accessibility.md` including the conformance statement and known limitations.

## Functional Requirements

Assess and remediate to WCAG 2.2 AA across:

1. **Public navigation** — landmarks, skip link, keyboard operation, current-page
   indication, and consistent placement across pages.
2. **Search** — labelled input, keyboard-operable facets, announced result counts,
   announced loading, and actionable zero-result text.
3. **Reports** — heading hierarchy, section navigation with current position,
   footnote and reference links with return paths, and readable measure at 400
   percent zoom.
4. **Citations** — text-based citation blocks, labelled format selection, and
   copy controls that announce their outcome.
5. **Accounts** — labelled forms, inline associated errors, announced state changes,
   accessible authentication that does not depend on a cognitive function test
   without an alternative, and no timing-dependent step without an extension.
6. **Downloads** — accessible names stating format and size, announced entitlement
   denial with the unlocking action, and progress conveyed in text.
7. **Newsletters** — grouped labelled preference controls, announced confirmation
   and unsubscribe outcomes.
8. **Administrative navigation** — keyboard-operable navigation, visible focus,
   role-aware structure, and consistent help placement.
9. **Content editing** — full keyboard operability of the Block 10 editor, managed
   focus across structural changes, announced save and validation state, and
   documented shortcuts that do not conflict with assistive technology.
10. **Review** — keyboard-operable review forms, announced comment threads and their
    resolution state.
11. **Approval** — clear, text-based state indication and confirmation.
12. **Asset upload** — labelled file inputs, announced progress and errors, required
    alternative-text fields with associated messaging.
13. **Tables** — header cells with scope, captions, summaries for complex tables,
    programmatic sort state, and horizontal scroll regions that are keyboard-reachable
    and labelled.
14. **Figures** — meaningful alternative text, captions programmatically associated,
    and decorative images correctly hidden.
15. **Charts** — a text alternative or an accessible data table for every chart, and
    no reliance on colour alone to distinguish series.
16. **Dynamic updates** — live regions with appropriate politeness for asynchronous
    results, errors, save state, and queue changes, without over-announcing.

### WCAG 2.2 additions

Explicitly verify the criteria added in WCAG 2.2, including focus not obscured,
dragging movement alternatives, target size, consistent help, redundant entry, and
accessible authentication.

## Technical Requirements

- Automated checks run in CI on every page and every documented component state.
- Automated coverage is understood to be partial; manual verification is mandatory
  and its results are recorded, not asserted.
- Remediation changes behaviour minimally and never removes function to pass a check.

## Data Requirements

Record the conformance assessment per surface: criterion, result, evidence, and
remediation reference. This record is the basis of the conformance statement.

## Security Requirements

Accessibility remediation must not weaken a security control. Specifically: do not
disable rate limiting to ease testing, do not expose additional data in error
messages to improve announcements, and do not lengthen a session timeout beyond the
policy in Block 27 — instead provide a compliant warning and extension mechanism.

## Accessibility Requirements

This block is the accessibility requirement. Target conformance is WCAG 2.2 Level AA
across all surfaces above. Known non-conformances must be documented with their
impact and remediation plan; they may not be omitted.

## Testing Requirements

- Automated accessibility tests across every public and administrative route.
- Automated component-level checks across every documented state.
- Manual keyboard-only completion of: the report reading path, search, download,
  subscription, authoring, review, and publication.
- Manual screen-reader verification of the same paths with at least one
  screen-reader and browser combination, with the combination recorded.
- Zoom and reflow verification at 400 percent and at 320 CSS pixels width.
- Contrast verification across every token pairing.
- A test asserting reduced-motion preference is honoured.
- Every automated accessibility failure must be resolved or explicitly accepted with
  a recorded justification; suppressions require a reason.

## Documentation Requirements

- `docs/accessibility.md`: the conformance statement, the assessment record per
  surface, the tools and assistive technology used, known limitations with impact
  and plan, and the procedure for maintaining conformance in future blocks.
- Document the editor keyboard shortcut reference.

## Acceptance Criteria

- [ ] All sixteen surface areas are assessed against WCAG 2.2 AA.
- [ ] The WCAG 2.2 additional criteria are explicitly verified.
- [ ] Automated accessibility tests run in CI and pass.
- [ ] Manual keyboard-only verification is completed and recorded for every listed path.
- [ ] Manual screen-reader verification is completed and recorded.
- [ ] Zoom, reflow, and contrast verification pass.
- [ ] Every automated failure is resolved or has a recorded, justified acceptance.
- [ ] Known limitations are documented with impact and remediation plan.
- [ ] No security control was weakened to achieve conformance.
- [ ] `accessibility-reviewer` has signed off.

## Completion Report

Report: surfaces assessed, criteria failing at assessment and after remediation,
remediation changes made, automated test coverage added, manual verification
performed with the tools and assistive technology used, zoom and contrast results,
accepted limitations with justification, the conformance statement location, and the
reviewer sign-off.
