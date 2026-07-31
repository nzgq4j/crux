-- Block 04 / Block 07 — grants for the trusted server layer
--
-- WHY THIS EXISTS
-- `service_role` is created BYPASSRLS, which exempts it from row-level policies but
-- NOT from table-level grants. Without these grants every privileged server-layer
-- operation — signed download issuance, OAuth identity linking, the publication
-- transaction, newsletter synchronisation — would fail with "permission denied for
-- table", despite the role being nominally privileged. The earlier RLS migrations
-- granted only to anon and authenticated, so this was a live gap.
--
-- Granting broadly to service_role is correct and deliberate: it is the identity the
-- trusted server layer uses precisely where RLS cannot express an operation. The
-- control on that power is not the grant — it is that `asServiceRole()` in
-- src/lib/db/client.ts requires a stated reason, performs an explicit permission
-- check first, writes an audit row, and is enumerable by grep for review (Block 27).
--
-- Reverse: REVOKE ALL ON ALL TABLES IN SCHEMA ... FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  cms, taxonomy, identity, accounts, workflow, knowledge,
  assets, subscriptions, search, analytics
  TO service_role;

-- audit.events is append-only for everyone, service_role included: the table
-- triggers reject UPDATE and DELETE regardless of grants or BYPASSRLS.
GRANT SELECT, INSERT ON audit.events TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA
  cms, taxonomy, identity, accounts, workflow, knowledge,
  assets, subscriptions, search, analytics, audit
  TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

-- Future tables created by later migrations inherit the same grants, so a new table
-- cannot silently break the server layer.
ALTER DEFAULT PRIVILEGES IN SCHEMA
  cms, taxonomy, identity, accounts, workflow, knowledge,
  assets, subscriptions, search, analytics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA
  cms, taxonomy, identity, accounts, workflow, knowledge,
  assets, subscriptions, search, analytics
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
