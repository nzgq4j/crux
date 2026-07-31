#!/usr/bin/env bash
# Verify no server-only value reached the client bundle (§45.5.1, Block 27).
#
# Run after `npm run build`. This is the check that catches the mistake `server-only`
# imports are meant to prevent but cannot catch when a value is inlined by hand.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE_DIR=".next/static"
if [ ! -d "$BUNDLE_DIR" ]; then
  echo "no client bundle at $BUNDLE_DIR — run npm run build first" >&2
  exit 1
fi

fail=0

# Names of variables that must never appear in client output. Their presence in the
# bundle means either the value or the lookup was shipped to the browser.
SERVER_ONLY=(
  SUPABASE_SECRET_KEY
  DATABASE_URL
  GOOGLE_OAUTH_CLIENT_SECRET
  CRON_SECRET
  WEBHOOK_SIGNING_SECRET
  EMAIL_API_KEY
  NEWSLETTER_API_KEY
  EMBEDDING_API_KEY
  AUTH_RATE_LIMIT_SALT
)

echo "==> scanning $BUNDLE_DIR for server-only identifiers"
for name in "${SERVER_ONLY[@]}"; do
  if grep -rq "$name" "$BUNDLE_DIR" 2>/dev/null; then
    echo "  LEAK  $name appears in the client bundle"
    grep -rl "$name" "$BUNDLE_DIR" | head -3 | sed 's/^/        /'
    fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "  ok    no server-only identifier in the client bundle"

# The privileged client must never be reachable from client code.
echo "==> checking privileged client is not bundled"
if grep -rq "asServiceRole" "$BUNDLE_DIR" 2>/dev/null; then
  echo "  LEAK  asServiceRole is present in the client bundle"
  fail=1
else
  echo "  ok    asServiceRole is absent from the client bundle"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "==> bundle scan FAILED" >&2
  exit 1
fi
echo "==> bundle scan passed"
