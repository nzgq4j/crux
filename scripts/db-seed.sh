#!/usr/bin/env bash
# Load deterministic demonstration content. Idempotent and safe to re-run.
set -euo pipefail

PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-crux}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> seeding $PGDATABASE"
su postgres -c "psql -p $PGPORT -d $PGDATABASE -v ON_ERROR_STOP=1 -q -f $ROOT/supabase/seed.sql"
echo "==> seed complete"
