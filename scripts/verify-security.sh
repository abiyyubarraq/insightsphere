#!/usr/bin/env bash
# Checks the access-control holes found in the September audit stay closed.
# Usage: ./scripts/verify-security.sh [path-to-env-file]   (default: dev/.env)
set -uo pipefail

ENV_FILE="${1:-dev/.env}"
[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE"; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
URL=$(get SUPABASE_URL); ANON=$(get VITE_SUPABASE_ANON_KEY)
API="${API_URL:-http://localhost:8000}"

pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }

echo "== S0: anon key must not see or write other users' rows =="
for t in projects project_files; do
  n=$(curl -s "$URL/rest/v1/$t?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
      | grep -o '"id"' | wc -l | tr -d ' ')
  [ "$n" = "0" ] && ok "$t: anon reads 0 rows" || bad "$t: anon reads $n rows (RLS off)"
done

# An all-null row can never be created. What matters is which layer stops it:
# RLS rejects it with 42501, while without RLS postgres gets as far as the
# not-null check and answers 23502, meaning the write itself was accepted.
#
# The anon key goes in the apikey header only. Sending it as a Bearer token too
# makes Supabase answer 401 with an empty body, which hides the code.
for t in projects project_files; do
  resp=$(curl -s -w '\n%{http_code}' -X POST "$URL/rest/v1/$t" -H "apikey: $ANON" \
         -H "Content-Type: application/json" -d '{}')
  status=$(printf '%s' "$resp" | tail -1)
  code=$(printf '%s' "$resp" | grep -o '"code":"[0-9A-Za-z]*"' | head -1 | cut -d'"' -f4)
  case "$code" in
    42501) ok  "$t: anon insert blocked by RLS (42501)" ;;
    235*)  bad "$t: anon insert ALLOWED (got $code, RLS off)" ;;
    *)     case "$status" in
             401|403) ok "$t: anon insert rejected ($status)" ;;
             *)       bad "$t: unexpected response (status $status, code '$code')" ;;
           esac ;;
  esac
done

echo "== quota tables and function are API-only =="
# RLS on with no policy: anon gets an empty list or a permission error, never rows.
for t in quota_tiers user_tiers usage_counters; do
  # A missing table also returns no rows, so only an empty list or a
  # permission error (42501) counts as a pass.
  body=$(curl -s "$URL/rest/v1/$t?select=*" -H "apikey: $ANON")
  case "$body" in
    "[]"|*'"42501"'*) ok "$t: anon reads nothing" ;;
    *'"42P01"'*)      bad "$t: table missing (0006_quota.sql not applied)" ;;
    *)                bad "$t: anon got: $(printf '%s' "$body" | head -c 80)" ;;
  esac
done
# 42501 = permission denied. A 404 (PGRST202) would mean the function is
# missing, which is not a pass.
resp=$(curl -s -w '\n%{http_code}' -X POST "$URL/rest/v1/rpc/consume_quota" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d '{"p_user_id":"00000000-0000-0000-0000-000000000000","p_kind":"chat","p_amount":1}')
s=$(printf '%s' "$resp" | tail -1)
case "$resp" in
  *'"42501"'*) ok "consume_quota: anon call rejected (42501)" ;;
  *)           bad "consume_quota: anon call -> $s (expected permission denied)" ;;
esac

echo "== every API route needs a token =="
s=$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/projects/00000000-0000-0000-0000-000000000000/query/suggestions")
[ "$s" = "401" ] && ok "suggestions without token -> 401" || bad "suggestions without token -> $s (expected 401)"

echo "== removed endpoints must be gone =="
for p in /v1/test/config /v1/test/dashboard /v1/test/rag-query; do
  s=$(curl -s -o /dev/null -w '%{http_code}' "$API$p")
  [ "$s" = "404" ] && ok "$p -> 404" || bad "$p -> $s (expected 404)"
done
for p in /v1/chat/stream /v1/documents/analyze; do
  s=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API$p" -H 'Content-Type: application/json' -d '{}')
  [ "$s" = "404" ] && ok "$p -> 404" || bad "$p -> $s (expected 404)"
done

echo "== admin bypass must be gone =="
s=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/v1/search/query" \
    -H 'Authorization: Bearer undefined' -H 'X-Admin-User-Id: 00000000-0000-0000-0000-000000000000' \
    -H 'Content-Type: application/json' -d '{"query":"x","project_id":"00000000-0000-0000-0000-000000000000"}')
[ "$s" = "401" ] && ok "Bearer undefined -> 401" || bad "Bearer undefined -> $s (expected 401)"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
