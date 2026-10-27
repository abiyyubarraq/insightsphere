#!/usr/bin/env bash
# Dumps the live Supabase schema into supabase/migrations/0001_init.sql.
#
# Uses docker so nothing needs to be installed locally, and the connection
# string stays on your machine.
#
#   ./scripts/dump-schema.sh "postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres"
#
# Get that string from: Supabase dashboard -> Project Settings -> Database
#   -> Connection string -> URI   (tick "display connection pooler" OFF)
set -euo pipefail

URI="${1:-}"
[ -n "$URI" ] || { echo "usage: $0 <postgres-uri>"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p supabase/migrations
OUT=supabase/migrations/0001_init.sql

# pg_dump refuses to run against a newer server, so try newest first.
for tag in 17 16 15; do
  echo "trying postgres:$tag ..."
  if docker run --rm -i "postgres:$tag-alpine" pg_dump "$URI" \
       --schema-only --schema=public \
       --no-owner --no-privileges --no-comments \
       > "$OUT" 2>/tmp/pgdump.err; then
    echo "OK with postgres:$tag"
    echo "wrote $OUT ($(wc -l < "$OUT") lines)"
    exit 0
  fi
  echo "  failed: $(tail -2 /tmp/pgdump.err | tr '\n' ' ')"
done

rm -f "$OUT"
echo "All attempts failed. See the error above."
exit 1
