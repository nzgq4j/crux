#!/usr/bin/env bash
# Verify the migration ledger against the files on disk. Exits non-zero if an applied
# migration has been modified or is missing, or if a failed attempt is recorded.
# Read-only; safe to run against production.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ROOT="$(repo_root)"; cd "$ROOT"; wait_for_db
DATABASE_URL="$DATABASE_URL" exec node scripts/lib/migrate.mjs verify
