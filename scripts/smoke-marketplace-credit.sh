#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMPLOYER_TOKEN="${EMPLOYER_TOKEN:-${A2A_TOKEN:-}}"
WORKER_TOKEN="${WORKER_TOKEN:-}"
REWARD="${REWARD:-10}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-marketplace-credit}"
mkdir -p "$TMP_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if [[ -z "$EMPLOYER_TOKEN" ]]; then
  echo "Please export EMPLOYER_TOKEN first"
  echo "Example: export EMPLOYER_TOKEN='your-employer-jwt-token'"
  exit 1
fi

if [[ -z "$WORKER_TOKEN" ]]; then
  echo "Please export WORKER_TOKEN first"
  echo "Example: export WORKER_TOKEN='your-worker-jwt-token'"
  exit 1
fi

fetch_balance() {
  local token="$1"
  curl -fsS \
    -H "Authorization: Bearer $token" \
    "$BASE_URL/api/v1/credits/balance"
}

balance_field() {
  local json="$1"
  local field="$2"
  printf '%s' "$json" | jq -r ".${field}"
}

assert_json_field_eq() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local actual
  actual="$(printf '%s' "$json" | jq -r ".${field}")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected ${field}=${expected}, got ${actual}"
    exit 1
  fi
}

assert_json_field_empty() {
  local json="$1"
  local field="$2"
  local actual
  actual="$(printf '%s' "$json" | jq -r ".${field} // empty")"
  if [[ -n "$actual" ]]; then
    echo "Expected ${field} to be empty, got ${actual}"
    exit 1
  fi
}

assert_json_number_eq() {
  local json="$1"
  local field="$2"
  local expected="$3"
  if ! printf '%s' "$json" | jq -e --arg field "$field" --arg expected "$expected" '(.[$field] | tostring) == $expected' >/dev/null; then
    local actual
    actual="$(printf '%s' "$json" | jq -r --arg field "$field" '.[$field]')"
    echo "Expected ${field}=${expected}, got ${actual}"
    exit 1
  fi
}

create_task() {
  local suffix="$1"
  curl -fsS \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"${suffix}-$(date +%s)\",
      \"description\": \"cross-service escrow smoke test\",
      \"requirements\": \"none\",
      \"reward\": $REWARD,
      \"employer_aid\": \"$EMPLOYER_AID\"
    }" \
    "$BASE_URL/api/v1/marketplace/tasks"
}

assign_task() {
  local task_id="$1"
  local worker_aid_uri
  worker_aid_uri="$(jq -rn --arg value "$WORKER_AID" '$value|@uri')"
  curl -fsS \
    -X POST \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    "$BASE_URL/api/v1/marketplace/tasks/$task_id/assign?worker_aid=$worker_aid_uri"
}

fetch_task() {
  local task_id="$1"
  curl -fsS \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    "$BASE_URL/api/v1/marketplace/tasks/$task_id"
}

cancel_task() {
  local task_id="$1"
  curl -fsS \
    -X POST \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    "$BASE_URL/api/v1/marketplace/tasks/$task_id/cancel"
}

complete_task() {
  local task_id="$1"
  curl -fsS \
    -X POST \
    -H "Authorization: Bearer $WORKER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"worker_aid\": \"$WORKER_AID\",
      \"result\": \"done\"
    }" \
    "$BASE_URL/api/v1/marketplace/tasks/$task_id/complete"
}

echo "== health checks =="
curl -fsS "$BASE_URL/health" | jq

echo
echo "== employer balance =="
EMPLOYER_BALANCE_INITIAL="$(fetch_balance "$EMPLOYER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_INITIAL" | jq
EMPLOYER_AID="$(balance_field "$EMPLOYER_BALANCE_INITIAL" aid)"

if [[ -z "$EMPLOYER_AID" || "$EMPLOYER_AID" == "null" ]]; then
  echo "Failed to derive employer aid"
  exit 1
fi

echo
echo "== worker balance =="
WORKER_BALANCE_INITIAL="$(fetch_balance "$WORKER_TOKEN")"
printf '%s\n' "$WORKER_BALANCE_INITIAL" | jq
WORKER_AID="$(balance_field "$WORKER_BALANCE_INITIAL" aid)"

if [[ -z "$WORKER_AID" || "$WORKER_AID" == "null" ]]; then
  echo "Failed to derive worker aid"
  exit 1
fi

echo
echo "Employer AID: $EMPLOYER_AID"
echo "Worker AID:   $WORKER_AID"

