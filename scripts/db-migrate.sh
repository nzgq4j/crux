#!/usr/bin/env bash
# Apply unapplied migrations to the database named by DATABASE_URL.
#
# Non-destructive and safe against a persistent database. A ledger in
# private.schema_migrations records what has been applied; only missing migrations run;
# a migration edited after it was applied is a hard failure rather than a silent
# divergence between environments.
#
# An already-current database exits 0. Running this twice is expected in a deployment
# pipeline, and the previous behaviour — replay everything, fail on the first
# CREATE TABLE — made that impossible.
#
# The logic lives in scripts/lib/migrate.mjs so the test suite drives the same code an
# operator does. This wrapper supplies the DATABASE_URL default the other database
# scripts share, and waits for the server the same way they do.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT="$(repo_root)"
cd "$ROOT"
wait_for_db

DATABASE_URL="$DATABASE_URL" exec node scripts/lib/migrate.mjs migrate
