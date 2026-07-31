#!/usr/bin/env bash
# Start a local PostgreSQL cluster for Crux development.
#
# In production Crux runs on Supabase. Locally the Supabase stack requires Docker;
# where Docker is unavailable this script provides a plain PostgreSQL cluster with
# the same extensions, schemas, roles and RLS policies, so migrations and the RLS
# test suite exercise the identical security surface. See docs/assumptions.md.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-$HOME/.pgdata}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-crux}"

if [ ! -d "$PGDATA/base" ]; then
  echo "==> initialising cluster at $PGDATA"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
fi

mkdir -p /var/run/postgresql
chown postgres:postgres /var/run/postgresql

if su postgres -c "$PGBIN/pg_isready -p $PGPORT" >/dev/null 2>&1; then
  echo "==> already running on port $PGPORT"
else
  echo "==> starting cluster"
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pglog -o '-p $PGPORT' -w start" >/dev/null
fi

if ! su postgres -c "psql -p $PGPORT -lqt" | cut -d'|' -f1 | grep -qw "$PGDATABASE"; then
  echo "==> creating database $PGDATABASE"
  su postgres -c "psql -p $PGPORT -d postgres -qc 'CREATE DATABASE $PGDATABASE;'"
fi

su postgres -c "$PGBIN/pg_isready -p $PGPORT"
echo "==> ready: postgresql://postgres@localhost:$PGPORT/$PGDATABASE"