echo
echo "== negative test: create task with mismatched employer_aid should be 403 =="
NEG_STATUS="$(
  curl -s -o "$TMP_DIR/neg-task.json" -w "%{http_code}" \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "smoke-mismatch-task",
      "description": "should be rejected",
      "requirements": "none",
      "reward": 10,
      "employer_aid": "agent://a2ahub/not-me"
    }' \
    "$BASE_URL/api/v1/marketplace/tasks"
)"

INITIAL_EMPLOYER_BALANCE_VALUE="$(balance_field "$EMPLOYER_BALANCE_INITIAL" balance)"
INITIAL_WORKER_BALANCE_VALUE="$(balance_field "$WORKER_BALANCE_INITIAL" balance)"

EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE="$(jq -n --arg value "$INITIAL_EMPLOYER_BALANCE_VALUE" --arg reward "$REWARD" '$value|tonumber - ($reward|tonumber)')"
EXPECTED_WORKER_BALANCE_AFTER_COMPLETE="$(jq -n --arg value "$INITIAL_WORKER_BALANCE_VALUE" --arg reward "$REWARD" '$value|tonumber + ($reward|tonumber)')"
EXPECTED_EMPLOYER_BALANCE_AFTER_CANCEL="$EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE"
EXPECTED_WORKER_BALANCE_AFTER_CANCEL="$EXPECTED_WORKER_BALANCE_AFTER_COMPLETE"

if [[ -z "$INITIAL_EMPLOYER_BALANCE_VALUE" || -z "$INITIAL_WORKER_BALANCE_VALUE" ]]; then
  echo "Failed to derive initial balances"
  exit 1
fi

if [[ "$EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE" == "null" || "$EXPECTED_WORKER_BALANCE_AFTER_COMPLETE" == "null" ]]; then
  echo "Failed to derive expected balances"
  exit 1
fi

echo "HTTP $NEG_STATUS"
jq . "$TMP_DIR/neg-task.json"
if [[ "$NEG_STATUS" != "403" ]]; then
  echo "Expected 403 for mismatched employer_aid"
  exit 1
fi

echo
echo "== scenario 1: assign -> complete =="
TASK1_CREATE_RESP="$(create_task smoke-complete-task)"
printf '%s\n' "$TASK1_CREATE_RESP" | jq
TASK1_ID="$(printf '%s' "$TASK1_CREATE_RESP" | jq -r '.task_id')"
assert_json_field_eq "$TASK1_CREATE_RESP" status open
assert_json_field_empty "$TASK1_CREATE_RESP" escrow_id

TASK1_ASSIGN_RESP="$(assign_task "$TASK1_ID")"
printf '%s\n' "$TASK1_ASSIGN_RESP" | jq
TASK1_ESCROW_ID="$(printf '%s' "$TASK1_ASSIGN_RESP" | jq -r '.escrow_id // empty')"
assert_json_field_eq "$TASK1_ASSIGN_RESP" status in_progress
assert_json_field_eq "$TASK1_ASSIGN_RESP" worker_aid "$WORKER_AID"
if [[ -z "$TASK1_ESCROW_ID" ]]; then
  echo "Expected escrow_id after assignment"
  exit 1
fi

EMPLOYER_BALANCE_AFTER_ASSIGN_1="$(fetch_balance "$EMPLOYER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_AFTER_ASSIGN_1" | jq
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_ASSIGN_1" frozen_balance "$REWARD"

NEG_COMPLETE_STATUS="$(
  curl -s -o "$TMP_DIR/neg-complete.json" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"worker_aid\": \"$WORKER_AID\",
      \"result\": \"done\"
    }" \
    "$BASE_URL/api/v1/marketplace/tasks/$TASK1_ID/complete"
)"
echo "HTTP $NEG_COMPLETE_STATUS"
jq . "$TMP_DIR/neg-complete.json"
if [[ "$NEG_COMPLETE_STATUS" != "403" ]]; then
  echo "Expected 403 when employer attempts worker completion endpoint"
  exit 1
fi

TASK1_COMPLETE_RESP="$(complete_task "$TASK1_ID")"
printf '%s\n' "$TASK1_COMPLETE_RESP" | jq
assert_json_field_eq "$TASK1_COMPLETE_RESP" status completed

TASK1_FINAL="$(fetch_task "$TASK1_ID")"
printf '%s\n' "$TASK1_FINAL" | jq
assert_json_field_eq "$TASK1_FINAL" status completed
COMPLETED_AT="$(printf '%s' "$TASK1_FINAL" | jq -r '.completed_at // empty')"
if [[ -z "$COMPLETED_AT" ]]; then
  echo "Expected completed_at to be set"
  exit 1
fi

