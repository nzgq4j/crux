#!/usr/bin/env bash
# Load deterministic demonstration content. Idempotent and safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT="$(repo_root)"
wait_for_db

echo "==> seeding $(db_name)"
psql_db -q -f "$ROOT/supabase/seed.sql"
echo "==> seed complete"
