#!/usr/bin/env bash
# Start a local PostgreSQL cluster for Crux development.
#
# Only needed when you are running PostgreSQL on the host yourself. In CI the
# database is a service container and this script is not used — db-migrate.sh and
# friends talk to DATABASE_URL either way.
#
# Crux targets Supabase in deployment. Locally the Supabase stack needs Docker; where
# Docker is unavailable this gives a plain PostgreSQL cluster with the same
# extensions, schemas, roles and policies, so migrations and the RLS suite exercise
# the identical security surface. See docs/assumptions.md A-002.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-$HOME/.pgdata}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-crux}"

as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

if [ ! -d "$PGDATA/base" ]; then
  echo "==> initialising cluster at $PGDATA"
  mkdir -p "$PGDATA"
  [ "$(id -u)" -eq 0 ] && chown -R postgres:postgres "$PGDATA"
  as_postgres "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
fi

# TCP is required: the scripts and the app connect through DATABASE_URL, not a socket.
as_postgres "sed -i \"s/^#*listen_addresses.*/listen_addresses = 'localhost'/\" $PGDATA/postgresql.conf"

mkdir -p /var/run/postgresql 2>/dev/null || true
[ "$(id -u)" -eq 0 ] && chown postgres:postgres /var/run/postgresql

if as_postgres "$PGBIN/pg_isready -p $PGPORT" >/dev/null 2>&1; then
  echo "==> already running on port $PGPORT"
else
  echo "==> starting cluster"
  as_postgres "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pglog -o '-p $PGPORT' -w start" >/dev/null
fi

if ! psql "postgresql://postgres@localhost:$PGPORT/postgres" -tAc \
     "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" | grep -q 1; then
  echo "==> creating database $PGDATABASE"
  psql "postgresql://postgres@localhost:$PGPORT/postgres" -qc "CREATE DATABASE \"$PGDATABASE\";"
fi

echo "==> ready: postgresql://postgres@localhost:$PGPORT/$PGDATABASE"
