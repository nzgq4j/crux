#!/usr/bin/env bash
# Stop the local PostgreSQL cluster started by db-start.sh.
#
# Only needed when you are running PostgreSQL on the host yourself. In CI the database
# is a service container and this script is not used.
#
# Idempotent: stopping a cluster that is already stopped, or one that was never
# created, is a success rather than an error, so teardown paths may run more than once
# without special-casing.
#
# The defaults mirror db-start.sh. If you started the cluster with a PGDATA or PGPORT
# override, pass the same values here.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PGMODE="${PGMODE:-fast}"

as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

if [ ! -d "$PGDATA/base" ]; then
  echo "==> no cluster at $PGDATA"
  exit 0
fi

# pg_ctl status exits 0 when running, 3 when stopped, 4 when the data directory is
# unreadable. Only the running case has anything to do.
if ! as_postgres "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  echo "==> not running: $PGDATA"
  exit 0
fi

echo "==> stopping cluster at $PGDATA (-m $PGMODE)"
as_postgres "$PGBIN/pg_ctl -D $PGDATA -m $PGMODE -w stop" >/dev/null
echo "==> stopped"
