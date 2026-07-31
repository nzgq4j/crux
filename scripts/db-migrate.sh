#!/usr/bin/env bash
# Apply every migration in supabase/migrations in timestamp order.
#
# Each file runs in a single transaction with ON_ERROR_STOP, so a failure leaves no
# partial migration behind. Idempotent only to the extent the migrations themselves
# are — use db-reset.sh for a clean run.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT="$(repo_root)"
wait_for_db

shopt -s nullglob
files=("$ROOT"/supabase/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "no migrations found in $ROOT/supabase/migrations" >&2
  exit 1
fi

for f in "${files[@]}"; do
  printf '==> %-52s ' "$(basename "$f")"
  if err=$(psql_db -q --single-transaction -f "$f" 2>&1 >/dev/null); then
    echo "ok"
  else
    echo "FAILED"
    printf '%s\n' "$err" | grep -v '^NOTICE' | head -30 >&2
    exit 1
  fi
done

echo "==> ${#files[@]} migrations applied"
