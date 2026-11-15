#!/usr/bin/env bash
# Rebuilds the LOCAL test Supabase from the repo's SQL and runs the SQL tests.
#   npm run test:db
# Needs Docker and a running local stack: npx supabase --workdir test/supabase start
# It refuses to touch anything that is not 127.0.0.1 — it resets the whole database.
#
# Order mirrors a real upgrade of the live project:
#   1. the already-applied chain (schema … migration_012) → fresh database
#   2. test logins exist (like production) → new migrations' safety guards are exercised
#   3. new migrations (013+) applied one by one, then ALL re-applied (must be idempotent)
#   4. business fixtures, then supabase/tests/*.sql, each in a rolled-back transaction
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WD="$ROOT/test/supabase"
GEN="$WD/supabase/migrations"           # generated, gitignored
SQL="$ROOT/supabase"
DB_URL="${TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SUPABASE="npx -y supabase@3.1.0 --workdir $WD"
FIRST_NEW=13                            # migrations from this number on are not yet on production

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: TEST_DB_URL must point at 127.0.0.1 / localhost (got $DB_URL)"; exit 2 ;;
esac

num_of() { basename "$1" .sql | sed -E 's/migration_0*([0-9]+).*/\1/'; }
MIGS=$(ls "$SQL"/migration_*.sql | sort -V)

# 1. The applied chain as CLI migrations, in the README's order.
rm -rf "$GEN" && mkdir -p "$GEN"
cp "$SQL/studio5_schema.sql" "$GEN/20260101000001_studio5_schema.sql"
n=2
for f in $MIGS; do
  [ "$(num_of "$f")" -ge "$FIRST_NEW" ] && continue
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
$SUPABASE db reset --no-seed >/dev/null

export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)
fail=0
ok()  { echo "ok   $*"; }
bad() { echo "FAIL $*"; fail=1; }
# expect_fail <label> <expected text> <sql prelude> <migration file>: must error with that text and change nothing.
expect_fail() {
  local out
  if out="$( { echo "$3"; cat "$4"; } | "${PSQL[@]}" 2>&1 )"; then bad "$1 (it succeeded)";
  elif grep -q "$2" <<<"$out"; then ok "$1";
  else bad "$1 (wrong error)"; echo "$out" | sed 's/^/     /'; fi
}

# 2. Logins exist before the new migrations, as on production.
"${PSQL[@]}" -f "$SQL/seed_users.sql" >/dev/null

# 3. New migrations, with their guards exercised on the way.
for f in $MIGS; do
  num="$(num_of "$f")"; [ "$num" -lt "$FIRST_NEW" ] && continue
  case "$num" in
    13)
      expect_fail "013 refuses to run without studio5.staff_emails" "staff list would be empty" "" "$f"
      expect_fail "013 refuses an unknown email" "no confirmed login found for: nobody@test.local" \
        "set studio5.staff_emails = 'nobody@test.local';" "$f"
      { echo "set studio5.staff_emails = 'Owner@Test.local';"; cat "$f"; } | "${PSQL[@]}" >/dev/null
      if [ "$("${PSQL[@]}" -At -c "select string_agg(u.email, ',') from public.staff s join auth.users u on u.id = s.user_id")" = "owner@test.local" ]; then
        ok "013 enrols exactly the listed login"; else bad "013 enrolment"; fi
      ;;
    15)
      expect_fail "015 stops and names duplicate PO numbers" 'duplicate PO numbers must be fixed first: PO "DUP-1"' \
        "begin; insert into client (client_id, legal_name, display_name) values ('c9999999-0000-0000-0000-000000000009','Dup','Dup');
         insert into site (site_id, client_id, site_name) values ('59999999-0000-0000-0000-000000000009','c9999999-0000-0000-0000-000000000009','Dup site');
         insert into purchase_order (site_id, po_number, po_date, total_value_with_gst) values
           ('59999999-0000-0000-0000-000000000009','DUP-1','2026-09-01',1), ('59999999-0000-0000-0000-000000000009','dup-1 ','2026-09-02',1);" "$f"
      "${PSQL[@]}" -f "$f" >/dev/null
      [ "$("${PSQL[@]}" -At -c "select count(*) from site where site_name = 'Dup site'")" = "0" ] && ok "015 failed run left no data behind" || bad "015 failed run left data"
      ;;
    *) "${PSQL[@]}" -f "$f" >/dev/null ;;
  esac
  ok "apply $(basename "$f")"
done
# Idempotency: every new migration re-applies cleanly on top of itself (no setting needed now).
for f in $MIGS; do
  [ "$(num_of "$f")" -lt "$FIRST_NEW" ] && continue
  "${PSQL[@]}" -f "$f" >/dev/null && ok "re-apply $(basename "$f")" || bad "re-apply $(basename "$f")"
done

# 4. Business fixtures, then each test file inside its own rolled-back transaction.
"${PSQL[@]}" -f "$SQL/seed_test.sql" >/dev/null
for t in "$SQL"/tests/*.sql; do
  if out="$( { echo 'begin;'; cat "$t"; echo 'rollback;'; } | "${PSQL[@]}" 2>&1 )"; then ok "$(basename "$t")"
  else bad "$(basename "$t")"; echo "$out" | sed 's/^/     /'; fi
done
exit $fail
