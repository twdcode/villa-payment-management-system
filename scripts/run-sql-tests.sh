#!/usr/bin/env bash
# Runs the SQL acceptance tests in drizzle/tests/ against a throwaway Postgres in
# Docker: every migration replayed from scratch, then the worked examples from
# docs/INTEREST-EXAMPLES.md asserted directly against the real views and
# record_collection() — not the TypeScript mirror in src/lib/finance/calculations.ts.
#
# Requires Docker. Leaves nothing running: the container is removed on exit whether
# the tests pass or fail.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="juniper-sql-tests-$$"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting throwaway Postgres..."
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

run_sql() {
  docker cp "$1" "$CONTAINER:/tmp/current.sql" >/dev/null
  docker exec -i "$CONTAINER" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/current.sql
}

echo "Applying Supabase auth stub..."
run_sql "$ROOT/drizzle/tests/supabase-stub.sql" >/dev/null

echo "Replaying all migrations from scratch..."
for f in "$ROOT"/drizzle/0*.sql; do
  echo "  applying $(basename "$f")"
  run_sql "$f" >/dev/null
done

echo
echo "Running interest example assertions (E1-E7)..."
run_sql "$ROOT/drizzle/tests/interest_examples.sql"

echo
echo "All SQL acceptance tests passed."
