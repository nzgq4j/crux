#!/usr/bin/env bash
# Drop and recreate the database, then migrate and seed.
# DESTRUCTIVE. Refuses to run when CRUX_ENV is production.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT="$(repo_root)"
DB="$(db_name)"

if [ "${CRUX_ENV:-development}" = "production" ]; then
  echo "refusing to reset a production database" >&2
  exit 1
fi

wait_for_db

echo "==> dropping $DB"
psql_admin -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                 WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null
psql_admin -qc "DROP DATABASE IF EXISTS \"$DB\";"
psql_admin -qc "CREATE DATABASE \"$DB\";"

bash "$ROOT/scripts/db-migrate.sh"
bash "$ROOT/scripts/db-seed.sh"
echo "==> reset complete"
