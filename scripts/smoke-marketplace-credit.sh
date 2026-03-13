#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
READINESS_URL="${READINESS_URL:-${BASE_URL%/api}/health/ready}"
JQ_BIN="${JQ_BIN:-jq}"
REWARD="${REWARD:-10}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-marketplace-credit}"
mkdir -p "$TMP_DIR"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    exit 1
  }
}

api_json() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"

  local headers=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$body"
  else
    curl -fsS -X "$method" "${BASE_URL}${path}" "${headers[@]}"
  fi
}

fetch_balance() {
  local token="$1"
  api_json GET "/v1/credits/balance" "$token"
}

balance_field() {
  local json="$1"
  local field="$2"
  printf '%s' "$json" | "$JQ_BIN" -r ".${field}"
}

assert_json_field_eq() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local actual
  actual="$(printf '%s' "$json" | "$JQ_BIN" -r ".${field}")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected ${field}=${expected}, got ${actual}" >&2
    exit 1
  fi
}

assert_json_field_empty() {
  local json="$1"
  local field="$2"
  local actual
  actual="$(printf '%s' "$json" | "$JQ_BIN" -r ".${field} // empty")"
  if [[ -n "$actual" ]]; then
    echo "Expected ${field} to be empty, got ${actual}" >&2
    exit 1
  fi
}

assert_json_number_eq() {
  local json="$1"
  local field="$2"
  local expected="$3"
  if ! printf '%s' "$json" | "$JQ_BIN" -e --arg field "$field" --arg expected "$expected" '(.[$field] | tostring) == $expected' >/dev/null; then
    local actual
    actual="$(printf '%s' "$json" | "$JQ_BIN" -r --arg field "$field" '.[$field]')"
    echo "Expected ${field}=${expected}, got ${actual}" >&2
    exit 1
  fi
}

bootstrap_sessions() {
  local bootstrap_json
  bootstrap_json="$(api_json POST "/v1/agents/dev/bootstrap")"

  EMPLOYER_TOKEN="$(printf '%s' "$bootstrap_json" | "$JQ_BIN" -r '.sessions[] | select(.role == "employer") | .token')"
  WORKER_TOKEN="$(printf '%s' "$bootstrap_json" | "$JQ_BIN" -r '.sessions[] | select(.role == "worker") | .token')"
  EMPLOYER_AID="$(printf '%s' "$bootstrap_json" | "$JQ_BIN" -r '.sessions[] | select(.role == "employer") | .aid')"
  WORKER_AID="$(printf '%s' "$bootstrap_json" | "$JQ_BIN" -r '.sessions[] | select(.role == "worker") | .aid')"

  [[ -n "$EMPLOYER_TOKEN" && "$EMPLOYER_TOKEN" != "null" ]] || { echo "Failed to bootstrap employer token" >&2; exit 1; }
  [[ -n "$WORKER_TOKEN" && "$WORKER_TOKEN" != "null" ]] || { echo "Failed to bootstrap worker token" >&2; exit 1; }
}

create_task() {
  local suffix="$1"
  api_json POST "/v1/marketplace/tasks" "$EMPLOYER_TOKEN" "$(cat <<EOF
{"title":"${suffix}-$(date +%s)","description":"cross-service escrow smoke test","requirements":"none","reward":${REWARD},"employer_aid":"${EMPLOYER_AID}"}
EOF
)"
}

apply_task() {
  local task_id="$1"
  api_json POST "/v1/marketplace/tasks/${task_id}/apply" "$WORKER_TOKEN" "$(cat <<EOF
{"applicant_aid":"${WORKER_AID}","proposal":"smoke application"}
EOF
)"
}

assign_task() {
  local task_id="$1"
  local worker_aid_uri
  worker_aid_uri="$("$JQ_BIN" -rn --arg value "$WORKER_AID" '$value|@uri')"
  api_json POST "/v1/marketplace/tasks/${task_id}/assign?worker_aid=${worker_aid_uri}" "$EMPLOYER_TOKEN"
}

fetch_task() {
  local task_id="$1"
  api_json GET "/v1/marketplace/tasks/${task_id}" "$EMPLOYER_TOKEN"
}

cancel_task() {
  local task_id="$1"
  api_json POST "/v1/marketplace/tasks/${task_id}/cancel" "$EMPLOYER_TOKEN"
}

complete_task() {
  local task_id="$1"
  api_json POST "/v1/marketplace/tasks/${task_id}/complete" "$WORKER_TOKEN" "$(cat <<EOF
{"worker_aid":"${WORKER_AID}","result":"done"}
EOF
)"
}

accept_task() {
  local task_id="$1"
  api_json POST "/v1/marketplace/tasks/${task_id}/accept-completion" "$EMPLOYER_TOKEN"
}

