#!/usr/bin/env bash
# Secret scan over the working tree and, where available, git history.
#
# A secret committed and later removed is still leaked, so history is scanned too.
# Deliberately narrow patterns: a scanner that cries wolf gets disabled, and a
# disabled scanner catches nothing.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

# Patterns matching secret VALUES, not variable names. `.env.example` legitimately
# contains `GOOGLE_OAUTH_CLIENT_SECRET=` with no value, and prose legitimately
# discusses `service_role`; neither is a leak.
PATTERNS=(
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'  # JWT
  'sb_secret_[A-Za-z0-9]{20,}'                                      # Supabase secret key
  'sbp_[a-f0-9]{40}'                                                # Supabase access token
  'ghp_[A-Za-z0-9]{36}'                                             # GitHub PAT
  'github_pat_[A-Za-z0-9_]{50,}'                                    # GitHub fine-grained PAT
  'sk-[A-Za-z0-9]{32,}'                                             # OpenAI-style key
  'AKIA[0-9A-Z]{16}'                                                # AWS access key id
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'                              # private key block
  'postgres(ql)?://[^:@/[:space:]]+:[^@/[:space:]]+@'               # DSN with a password
)

EXCLUDES=(
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
  --exclude-dir=coverage --exclude-dir=playwright-report --exclude-dir=test-results
  --exclude='*.lock' --exclude='package-lock.json'
  --exclude='scan-secrets.sh'
)

echo "==> scanning working tree"
for p in "${PATTERNS[@]}"; do
  if out=$(grep -rInE "$p" . "${EXCLUDES[@]}" 2>/dev/null); then
    # CI service containers use a literal postgres:postgres DSN; that is a well-known
    # throwaway credential in a workflow file, not a secret.
    filtered=$(printf '%s\n' "$out" | grep -v 'postgresql://postgres:postgres@localhost' || true)
    if [ -n "$filtered" ]; then
      echo "  LEAK  pattern: $p"
      printf '%s\n' "$filtered" | head -5 | sed 's/^/        /'
      fail=1
    fi
  fi
done
[ "$fail" -eq 0 ] && echo "  ok    no secret values in the working tree"

if [ -d .git ] && git rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> scanning git history"
  hist_fail=0
  for p in "${PATTERNS[@]}"; do
    if out=$(git log -p --all --no-color 2>/dev/null | grep -InE "^\+.*$p" 2>/dev/null); then
      filtered=$(printf '%s\n' "$out" | grep -v 'postgresql://postgres:postgres@localhost' || true)
      if [ -n "$filtered" ]; then
        echo "  LEAK  pattern in history: $p"
        printf '%s\n' "$filtered" | head -3 | sed 's/^/        /'
        hist_fail=1; fail=1
      fi
    fi
  done
  [ "$hist_fail" -eq 0 ] && echo "  ok    no secret values in git history"
fi

# .env.example must contain names only — never a value after the '='.
echo "==> checking .env.example"
if [ -f .env.example ]; then
  if vals=$(grep -E '^[A-Z_]+=.+' .env.example); then
    echo "  LEAK  .env.example contains values, not just names:"
    printf '%s\n' "$vals" | sed 's/^/        /'
    fail=1
  else
    echo "  ok    .env.example contains variable names only"
  fi
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "==> secret scan FAILED" >&2
  exit 1
fi
echo "==> secret scan passed"
