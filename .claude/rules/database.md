# Database Rules

## Change management

1. Schema changes occur only through migrations. Never alter a schema by hand or from
   application code.
2. Migrations are timestamp-ordered and apply cleanly to an empty database.
3. Every migration is reversible in practice: either it ships a reverse migration or
   it documents the reverse procedure explicitly. "Irreversible" is a decision to
   record, not a default.
4. Rehearse every migration on staging against production-equivalent data before
   production.
5. A destructive migration requires explicit approval and a rehearsed recovery path.

## Security

6. Enable Row Level Security on every table in every exposed schema, at creation. A
   table without RLS is a defect regardless of whether policies exist yet.
7. Write explicit per-operation policies with `using` and `with check`. No permissive
   catch-all policies.
8. Policies call the `private` permission functions rather than re-implementing role
   logic.
9. Every `SECURITY DEFINER` function sets a restricted `search_path` and documents why
   it needs elevated privilege.
10. Views over protected tables are `security_invoker` unless proven not to leak.
11. The `private` schema is never exposed through the API.

## Integrity

12. Foreign keys on every relationship, with deliberate delete behaviour. Do not
    default to cascade without considering what it destroys.
13. Check constraints for every enumerable state and every value range.
14. Unique constraints for every identity that must be unique — stable identifiers,
    slugs, fragment identifiers within a version, and provider subject identifiers.
15. **Published versions are immutable.** Enforce with triggers. Convention is not
    enforcement.
16. **Audit tables are append-only.** No role may update or delete an audit row.
17. Prefer database-enforced invariants over application-enforced ones wherever the
    database can express the rule.

## Functions and triggers

18. Document every function and trigger: purpose, inputs, outputs, side effects, and
    security context.
19. Keep triggers simple and fast. Long-running work is enqueued, not performed in a
    trigger.
20. **No uncontrolled dynamic SQL.** Where dynamic SQL is unavoidable, use format with
    proper identifier quoting and never interpolate user input.

## Performance

21. Index every foreign key and every documented access path.
22. Justify each index; an unused index is a write cost with no benefit.
23. No unbounded query in application code. Every list paginates.
24. Review the query plan for any query on a relation expected to grow large.

## Data

25. Seeds are deterministic and idempotent.
26. Seeds and fixtures contain no real personal data and no production extract.
27. Every table carries `created_at` and `updated_at`, and a created-by reference
    where a human actor is responsible.
