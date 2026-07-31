#!/usr/bin/env bash
# Drop and recreate the database, then migrate and seed.
#
# DESTRUCTIVE, AND FOR LOCAL DEVELOPMENT ONLY. It deletes every row in the database.
#
# This is no longer the way to apply migrations. `db:migrate` is incremental and safe
# against a persistent database; this exists only to rebuild a local database from
# empty, which is useful for proving the migration set applies cleanly from scratch.
#
# Refuses to run outside development and test. The check fails closed: an unset
# CRUX_ENV on a production NODE_ENV is treated as production, matching
# src/lib/env/server.ts.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT="$(repo_root)"
DB="$(db_name)"

ENVIRONMENT="${CRUX_ENV:-}"
if [ -z "$ENVIRONMENT" ]; then
  if [ "${NODE_ENV:-}" = "production" ]; then ENVIRONMENT=production; else ENVIRONMENT=development; fi
fi
case "$ENVIRONMENT" in
  development|test) ;;
  *)
    echo "refusing to reset: CRUX_ENV resolves to '$ENVIRONMENT'." >&2
    echo "db:reset destroys all data and is for local development only." >&2
    echo "To evolve a deployed database incrementally, use db:migrate." >&2
    exit 1
    ;;
esac

wait_for_db

echo "==> DESTRUCTIVE: dropping database \"$DB\" and every row in it"
psql_admin -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                 WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null
psql_admin -qc "DROP DATABASE IF EXISTS \"$DB\";"
psql_admin -qc "CREATE DATABASE \"$DB\";"

bash "$ROOT/scripts/db-migrate.sh"
bash "$ROOT/scripts/db-seed.sh"
echo "==> reset complete"
