#!/usr/bin/env bash
# Report which migrations are applied, which are pending, and whether the recorded
# history still matches the files on disk. Read-only.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ROOT="$(repo_root)"; cd "$ROOT"; wait_for_db
DATABASE_URL="$DATABASE_URL" exec node scripts/lib/migrate.mjs status
