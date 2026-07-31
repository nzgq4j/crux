# Frontend Rules

## Framework

1. Next.js App Router. Do not introduce Pages Router routes.
2. TypeScript strict mode. `any` requires a comment justifying it; `@ts-ignore` and
   `@ts-expect-error` require a comment and an issue reference.
3. Server Components by default.
4. Client Components only where genuine interactivity requires them — state, effects,
   browser APIs, or event handlers. Push `'use client'` as far down the tree as
   possible.
5. Data fetching happens on the server. A Client Component receives data as props or
   through a server action, not by querying the database directly.

## Markup

6. Semantic HTML. Landmarks on every page, one `h1`, and a logical heading hierarchy.
7. A `div` with a click handler is not a button. Use the correct element.
8. Report and article bodies must render server-side and be complete in the initial
   HTML response. Progressive enhancement adds behaviour, never content.
9. Never render unsanitised HTML. Any rich content is sanitised before render.

## Interaction

10. Every interaction has a keyboard path. A pointer-only affordance is a defect.
11. Visible focus on every interactive element. Never remove a focus indicator
    without an equivalent replacement.
12. Dialogs trap focus, close on Escape, and restore focus to the invoking control.
13. Honour `prefers-reduced-motion` globally.

## State

14. Every asynchronous surface has explicit loading, empty, success, and failure
    states. A blank screen is not a state.
15. Errors are announced to assistive technology and state the recovery path.
16. Optimistic updates must reconcile with the server result and roll back visibly on
    failure.

## Styling

17. Consume design tokens from Block 12. Do not hard-code a colour, spacing, or type
    value in a component.
18. Dark scheme is a token switch, not a duplicated component tree.

## Security

19. No secret, privileged key, or server-only value in client code, in a
    `NEXT_PUBLIC_` variable, or in a client bundle.
20. Never construct the privileged Supabase client in a Client Component.
21. Route authorization is enforced server-side. Hiding a control in the UI is not an
    authorization mechanism, and middleware alone is not sufficient — the route
    handler or server action re-verifies.
22. Never trust a role, permission, or entitlement value that arrived from the client.
