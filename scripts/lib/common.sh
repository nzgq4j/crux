#!/usr/bin/env bash
# Shared helpers for the database scripts.
#
# Everything talks to PostgreSQL through DATABASE_URL so the identical scripts run
# locally, in CI against a service container, and against a managed instance. No
# script assumes it can `su postgres`, because CI cannot.

set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres@localhost:5432/crux}"

# Admin connection to the maintenance database, for CREATE/DROP DATABASE.
admin_url() {
  # Replace the trailing /<dbname> with /postgres.
  printf '%s' "${DATABASE_URL%/*}/postgres"
}

db_name() {
  local tail="${DATABASE_URL##*/}"
  printf '%s' "${tail%%\?*}"
}

psql_db() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

psql_admin() {
  psql "$(admin_url)" -v ON_ERROR_STOP=1 "$@"
}

wait_for_db() {
  local attempts="${1:-30}"
  local i=0
  until psql "$(admin_url)" -tAc 'SELECT 1' >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$attempts" ]; then
      echo "database not reachable at $(admin_url) after ${attempts} attempts" >&2
      return 1
    fi
    sleep 1
  done
}

repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}
