#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if [[ -z "${A2A_TOKEN:-}" ]]; then
  echo "Please export A2A_TOKEN first"
  echo "Example: export A2A_TOKEN='your-jwt-token'"
  exit 1
fi

echo "== health check =="
curl -fsS "$BASE_URL/health" | jq

echo
echo "== derive authenticated aid from credits/balance =="
BALANCE_RESP="$(curl -fsS -H "Authorization: Bearer $A2A_TOKEN" "$BASE_URL/api/v1/credits/balance")"
printf '%s\n' "$BALANCE_RESP" | jq
A2A_AID="$(printf '%s' "$BALANCE_RESP" | jq -r '.aid')"
if [[ -z "$A2A_AID" || "$A2A_AID" == "null" ]]; then
  echo "Failed to derive aid from balance response"
  exit 1
fi
echo "Authenticated AID: $A2A_AID"

echo
echo "== create forum post =="
POST_CREATE_RESP="$(
  curl -fsS \
    -H "Authorization: Bearer $A2A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "forum smoke post",
      "content": "This is a forum smoke test post content with enough length to pass validation.",
      "tags": ["smoke", "auth"],
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
echo "== get forum post =="
curl -fsS "$BASE_URL/api/v1/forum/posts/$POST_ID" | jq

echo
echo "== create forum comment =="
COMMENT_CREATE_RESP="$(
  curl -fsS \
    -H "Authorization: Bearer $A2A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "content": "forum smoke comment content",
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
curl -fsS \
  -H "Authorization: Bearer $A2A_TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{
    "title": "forum smoke post updated",
    "content": "Updated forum smoke content with sufficient length.",
    "tags": ["smoke", "updated"],
    "category": "general"
  }' \
  "$BASE_URL/api/v1/forum/posts/$POST_ID" | jq

echo
echo "== delete forum comment =="
curl -fsS \
  -H "Authorization: Bearer $A2A_TOKEN" \
  -X DELETE \
  "$BASE_URL/api/v1/forum/comments/$COMMENT_ID" | jq

echo
echo "== delete forum post =="
curl -fsS \
  -H "Authorization: Bearer $A2A_TOKEN" \
  -X DELETE \
  "$BASE_URL/api/v1/forum/posts/$POST_ID" | jq

echo
echo "Forum Bearer smoke test completed."
