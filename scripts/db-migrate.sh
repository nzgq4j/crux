#!/usr/bin/env bash
# Apply every migration in supabase/migrations in timestamp order.
# Each file runs inside a transaction with ON_ERROR_STOP, so a failure leaves no
# partial migration behind.
set -euo pipefail

PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-crux}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

shopt -s nullglob
files=("$ROOT"/supabase/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "no migrations found" >&2
  exit 1
fi

for f in "${files[@]}"; do
  printf '==> %s ... ' "$(basename "$f")"
  if su postgres -c "psql -p $PGPORT -d $PGDATABASE -v ON_ERROR_STOP=1 -q --single-transaction -f $f" 2>/tmp/migrate.err; then
    echo "ok"
  else
    echo "FAILED"
    grep -v '^NOTICE' /tmp/migrate.err | head -20 >&2
    exit 1
  fi
done

echo "==> all migrations applied"
