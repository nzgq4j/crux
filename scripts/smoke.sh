#!/usr/bin/env bash
# Route smoke test.
#
# Walks every public route against a running server and asserts:
#   - the expected status code
#   - the page is server-rendered (content present with no JavaScript executed)
#   - no draft content appears anywhere
#
# curl executes no JavaScript, so anything asserted here is in the initial HTML
# response — which is exactly the guarantee rules/frontend.md 8 requires of the
# report reading path.
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3100}"
fail=0
checked=0

# Strings that must never appear on a public page. The seed plants these in a draft
# item precisely so this test can prove they stay invisible.
DRAFT_MARKERS=(
  'Unreleased Sector Analysis'
  'DRAFT ONLY'
  'CONFIDENTIAL DRAFT'
)

get() { curl -sS -o /tmp/smoke.html -w '%{http_code}' --max-time 25 "$BASE$1" 2>/dev/null; }

route() {
  local path="$1" expect="${2:-200}" must_contain="${3:-}"
  checked=$((checked + 1))
  local code
  code="$(get "$path")"

  if [ "$code" != "$expect" ]; then
    printf '  FAIL  %-42s expected %s, got %s\n' "$path" "$expect" "$code"
    fail=1
    return
  fi

  if [ -n "$must_contain" ] && ! grep -qF "$must_contain" /tmp/smoke.html; then
    printf '  FAIL  %-42s %s missing "%s" from the server HTML\n' "$path" "$code" "$must_contain"
    fail=1
    return
  fi

  for marker in "${DRAFT_MARKERS[@]}"; do
    if grep -qF "$marker" /tmp/smoke.html; then
      printf '  LEAK  %-42s draft content "%s" is publicly visible\n' "$path" "$marker"
      fail=1
      return
    fi
  done

  printf '  ok    %-42s %s\n' "$path" "$code"
}

echo "==> smoke testing $BASE"

# Core surfaces. The third argument asserts real content reached the HTML, so a
# route that renders an empty shell fails rather than passing on its status code.
route /                                   200 'Research you can check'
route /insights                           200 'Everything we have published'
route /insights?type=report               200 'Research report'
route /research                           200 'Primary research and analysis'
route /research/collections               200 'Curated research'
route /industries                         200 'Research by sector'
route /industries/energy-utilities        200 'Energy and utilities'
route /capabilities                       200 'Research by capability'
route /capabilities/artificial-intelligence 200 'Artificial intelligence'
route /topics/ai-governance               200 'AI governance'
route /experts                            200 'Our researchers'
route /experts/h-okonkwo                  200 'Helen Okonkwo'
route /search                             200 'Search the research'
route '/search?q=resilience'              200 'results for'
route '/search?q=zzzznotarealterm'        200 'No results for'
route /about                              200 'How we publish'
route /account                            200 'Accounts are not available yet'

# Reading surfaces — the core of the product.
route /research/grid-investment-outlook-2026 200 'Grid Investment Outlook 2026'
route /research/ai-assurance-in-regulated-sectors 200 'Key findings'
route /articles/the-assurance-gap         200 'The Assurance Gap'

# Stable fragment identifiers must be emitted as section ids (§45.4.1), or a
# citation addressing a section cannot resolve.
checked=$((checked + 1))
get /research/grid-investment-outlook-2026 >/dev/null
if grep -q 'id="sec-context"' /tmp/smoke.html && grep -q 'id="key-findings"' /tmp/smoke.html; then
  printf '  ok    %-42s fragment ids emitted\n' '(fragment identifiers)'
else
  printf '  FAIL  %-42s module fragment ids missing from the HTML\n' '(fragment identifiers)'
  fail=1
fi

# A citation block must be present and addressed at the version.
checked=$((checked + 1))
if grep -q 'Cite this' /tmp/smoke.html && grep -qE 'version v-[0-9a-f]+' /tmp/smoke.html; then
  printf '  ok    %-42s version-addressed citation present\n' '(citation record)'
else
  printf '  FAIL  %-42s citation block missing or not version-addressed\n' '(citation record)'
  fail=1
fi

# Negative routes.
route /research/no-such-report            404
route /articles/no-such-article           404
route /experts/no-such-person             404
route /industries/no-such-industry        404

# The draft item must not be reachable by its own slug on any reading route.
route /research/unreleased-sector-analysis 404

echo
if [ "$fail" -ne 0 ]; then
  echo "==> smoke FAILED ($checked checks)" >&2
  exit 1
fi
echo "==> smoke passed ($checked checks)"
