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

echo "== user_api_keys is API-only =="
body=$(curl -s "$URL/rest/v1/user_api_keys?select=*" -H "apikey: $ANON")
case "$body" in
  "[]"|*'"42501"'*) ok "user_api_keys: anon reads nothing" ;;
  *'"42P01"'*)      bad "user_api_keys: table missing (0007_user_api_keys.sql not applied)" ;;
  *)                bad "user_api_keys: anon got: $(printf '%s' "$body" | head -c 80)" ;;
esac
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
s=$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/settings/api-key")
[ "$s" = "401" ] && ok "GET settings/api-key without token -> 401" || bad "GET settings/api-key without token -> $s (expected 401)"
fake_key="sk""-not-a-real-key-000000000000"
put_body='{"apiKey":"'"$fake_key"'"}'
s=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$API/v1/settings/api-key" \
    -H 'Content-Type: application/json' -d "$put_body")
[ "$s" = "401" ] && ok "PUT settings/api-key without token -> 401" || bad "PUT settings/api-key without token -> $s (expected 401)"

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

echo "== chat with someone else's conversation_id must fail =="
# Two throwaway users. Deleting a user cascades to its projects, conversations
# and messages. The API answers 404 before any OpenAI call, so this costs nothing.
SERVICE=$(get SUPABASE_SERVICE_ROLE_KEY)
created_users=()
cleanup_users() {
  for id in "${created_users[@]}"; do
    curl -s -o /dev/null -X DELETE "$URL/auth/v1/admin/users/$id" \
      -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  done
}
trap cleanup_users EXIT

first_id() { grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; }
service_insert() {
  curl -s -X POST "$URL/rest/v1/$1" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$2" | first_id
}
# Email confirmation is required on this project, so the admin API confirms it.
# Sets made_id and made_token. Not run in a subshell, so the cleanup list keeps
# every user that was created, even when a later step fails.
make_user() {
  made_id=""; made_token=""
  local email
  email="ship-test-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')@example.com"
  made_id=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" \
       -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
       -d '{"email":"'"$email"'","password":"'"$PASS"'","email_confirm":true}' | first_id)
  [ -n "$made_id" ] || return 1
  created_users+=("$made_id")
  made_token=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
       -H "Content-Type: application/json" -d '{"email":"'"$email"'","password":"'"$PASS"'"}' \
       | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  [ -n "$made_token" ]
}
message_count() {
  curl -s "$URL/rest/v1/chat_messages?select=id&conversation_id=eq.$1" \
    -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" | grep -o '"id"' | wc -l | tr -d ' '
}
chat_as() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/v1/projects/$2/chat" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -d '{"message":"ship-test","conversation_id":"'"$3"'"}'
}

conversation_check() {
  [ -n "$SERVICE" ] || { bad "SUPABASE_SERVICE_ROLE_KEY missing from $ENV_FILE"; return; }
  PASS="Pw-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
  make_user || { bad "could not create and sign in ship-test- user A"; return; }
  local a_id=$made_id a_token=$made_token
  make_user || { bad "could not create and sign in ship-test- user B"; return; }
  local b_id=$made_id b_token=$made_token

  local a_project b_project a_conv
  a_project=$(service_insert projects '{"name":"ship-test-a","user_id":"'"$a_id"'"}')
  b_project=$(service_insert projects '{"name":"ship-test-b","user_id":"'"$b_id"'"}')
  a_conv=$(service_insert chat_conversations \
    '{"project_id":"'"$a_project"'","user_id":"'"$a_id"'","title":"ship-test"}')
  if [ -z "$a_project" ] || [ -z "$b_project" ] || [ -z "$a_conv" ]; then
    bad "could not create the test projects and conversation"; return
  fi
  service_insert chat_messages \
    '{"conversation_id":"'"$a_conv"'","role":"user","content":"ship-test question"}' >/dev/null

  local before after s
  before=$(message_count "$a_conv")
  s=$(chat_as "$b_token" "$b_project" "$a_conv")
  [ "$s" = "404" ] && ok "B chats in B's project with A's conversation_id -> 404" \
                   || bad "B chats in B's project with A's conversation_id -> $s (expected 404)"
  after=$(message_count "$a_conv")
  [ "$before" = "$after" ] && ok "A's conversation unchanged ($after messages)" \
                           || bad "A's conversation changed: $before -> $after messages"
  s=$(chat_as "$a_token" "$b_project" "$a_conv")
  [ "$s" = "403" ] && ok "A chats in B's project -> 403" \
                   || bad "A chats in B's project -> $s (expected 403)"
}
conversation_check

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