require_tool curl
require_tool "$JQ_BIN"

log "Checking gateway health"
curl -fsS "${BASE_URL%/api}/health/ready" | "$JQ_BIN"

log "Checking gateway readiness"
if ! curl -fsS "$READINESS_URL" | "$JQ_BIN"; then
  echo "Readiness endpoint unavailable or not ready yet; continuing with bootstrap validation." >&2
fi

log "Bootstrapping seeded employer/worker sessions"
bootstrap_sessions

echo "Employer AID: $EMPLOYER_AID"
echo "Worker AID:   $WORKER_AID"

log "Loading initial balances"
EMPLOYER_BALANCE_INITIAL="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_INITIAL="$(fetch_balance "$WORKER_TOKEN")"
printf '%s\n' "$EMPLOYER_BALANCE_INITIAL" | "$JQ_BIN"
printf '%s\n' "$WORKER_BALANCE_INITIAL" | "$JQ_BIN"

INITIAL_EMPLOYER_BALANCE_VALUE="$(balance_field "$EMPLOYER_BALANCE_INITIAL" balance)"
INITIAL_WORKER_BALANCE_VALUE="$(balance_field "$WORKER_BALANCE_INITIAL" balance)"
EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE="$("$JQ_BIN" -n --arg value "$INITIAL_EMPLOYER_BALANCE_VALUE" --arg reward "$REWARD" '$value|tonumber - ($reward|tonumber)')"
EXPECTED_WORKER_BALANCE_AFTER_COMPLETE="$("$JQ_BIN" -n --arg value "$INITIAL_WORKER_BALANCE_VALUE" --arg reward "$REWARD" '$value|tonumber + ($reward|tonumber)')"
EXPECTED_EMPLOYER_BALANCE_AFTER_CANCEL="$EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE"
EXPECTED_WORKER_BALANCE_AFTER_CANCEL="$EXPECTED_WORKER_BALANCE_AFTER_COMPLETE"

log "Negative test: mismatched employer_aid should be rejected"
NEG_STATUS="$({
  curl -s -o "$TMP_DIR/neg-task.json" -w "%{http_code}" \
    -H "Authorization: Bearer $EMPLOYER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"smoke-mismatch-task","description":"should be rejected","requirements":"none","reward":10,"employer_aid":"agent://a2ahub/not-me"}' \
    "${BASE_URL}/v1/marketplace/tasks"
})"
[[ "$NEG_STATUS" == "403" ]] || { echo "Expected 403 for mismatched employer_aid" >&2; cat "$TMP_DIR/neg-task.json" >&2; exit 1; }

log "Scenario 1: assign -> submit -> accept"
TASK1_CREATE_RESP="$(create_task smoke-complete-task)"
printf '%s\n' "$TASK1_CREATE_RESP" | "$JQ_BIN"
TASK1_ID="$(printf '%s' "$TASK1_CREATE_RESP" | "$JQ_BIN" -r '.task_id')"
assert_json_field_eq "$TASK1_CREATE_RESP" status open
assert_json_field_empty "$TASK1_CREATE_RESP" escrow_id

TASK1_APPLY_RESP="$(apply_task "$TASK1_ID")"
printf '%s\n' "$TASK1_APPLY_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK1_APPLY_RESP" applicant_aid "$WORKER_AID"

TASK1_ASSIGN_RESP="$(assign_task "$TASK1_ID")"
printf '%s\n' "$TASK1_ASSIGN_RESP" | "$JQ_BIN"
TASK1_ESCROW_ID="$(printf '%s' "$TASK1_ASSIGN_RESP" | "$JQ_BIN" -r '.escrow_id // empty')"
assert_json_field_eq "$TASK1_ASSIGN_RESP" status in_progress
assert_json_field_eq "$TASK1_ASSIGN_RESP" worker_aid "$WORKER_AID"
[[ -n "$TASK1_ESCROW_ID" ]] || { echo "Expected escrow_id after assignment" >&2; exit 1; }

EMPLOYER_BALANCE_AFTER_ASSIGN_1="$(fetch_balance "$EMPLOYER_TOKEN")"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_ASSIGN_1" frozen_balance "$REWARD"

TASK1_COMPLETE_RESP="$(complete_task "$TASK1_ID")"
printf '%s\n' "$TASK1_COMPLETE_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK1_COMPLETE_RESP" status submitted

TASK1_FINAL="$(fetch_task "$TASK1_ID")"
printf '%s\n' "$TASK1_FINAL" | "$JQ_BIN"
assert_json_field_eq "$TASK1_FINAL" status submitted

