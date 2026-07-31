#!/usr/bin/env bash
# Drop and recreate the development database, then migrate and seed.
# DESTRUCTIVE. Refuses to run when CRUX_ENV is production.
set -euo pipefail

PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-crux}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "${CRUX_ENV:-development}" = "production" ]; then
  echo "refusing to reset a production database" >&2
  exit 1
fi

echo "==> dropping $PGDATABASE"
su postgres -c "psql -p $PGPORT -d postgres -qc \"
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '$PGDATABASE' AND pid <> pg_backend_pid();\"" >/dev/null
su postgres -c "psql -p $PGPORT -d postgres -qc 'DROP DATABASE IF EXISTS $PGDATABASE;'"
su postgres -c "psql -p $PGPORT -d postgres -qc 'CREATE DATABASE $PGDATABASE;'"

bash "$ROOT/scripts/db-migrate.sh"
bash "$ROOT/scripts/db-seed.sh"
echo "==> reset complete"
