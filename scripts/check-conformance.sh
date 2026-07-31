#!/usr/bin/env bash
# Architecture conformance checks.
#
# Structural rules from .claude/rules/ that a linter cannot express and a reviewer
# reliably forgets. Each check exists because this codebase, or its architecture,
# has a specific way of going wrong.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; fail=1; }
show() { printf '%s\n' "$1" | head -8 | sed 's/^/        /'; }

echo "==> architecture conformance"

# --- rules/frontend.md 20: the privileged client is never built client-side -----
if out=$(grep -rln "asServiceRole" src/app 2>/dev/null | xargs -r grep -l "^'use client'" 2>/dev/null); then
  bad "asServiceRole used in a Client Component"; show "$out"
else
  ok "privileged client is not used in any Client Component"
fi

# --- rules/security.md 2 / Block 27: privileged use must be enumerable ----------
count=$(grep -rn "asServiceRole(" src --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v 'src/lib/db/client.ts' | wc -l | tr -d ' ')
ok "privileged client call sites: ${count} (each must carry a reason, a permission check and an audit write)"

# --- rules/frontend.md 19: no server-only value in a NEXT_PUBLIC_ variable ------
if out=$(grep -rnE 'NEXT_PUBLIC_[A-Z_]*(SECRET|PRIVATE|PASSWORD|TOKEN|SERVICE_ROLE)' \
          src .env.example 2>/dev/null); then
  bad "a NEXT_PUBLIC_ variable names a secret"; show "$out"
else
  ok "no NEXT_PUBLIC_ variable names a secret"
fi

# --- rules/database.md 1: schema changes only through migrations ----------------
if out=$(grep -rnE '\b(CREATE|ALTER|DROP)\s+(TABLE|SCHEMA|POLICY|TYPE)\b' src \
          --include='*.ts' --include='*.tsx' 2>/dev/null); then
  bad "DDL found in application code — schema changes belong in a migration"; show "$out"
else
  ok "no DDL in application code"
fi

# --- rules/database.md 20: no uncontrolled dynamic SQL --------------------------
# Template literals interpolating into SQL keywords. Parameterised queries use $1.
if out=$(grep -rnE '(SELECT|INSERT|UPDATE|DELETE)[^`"'"'"']*\$\{' src \
          --include='*.ts' --include='*.tsx' 2>/dev/null); then
  bad "possible SQL string interpolation — use parameters"; show "$out"
else
  ok "no SQL string interpolation in application code"
fi

# --- rules/database.md 6: a new table must arrive with RLS ----------------------
missing=""
for f in supabase/migrations/*.sql; do
  # Tables created in this file, excluding IF NOT EXISTS re-declarations of
  # Supabase-managed objects in the auth schema.
  while read -r t; do
    [ -z "$t" ] && continue
    case "$t" in auth.*) continue;; esac
    grep -qiE "ALTER TABLE +$t +ENABLE ROW LEVEL SECURITY" "$f" || missing="$missing\n  $t (in $(basename "$f"))"
  done < <(grep -oiE 'CREATE TABLE (IF NOT EXISTS )?[a-z_]+\.[a-z_]+' "$f" \
            | sed -E 's/CREATE TABLE (IF NOT EXISTS )?//I')
done
if [ -n "$missing" ]; then
  # A table may legitimately enable RLS in a later migration; db-verify.sh is the
  # authority on the live database. This check flags the ones to look at.
  printf '  note  tables not enabling RLS in their own migration:'
  printf "$missing\n" | sed 's/^/      /'
  printf '        (db-verify.sh asserts the live database; this is advisory)\n'
else
  ok "every created table enables RLS in its own migration"
fi

# --- rules/documentation.md 8: .env.example holds names only --------------------
if [ -f .env.example ] && grep -qE '^[A-Z_]+=.+' .env.example; then
  bad ".env.example contains values"
else
  ok ".env.example contains names only"
fi

# --- Block 12: no third-party trade dress ---------------------------------------
# Matches USE of a third-party asset — a font-family declaration, an @import, a
# url() or a brand domain — not prose that merely names a brand. The design tokens
# legitimately record "deliberately not IBM's grid nor McKinsey's palette", and a
# check that flags its own compliance statement teaches people to ignore it.
if out=$(grep -rniE \
      "(font-family[^;]*(ibm[- ]?plex|helvetica now)|@import[^;]*(ibm|mckinsey)|url\([^)]*(ibm|mckinsey)|(src|href)=[\"'][^\"']*(ibm|mckinsey)\.com)" \
      src --include='*.ts' --include='*.tsx' --include='*.css' 2>/dev/null); then
  bad "third-party brand asset in use (font, import, url or domain)"; show "$out"
else
  ok "no third-party brand asset in use"
fi

# --- rules/content-modeling.md 26: the LLM citation limitation ------------------
#
# Two checks, because the obvious one does not work. Detecting "does this prose make
# a forbidden claim" by regex is unreliable: `.claude/` and `docs/` are full of the
# phrase precisely because they PROHIBIT it, and a proximity heuristic either flags
# every prohibition or is silenced by an unrelated "no" on a neighbouring line. A
# check that can be silenced by accident is worse than no check.
#
# So: (1) assert the limitation statement is PRESENT where Block 17 requires it —
# reliable, and the thing that actually matters; (2) scan only USER-FACING copy for
# an affirmative claim, where the phrase has no legitimate reason to appear at all.

if grep -rqiE 'cannot guarantee|do(es)? not (compel|guarantee)|not guarantee' README.md docs/assumptions.md 2>/dev/null; then
  ok "the LLM citation limitation statement is present in user-facing documentation"
else
  bad "the LLM citation limitation statement is missing (Block 17 requires it)"
fi

# User-facing copy only: src/ renders to the browser, so the phrase appearing there
# is a claim being made to a reader, not a rule being written about.
if out=$(grep -rniE '(guarantee|guarantees|ensures?).{0,60}(cited|citation|inclusion) by (an? )?(llm|large language|ai|search engine)' \
          src 2>/dev/null); then
  bad "user-facing copy claims technical measures guarantee LLM citation"; show "$out"
else
  ok "no affirmative LLM-citation claim in user-facing copy"
fi

# --- Block 22: every migration documents its reverse procedure ------------------
noreverse=""
for f in supabase/migrations/*.sql; do
  head -25 "$f" | grep -qiE 'reverse' || noreverse="$noreverse $(basename "$f")"
done
if [ -n "$noreverse" ]; then
  bad "migrations with no documented reverse procedure:"; show "$noreverse"
else
  ok "every migration documents its reverse procedure"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "==> conformance FAILED" >&2
  exit 1
fi
echo "==> conformance passed"
