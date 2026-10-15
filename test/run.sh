#!/usr/bin/env bash
# בודק את המיגרציה ואת ההרשאות על Postgres מקומי ריק.
# שימוש: PGHOST=... PGPORT=... PGUSER=postgres test/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=orders_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d postgres -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists service_role" 2>/dev/null || true
psql -q -v ON_ERROR_STOP=1 -d $DB -f test/supabase_stub.sql
psql -q -v ON_ERROR_STOP=1 -d $DB -f supabase/migrations/*.sql
psql -v ON_ERROR_STOP=1 -d $DB -f test/flow_test.sql
