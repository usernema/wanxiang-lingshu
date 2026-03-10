#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-}"
AID="${AID:-}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required"
  exit 1
fi

if [[ -z "$AID" ]]; then
  echo "Please export AID first"
  echo "Example: export AID='agent://a2ahub/your-agent'"
  exit 1
fi

if [[ -z "$PRIVATE_KEY_PATH" ]]; then
  echo "Please export PRIVATE_KEY_PATH first"
  echo "Example: export PRIVATE_KEY_PATH='/path/to/private-key.pem'"
  exit 1
fi

if [[ ! -f "$PRIVATE_KEY_PATH" ]]; then
  echo "Private key file not found: $PRIVATE_KEY_PATH"
  exit 1
fi

sign_payload() {
  local payload="$1"
  printf '%s' "$payload" | openssl pkeyutl -sign -inkey "$PRIVATE_KEY_PATH" | base64
}

make_header() {
  local aid="$1"
  local nonce="$2"
  local ts="$3"
  local payload sig
  payload="$(printf '{"aid":"%s","nonce":"%s","timestamp":%s}' "$aid" "$nonce" "$ts")"
  sig="$(sign_payload "$payload")"
  printf 'Authorization: Agent aid="%s", signature="%s", timestamp="%s", nonce="%s"' "$aid" "$sig" "$ts" "$nonce"
}

echo "== health check =="
curl -fsS "$BASE_URL/health" | jq || true

echo
echo "== valid signed request to credits/balance =="
NONCE="smoke-$(date +%s)"
TS="$(date +%s)"
AUTH_HEADER="$(make_header "$AID" "$NONCE" "$TS")"
curl -i -H "$AUTH_HEADER" "$BASE_URL/api/v1/credits/balance"

echo
echo "== replay same nonce (should fail) =="
curl -i -H "$AUTH_HEADER" "$BASE_URL/api/v1/credits/balance" || true

echo
echo "== expired timestamp (should fail) =="
OLD_TS="$(( $(date +%s) - 1000 ))"
OLD_NONCE="old-$(date +%s)"
OLD_HEADER="$(make_header "$AID" "$OLD_NONCE" "$OLD_TS")"
curl -i -H "$OLD_HEADER" "$BASE_URL/api/v1/credits/balance" || true

echo
echo "== bad signature (should fail) =="
BAD_NONCE="bad-$(date +%s)"
BAD_TS="$(date +%s)"
curl -i \
  -H "Authorization: Agent aid=\"$AID\", signature=\"not-a-real-signature\", timestamp=\"$BAD_TS\", nonce=\"$BAD_NONCE\"" \
  "$BASE_URL/api/v1/credits/balance" || true

echo
echo "== marketplace mismatch test (should be 403) =="
MKT_NONCE="mkt-neg-$(date +%s)"
MKT_TS="$(date +%s)"
MKT_HEADER="$(make_header "$AID" "$MKT_NONCE" "$MKT_TS")"
curl -i \
  -H "$MKT_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "agent-header-mismatch-task",
    "description": "should be rejected",
    "requirements": "none",
    "reward": 10,
    "employer_aid": "agent://a2ahub/not-me"
  }' \
  "$BASE_URL/api/v1/marketplace/tasks" || true

echo
echo "== marketplace positive create task =="
POS_NONCE="mkt-ok-$(date +%s)"
POS_TS="$(date +%s)"
POS_HEADER="$(make_header "$AID" "$POS_NONCE" "$POS_TS")"
curl -s \
  -H "$POS_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"agent-header-task-$(date +%s)\",
    \"description\": \"cross-service smoke test\",
    \"requirements\": \"none\",
    \"reward\": 10,
    \"employer_aid\": \"$AID\"
  }" \
  "$BASE_URL/api/v1/marketplace/tasks" | jq
