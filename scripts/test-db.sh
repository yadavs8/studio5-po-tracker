#!/usr/bin/env bash
# Rebuilds the LOCAL test Supabase from the repo's SQL and runs the SQL tests.
#   npm run test:db
# Needs Docker and a running local stack: npx supabase --workdir test/supabase start
# It refuses to touch anything that is not 127.0.0.1 — it resets the whole database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WD="$ROOT/test/supabase"
GEN="$WD/supabase/migrations"           # generated, gitignored
SQL="$ROOT/supabase"
DB_URL="${TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SUPABASE="npx -y supabase@3.1.0 --workdir $WD"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: TEST_DB_URL must point at 127.0.0.1 / localhost (got $DB_URL)"; exit 2 ;;
esac

# 1. Lay the applied chain out as CLI migrations, in the order the README gives.
rm -rf "$GEN" && mkdir -p "$GEN"
cp "$SQL/studio5_schema.sql" "$GEN/20260101000001_studio5_schema.sql"
n=2
for f in $(ls "$SQL"/migration_*.sql | sort -V); do
  base="$(basename "$f" .sql)"
  if [ "$base" = "migration_006" ]; then
    # Postgres cannot use a new enum value in the transaction that adds it: run 006 as two files.
    sed -n '1,/^-- STEP B/p' "$f" | sed '/^-- STEP B/d' > "$GEN/$(printf '20260101%06d' $n)_${base}_a.sql"; n=$((n+1))
    sed -n '/^-- STEP B/,$p' "$f" > "$GEN/$(printf '20260101%06d' $n)_${base}_b.sql"
  else
    cp "$f" "$GEN/$(printf '20260101%06d' $n)_${base}.sql"
  fi
  n=$((n+1))
done

# 2. Fresh database with that chain.
$SUPABASE db reset --no-seed >/dev/null

export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)

# 3. Idempotency: every migration from 013 on must re-apply cleanly on top of itself.
for f in $(ls "$SQL"/migration_*.sql | sort -V); do
  num="$(basename "$f" .sql | sed -E 's/migration_0*([0-9]+).*/\1/')"
  if [ "$num" -ge 13 ]; then
    "${PSQL[@]}" -f "$f" >/dev/null || { echo "FAIL re-apply $(basename "$f")"; exit 1; }
    echo "ok   re-apply $(basename "$f")"
  fi
done

# 4. Shared fixtures, then each test file inside its own rolled-back transaction.
"${PSQL[@]}" -f "$SQL/seed_test.sql" >/dev/null
fail=0
for t in "$SQL"/tests/*.sql; do
  if out="$( { echo 'begin;'; cat "$t"; echo 'rollback;'; } | "${PSQL[@]}" 2>&1 )"; then
    echo "ok   $(basename "$t")"
  else
    echo "FAIL $(basename "$t")"; echo "$out" | sed 's/^/     /'; fail=1
  fi
done
exit $fail
