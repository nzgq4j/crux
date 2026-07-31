#!/usr/bin/env bash
# Grants the test harness needs, and nothing more.
#
# tests/helpers/db.ts uses SET ROLE to impersonate anon / authenticated /
# service_role so the suite exercises the real RLS policies. The connecting user
# must be a member of those roles to do that.
#
# This is a TEST-HARNESS convenience, deliberately kept out of the migrations: on a
# real Supabase instance the connection already authenticates as the right role, and
# granting these memberships to the owner there would be pointless at best.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

wait_for_db

OWNER="$(psql_db -tAc 'SELECT current_user')"
echo "==> granting anon, authenticated, service_role to ${OWNER}"
psql_db -qc "GRANT anon, authenticated, service_role TO \"${OWNER}\";"
echo "==> test grants applied"
