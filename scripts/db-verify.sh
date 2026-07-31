#!/usr/bin/env bash
# Schema integrity validation (§45.5.3).
#
# Runs after migrations and gates promotion. Asserts the structural guarantees that
# must hold for the platform to be safe, independently of the application test suite,
# so a broken schema is caught before anything is seeded or deployed onto it.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

wait_for_db
fail=0

check() {
  local label="$1" sql="$2" expected="${3:-0}"
  local actual
  actual="$(psql_db -tAc "$sql" | tr -d '[:space:]')"
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %-56s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-56s got %s, expected %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

report() {
  local label="$1" sql="$2"
  local rows
  rows="$(psql_db -tAc "$sql")"
  if [ -n "$(printf '%s' "$rows" | tr -d '[:space:]')" ]; then
    printf '  FAIL  %s:\n' "$label"
    printf '%s\n' "$rows" | sed 's/^/          /'
    fail=1
  else
    printf '  ok    %s\n' "$label"
  fi
}

EXPOSED="'cms','taxonomy','identity','accounts','workflow','knowledge','audit','assets','subscriptions','search','analytics'"

echo "==> schema integrity"

check "all 13 schemas present" \
  "SELECT count(*) FROM pg_namespace WHERE nspname IN
   ('cms','taxonomy','identity','workflow','assets','knowledge','search',
    'accounts','subscriptions','analytics','audit','private','public');" 13

check "required extensions installed" \
  "SELECT count(*) FROM pg_extension WHERE extname IN
   ('vector','pgcrypto','uuid-ossp','pg_trgm','unaccent');" 5

report "every table in an exposed schema has RLS enabled" \
  "SELECT n.nspname||'.'||c.relname
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname IN ($EXPOSED) AND NOT c.relrowsecurity
    ORDER BY 1;"

report "every table in an exposed schema has at least one policy" \
  "SELECT n.nspname||'.'||c.relname
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname IN ($EXPOSED)
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname=n.nspname AND p.tablename=c.relname)
    ORDER BY 1;"

report "every SECURITY DEFINER function pins search_path" \
  "SELECT n.nspname||'.'||p.proname
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('private','public','auth')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
                       WHERE cfg LIKE 'search_path=%')
    ORDER BY 1;"

report "every foreign key is index-covered on its leading column" \
  "SELECT conrelid::regclass||' ('||a.attname||')'
     FROM pg_constraint con
     JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1]
     JOIN pg_namespace n ON n.oid=con.connamespace
    WHERE con.contype='f' AND n.nspname IN ($EXPOSED)
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
         WHERE i.indrelid=con.conrelid AND i.indkey[0]=con.conkey[1])
    ORDER BY 1;"

report "every workflow transition is performable by some role" \
  "SELECT transition||' requires '||required_permission||' — '||problem
     FROM private.assert_transitions_reachable();"

report "the private schema is not exposed to the API roles" \
  "SELECT 'private is reachable by '||r
     FROM (VALUES ('anon'),('authenticated')) v(r)
    WHERE has_schema_privilege(r, 'private', 'USAGE');"

check "published-version immutability trigger present" \
  "SELECT count(*) FROM pg_trigger
    WHERE tgrelid='cms.content_versions'::regclass
      AND tgname='content_versions_immutable' AND NOT tgisinternal;" 1

check "audit append-only triggers present" \
  "SELECT count(*) FROM pg_trigger
    WHERE tgrelid='audit.events'::regclass AND NOT tgisinternal
      AND tgname IN ('events_no_update','events_no_delete');" 2

check "all fourteen roles seeded" "SELECT count(*) FROM identity.roles;" 14

report "no role holds both content.approve and content.publish" \
  "SELECT role_key||' holds both approve and publish'
     FROM identity.role_permissions
    WHERE permission_key IN ('content.approve','content.publish')
    GROUP BY role_key HAVING count(DISTINCT permission_key)=2;"

report "no orphan permissions (granted to no role)" \
  "SELECT p.key||' is granted to no role'
     FROM identity.permissions p
    WHERE NOT EXISTS (SELECT 1 FROM identity.role_permissions rp
                       WHERE rp.permission_key=p.key)
    ORDER BY 1;"

echo
if [ "$fail" -ne 0 ]; then
  echo "==> schema integrity FAILED" >&2
  exit 1
fi
echo "==> schema integrity passed"