EMPLOYER_BALANCE_AFTER_SUBMIT="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_AFTER_SUBMIT="$(fetch_balance "$WORKER_TOKEN")"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_SUBMIT" frozen_balance "$REWARD"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_SUBMIT" balance "$INITIAL_EMPLOYER_BALANCE_VALUE"
assert_json_number_eq "$WORKER_BALANCE_AFTER_SUBMIT" balance "$INITIAL_WORKER_BALANCE_VALUE"

TASK1_ACCEPT_RESP="$(accept_task "$TASK1_ID")"
printf '%s\n' "$TASK1_ACCEPT_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK1_ACCEPT_RESP" status completed

TASK1_FINAL="$(fetch_task "$TASK1_ID")"
printf '%s\n' "$TASK1_FINAL" | "$JQ_BIN"
assert_json_field_eq "$TASK1_FINAL" status completed

EMPLOYER_BALANCE_AFTER_COMPLETE="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_AFTER_COMPLETE="$(fetch_balance "$WORKER_TOKEN")"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_COMPLETE" frozen_balance "0"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_COMPLETE" balance "$EXPECTED_EMPLOYER_BALANCE_AFTER_COMPLETE"
assert_json_number_eq "$WORKER_BALANCE_AFTER_COMPLETE" balance "$EXPECTED_WORKER_BALANCE_AFTER_COMPLETE"

log "Scenario 2: assign -> cancel -> refund"
TASK2_CREATE_RESP="$(create_task smoke-cancel-task)"
TASK2_ID="$(printf '%s' "$TASK2_CREATE_RESP" | "$JQ_BIN" -r '.task_id')"
TASK2_APPLY_RESP="$(apply_task "$TASK2_ID")"
printf '%s\n' "$TASK2_APPLY_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK2_APPLY_RESP" applicant_aid "$WORKER_AID"
TASK2_ASSIGN_RESP="$(assign_task "$TASK2_ID")"
TASK2_ESCROW_ID="$(printf '%s' "$TASK2_ASSIGN_RESP" | "$JQ_BIN" -r '.escrow_id // empty')"
[[ -n "$TASK2_ESCROW_ID" ]] || { echo "Expected escrow_id after assignment" >&2; exit 1; }
TASK2_CANCEL_RESP="$(cancel_task "$TASK2_ID")"
printf '%s\n' "$TASK2_CANCEL_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK2_CANCEL_RESP" status cancelled

EMPLOYER_BALANCE_AFTER_CANCEL="$(fetch_balance "$EMPLOYER_TOKEN")"
WORKER_BALANCE_AFTER_CANCEL="$(fetch_balance "$WORKER_TOKEN")"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_CANCEL" frozen_balance "0"
assert_json_number_eq "$EMPLOYER_BALANCE_AFTER_CANCEL" balance "$EXPECTED_EMPLOYER_BALANCE_AFTER_CANCEL"
assert_json_number_eq "$WORKER_BALANCE_AFTER_CANCEL" balance "$EXPECTED_WORKER_BALANCE_AFTER_CANCEL"

log "Scenario 3: open -> cancel"
TASK3_CREATE_RESP="$(create_task smoke-open-cancel-task)"
TASK3_ID="$(printf '%s' "$TASK3_CREATE_RESP" | "$JQ_BIN" -r '.task_id')"
TASK3_CANCEL_RESP="$(cancel_task "$TASK3_ID")"
printf '%s\n' "$TASK3_CANCEL_RESP" | "$JQ_BIN"
assert_json_field_eq "$TASK3_CANCEL_RESP" status cancelled

log "Checking consistency diagnostics"
TASK_DIAGNOSTICS="$(api_json GET "/v1/marketplace/tasks/diagnostics/consistency" "$EMPLOYER_TOKEN")"
printf '%s\n' "$TASK_DIAGNOSTICS" | "$JQ_BIN"
DIAGNOSTIC_TOTAL_ISSUES="$(printf '%s' "$TASK_DIAGNOSTICS" | "$JQ_BIN" -r '.summary.total_issues')"
[[ "$DIAGNOSTIC_TOTAL_ISSUES" =~ ^[0-9]+$ ]] || { echo "Unexpected diagnostics payload" >&2; exit 1; }

echo
echo "== summary =="
echo "Employer AID: $EMPLOYER_AID"
echo "Worker AID:   $WORKER_AID"
echo "Complete task ID: $TASK1_ID"
echo "Complete escrow:  $TASK1_ESCROW_ID"
echo "Cancel task ID:   $TASK2_ID"
echo "Cancel escrow:    $TASK2_ESCROW_ID"
echo "Open-cancel task ID: $TASK3_ID"
echo "Diagnostics total issues: $DIAGNOSTIC_TOTAL_ISSUES"
echo
echo "Smoke test completed."
