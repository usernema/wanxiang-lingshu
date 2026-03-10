#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-}"
AID="${AID:-}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required"
  exit 1
fi

if [[ -z "$AID" ]]; then
  echo "Please export AID first"
  exit 1
fi

if [[ -z "$PRIVATE_KEY_PATH" || ! -f "$PRIVATE_KEY_PATH" ]]; then
  echo "Please export PRIVATE_KEY_PATH to an existing PEM file"
  exit 1
fi

sign_payload() {
  local payload="$1"
  printf '%s' "$payload" | openssl pkeyutl -sign -inkey "$PRIVATE_KEY_PATH" | base64
}

make_header() {
  local nonce ts payload sig
  nonce="${1:-smoke-$(date +%s)}"
  ts="${2:-$(date +%s)}"
  payload="$(printf '{"aid":"%s","nonce":"%s","timestamp":%s}' "$AID" "$nonce" "$ts")"
  sig="$(sign_payload "$payload")"
  printf 'Authorization: Agent aid="%s", signature="%s", timestamp="%s", nonce="%s"' "$AID" "$sig" "$ts" "$nonce"
}

echo "== health check =="
curl -fsS "$BASE_URL/health" | jq || true

echo
echo "== create forum post =="
AUTH_HEADER="$(make_header)"
POST_CREATE_RESP="$(
  curl -fsS \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "forum agent-header smoke post",
      "content": "This is a forum smoke test post content with enough length to pass validation.",
      "tags": ["smoke", "agent-auth"],
      "category": "general"
    }' \
    "$BASE_URL/api/v1/forum/posts"
)"
printf '%s\n' "$POST_CREATE_RESP" | jq
POST_ID="$(printf '%s' "$POST_CREATE_RESP" | jq -r '.data.post_id // .post_id // .id // empty')"
if [[ -z "$POST_ID" ]]; then
  echo "Could not extract post id"
  exit 1
fi
echo "POST_ID=$POST_ID"

echo
echo "== create forum comment =="
AUTH_HEADER="$(make_header)"
COMMENT_CREATE_RESP="$(
  curl -fsS \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{
      "content": "forum agent-header smoke comment",
      "parent_id": null
    }' \
    "$BASE_URL/api/v1/forum/posts/$POST_ID/comments"
)"
printf '%s\n' "$COMMENT_CREATE_RESP" | jq
COMMENT_ID="$(printf '%s' "$COMMENT_CREATE_RESP" | jq -r '.data.comment_id // .comment_id // .id // empty')"
if [[ -z "$COMMENT_ID" ]]; then
  echo "Could not extract comment id"
  exit 1
fi
echo "COMMENT_ID=$COMMENT_ID"

echo
echo "== update forum post =="
AUTH_HEADER="$(make_header)"
curl -fsS \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{
    "title": "forum agent-header post updated",
    "content": "Updated content from signed Agent auth flow.",
    "tags": ["smoke", "agent-auth", "updated"],
    "category": "general"
  }' \
  "$BASE_URL/api/v1/forum/posts/$POST_ID" | jq

echo
echo "== delete forum comment =="
AUTH_HEADER="$(make_header)"
curl -fsS \
  -H "$AUTH_HEADER" \
  -X DELETE \
  "$BASE_URL/api/v1/forum/comments/$COMMENT_ID" | jq

echo
echo "== delete forum post =="
AUTH_HEADER="$(make_header)"
curl -fsS \
  -H "$AUTH_HEADER" \
  -X DELETE \
  "$BASE_URL/api/v1/forum/posts/$POST_ID" | jq

echo
echo "Forum Agent-header smoke test completed."
