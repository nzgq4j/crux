# Block 12 — Design System

## Objective

Establish an original visual identity and a component library serving both the public
and administrative surfaces, with accessibility built into the primitives rather than
retrofitted.

## Scope

### In scope

- Design tokens: grid, spacing, typography, colour, focus, motion, borders,
  elevation, and data visualisation.
- Responsive breakpoints.
- Public and administrative component libraries.

### Out of scope

- Page composition (Blocks 09, 10, 11), which consumes these primitives.

## Dependencies

Blocks 02, 03.

## Required Inputs

- `docs/product-requirements.md`, `docs/architecture.md`.
- `.claude/rules/frontend.md`, `.claude/rules/accessibility.md`.

## Required Outputs

- A token source of truth consumed by the styling layer.
- The component library with documented props and states.
- `docs/design-system.md`.

## Functional Requirements

1. **Original visual identity.** The identity must be original to Crux. Do not copy,
   imitate, or approximate IBM's or McKinsey's branding, typefaces, colour systems,
   layout signatures, or trade dress. Do not reproduce any third-party brand asset.
   Record the identity rationale in an ADR.
2. **Grid.** A documented layout grid with column counts and gutters per breakpoint,
   and the content measure used for long-form reading.
3. **Spacing.** A single spacing scale. Arbitrary one-off spacing values are not
   permitted in components.
4. **Typography.** A type scale with defined roles — display, heading levels, body,
   long-form body, caption, and data label — each with size, line height, weight,
   and tracking. Long-form reading measure must fall within a comfortable range.
5. **Colour.** Semantic colour roles — surface, content, muted, accent, success,
   warning, danger, and information — each defined for light and dark schemes. Every
   text-on-surface pairing meets WCAG 2.2 AA contrast; record the measured ratios.
6. **Focus states.** A single, highly visible focus indicator applied consistently,
   meeting the non-text contrast and focus-appearance requirements. Focus is never
   removed without an equivalent replacement.
7. **Motion.** A motion scale with durations and easings, and a global reduced-motion
   behaviour that disables non-essential animation.
8. **Borders.** A border width and radius scale, with borders never used as the sole
   indicator of state.
9. **Elevation.** A shadow and layering scale with defined stacking contexts for
   dropdowns, dialogs, and toasts.
10. **Data visualisation.** A categorical palette distinguishable without colour
    alone, a sequential scale, chart typography, axis and legend conventions, and a
    mandatory text-alternative or data-table pattern for every chart.
11. **Responsive breakpoints.** A named breakpoint set with the behaviour of grid,
    typography, and navigation at each. Content reflows without loss of function at
    320 CSS pixels width and at 400 percent zoom.
12. **Public components.** Header, navigation, footer, card, listing item, filter
    controls, pagination, breadcrumb, report section navigation, figure, table,
    chart wrapper, callout, citation block, reference list, download control,
    subscription form, and error state.
13. **Administrative components.** Application shell, side navigation, data table
    with sorting and pagination, filter bar, form controls, dialog, drawer, tabs,
    menu, toast, status badge, empty state, and confirmation dialog.

## Technical Requirements

- Tokens are defined once and consumed by every component; no component hard-codes a
  colour, spacing, or type value.
- Components are typed, composable, and free of business logic.
- Every component documents its states: default, hover, focus, active, disabled,
  loading, error, and empty where applicable.
- Dark scheme is a token switch, not a duplicated component tree.

## Data Requirements

Not applicable. This block introduces no database objects. Chart components accept
data through typed props and perform no data fetching.

## Security Requirements

- Components must not render unsanitised HTML. Any component accepting rich content
  requires pre-sanitised input and documents that contract.
- No component embeds a third-party script, font, or asset that transmits user data
  without an explicit, documented decision.

## Accessibility Requirements

- Every interactive component is keyboard-operable with correct roles, names, and
  states.
- Dialogs and drawers trap focus while open, are dismissible by Escape, and restore
  focus on close.
- Menus, tabs, and combo controls follow the expected keyboard interaction patterns.
- Form controls have programmatic labels and associated error messaging.
- Contrast ratios are recorded per token pairing, not merely asserted.
- Charts ship with an accessible alternative by construction.
- `accessibility-reviewer` sign-off is mandatory before this block is complete.

## Testing Requirements

- Automated contrast verification across every defined token pairing.
- Keyboard interaction tests for every interactive component.
- Automated accessibility checks on every component in every documented state.
- Visual regression coverage for the component library.
- A test proving reduced-motion disables non-essential animation.
- A test proving layout survives 320-pixel width and 400 percent zoom.

## Documentation Requirements

- `docs/design-system.md`: every token, every component, its props, its states, and
  its accessibility contract.
- An ADR recording the original identity direction and confirming no third-party
  trade dress was used.

## Acceptance Criteria

- [ ] The visual identity is original and free of IBM, McKinsey, or other third-party
      trade dress.
- [ ] All token categories are defined and consumed exclusively through tokens.
- [ ] Every text-on-surface pairing meets AA contrast, with ratios recorded.
- [ ] A consistent, visible focus indicator is applied everywhere.
- [ ] Reduced motion is honoured globally.
- [ ] Charts include a text alternative or data table by construction.
- [ ] Layout survives 320-pixel width and 400 percent zoom.
- [ ] Every public and administrative component listed exists and is documented.
- [ ] Keyboard interaction tests pass for every interactive component.
- [ ] `accessibility-reviewer` has signed off.

## Completion Report

Report: tokens defined, contrast ratios measured, components delivered for public and
administrative surfaces, states covered, reduced-motion behaviour, chart alternative
pattern, responsive verification results, accessibility test results, the originality
ADR, and documentation written.