EMPLOYER_BALANCE_AFTER_COMPLETE="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_AFTER_COMPLETE="$(fetch_balance "$WORKER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_AFTER_COMPLETE" | jq
printf '%s\n' "$WORKER_BALANCE_AFTER_COMPLETE" | jq
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_COMPLETE" frozen_balance "0"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_COMPLETE" balance "$EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE"
assert_json_number_eq "$WORKER_BALANCE_AFTER_COMPLETE" balance "$EXPECTED_WORKER_BALANCE_AFTER_COMPLETE"

echo
echo "== scenario 2: assign -> cancel -> refund =="
TASK2_CREATE_RESP="$(create_task smoke-cancel-task)"
printf '%s\n' "$TASK2_CREATE_RESP" | jq
TASK2_ID="$(printf '%s' "$TASK2_CREATE_RESP" | jq -r '.task_id')"
assert_json_field_eq "$TASK2_CREATE_RESP" status open
assert_json_field_empty "$TASK2_CREATE_RESP" escrow_id

TASK2_ASSIGN_RESP="$(assign_task "$TASK2_ID")"
printf '%s\n' "$TASK2_ASSIGN_RESP" | jq
TASK2_ESCROW_ID="$(printf '%s' "$TASK2_ASSIGN_RESP" | jq -r '.escrow_id // empty')"
assert_json_field_eq "$TASK2_ASSIGN_RESP" status in_progress
if [[ -z "$TASK2_ESCROW_ID" ]]; then
  echo "Expected escrow_id after assignment"
  exit 1
fi

EMPLOYER_BALANCE_AFTER_ASSIGN_2="$(fetch_balance "$EMPLOYER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_AFTER_ASSIGN_2" | jq
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_ASSIGN_2" frozen_balance "$REWARD"

NEG_CANCEL_STATUS="$(
  curl -s -o "$TMP_DIR/neg-cancel.json" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $WORKER_TOKEN" \
    "$BASE_URL/api/v1/marketplace/tasks/$TASK2_ID/cancel"
)"
echo "HTTP $NEG_CANCEL_STATUS"
jq . "$TMP_DIR/neg-cancel.json"
if [[ "$NEG_CANCEL_STATUS" != "403" ]]; then
  echo "Expected 403 when worker attempts employer cancel endpoint"
  exit 1
fi

TASK2_CANCEL_RESP="$(cancel_task "$TASK2_ID")"
printf '%s\n' "$TASK2_CANCEL_RESP" | jq
assert_json_field_eq "$TASK2_CANCEL_RESP" status cancelled
CANCELLED_AT="$(printf '%s' "$TASK2_CANCEL_RESP" | jq -r '.cancelled_at // empty')"
if [[ -z "$CANCELLED_AT" ]]; then
  echo "Expected cancelled_at to be set"
  exit 1
fi

TASK2_FINAL="$(fetch_task "$TASK2_ID")"
printf '%s\n' "$TASK2_FINAL" | jq
assert_json_field_eq "$TASK2_FINAL" status cancelled

EMPLOYER_BALANCE_AFTER_CANCEL="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_AFTER_CANCEL="$(fetch_balance "$WORKER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_AFTER_CANCEL" | jq
printf '%s\n' "$WORKER_BALANCE_AFTER_CANCEL" | jq
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_CANCEL" frozen_balance "0"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_CANCEL" balance "$EXPECTED_EMPLOYER_BALANCE_AFTER_CANCEL"
assert_json_number_eq "$WORKER_BALANCE_AFTER_CANCEL" balance "$EXPECTED_WORKER_BALANCE_AFTER_CANCEL"

echo
echo "== summary =="
echo "Employer AID: $EMPLOYER_AID"
echo "Worker AID:   $WORKER_AID"
echo "Complete task ID: $TASK1_ID"
echo "Complete escrow:  $TASK1_ESCROW_ID"
echo "Cancel task ID:   $TASK2_ID"
echo "Cancel escrow:    $TASK2_ESCROW_ID"
echo "Employer initial balance: $(balance_field "$EMPLOYER_BALANCE_INITIAL" balance)"
echo "Employer initial frozen:  $(balance_field "$EMPLOYER_BALANCE_INITIAL" frozen_balance)"
echo "Employer final balance:   $(balance_field "$EMPLOYER_BALANCE_AFTER_CANCEL" balance)"
echo "Employer final frozen:    $(balance_field "$EMPLOYER_BALANCE_AFTER_CANCEL" frozen_balance)"
echo "Worker initial balance:   $(balance_field "$WORKER_BALANCE_INITIAL" balance)"
echo "Worker final balance:     $(balance_field "$WORKER_BALANCE_AFTER_CANCEL" balance)"

echo
echo "Smoke test completed."