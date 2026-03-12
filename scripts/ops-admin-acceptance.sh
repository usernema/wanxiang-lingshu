#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost/api}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-${BASE_URL%/api}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
LABEL_PREFIX="${LABEL_PREFIX:-ops-admin}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-admin-acceptance}"
JQ_BIN="${JQ_BIN:-jq}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
CURL_INSECURE="${CURL_INSECURE:-false}"
CURL_RESOLVE="${CURL_RESOLVE:-}"
SKIP_CLEANUP="${SKIP_CLEANUP:-false}"

mkdir -p "$TMP_DIR"

CURL_ARGS=()
if [[ "$CURL_INSECURE" == "true" ]]; then
  CURL_ARGS+=(-k)
fi
if [[ -n "$CURL_RESOLVE" ]]; then
  IFS=',' read -r -a resolve_entries <<<"$CURL_RESOLVE"
  for entry in "${resolve_entries[@]}"; do
    trimmed="${entry#${entry%%[![:space:]]*}}"
    trimmed="${trimmed%${trimmed##*[![:space:]]}}"
    if [[ -n "$trimmed" ]]; then
      CURL_ARGS+=(--resolve "$trimmed")
    fi
  done
fi

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    exit 1
  }
}

curl_fail() {
  if [[ ${#CURL_ARGS[@]} -gt 0 ]]; then
    curl -fsS "$@" "${CURL_ARGS[@]}"
  else
    curl -fsS "$@"
  fi
}

curl_soft() {
  if [[ ${#CURL_ARGS[@]} -gt 0 ]]; then
    curl -sS "$@" "${CURL_ARGS[@]}"
  else
    curl -sS "$@"
  fi
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
    curl_fail -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$body"
  else
    curl_fail -X "$method" "${BASE_URL}${path}" "${headers[@]}"
  fi
}

admin_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local headers=(-H "Content-Type: application/json" -H "X-Admin-Token: ${ADMIN_TOKEN}")
  if [[ -n "$body" ]]; then
    curl_fail -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$body"
  else
    curl_fail -X "$method" "${BASE_URL}${path}" "${headers[@]}"
  fi
}

api_json_status() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local response_file="${TMP_DIR}/status-$(date +%s)-$RANDOM.json"
  local headers=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$body" ]]; then
    RESPONSE_STATUS="$(curl_soft -o "$response_file" -w '%{http_code}' -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$body")"
  else
    RESPONSE_STATUS="$(curl_soft -o "$response_file" -w '%{http_code}' -X "$method" "${BASE_URL}${path}" "${headers[@]}")"
  fi
  RESPONSE_BODY="$(cat "$response_file")"
}

urlencode() {
  printf '%s' "$1" | "$JQ_BIN" -sRr @uri
}

random_suffix() {
  "$PYTHON_BIN" - <<'PY'
import secrets
print(secrets.token_urlsafe(6))
PY
}

sign_message() {
  local message="$1"
  local private_key_file="$2"
  "$PYTHON_BIN" - <<'PY' "$message" "$private_key_file"
import base64, sys
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

message = sys.argv[1].encode()
with open(sys.argv[2], 'rb') as f:
    key = load_pem_private_key(f.read(), password=None)
assert isinstance(key, Ed25519PrivateKey)
signature = key.sign(message)
print(base64.b64encode(signature).decode())
PY
}

create_keypair() {
  local prefix="$1"
  "$PYTHON_BIN" - <<'PY' "$prefix" "$TMP_DIR"
import os, sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

prefix = sys.argv[1]
outdir = sys.argv[2]
key = Ed25519PrivateKey.generate()
pub = key.public_key()
priv_path = os.path.join(outdir, f"{prefix}-private.pem")
pub_path = os.path.join(outdir, f"{prefix}-public.pem")
with open(priv_path, 'wb') as f:
    f.write(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ))
with open(pub_path, 'wb') as f:
    f.write(pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ))
print(priv_path)
print(pub_path)
PY
}

issue_login_challenge() {
  local aid="$1"
  api_json POST "/v1/agents/challenge" "" "{\"aid\":\"${aid}\"}"
}

login_with_key() {
  local aid="$1"
  local private_key="$2"
  local challenge_resp nonce timestamp message signature login_resp
  challenge_resp="$(issue_login_challenge "$aid")"
  nonce="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.nonce')"
  timestamp="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.timestamp')"
  message="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.message')"
  signature="$(sign_message "$message" "$private_key")"
  login_resp="$(api_json POST "/v1/agents/login" "" "{\"aid\":\"${aid}\",\"timestamp\":${timestamp},\"nonce\":\"${nonce}\",\"signature\":\"${signature}\"}")"
  printf '%s' "$login_resp" | "$JQ_BIN" -r '.token'
}

login_with_key_expect_failure() {
  local aid="$1"
  local private_key="$2"
  local challenge_resp nonce timestamp message signature
  challenge_resp="$(issue_login_challenge "$aid")"
  nonce="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.nonce')"
  timestamp="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.timestamp')"
  message="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.message')"
  signature="$(sign_message "$message" "$private_key")"
  api_json_status POST "/v1/agents/login" "" "{\"aid\":\"${aid}\",\"timestamp\":${timestamp},\"nonce\":\"${nonce}\",\"signature\":\"${signature}\"}"
}

register_and_login() {
  local prefix="$1"
  local role_model="$2"
  local paths private_key_path public_key_path public_key register_resp aid token

  paths="$(create_keypair "$prefix")"
  private_key_path="$(printf '%s\n' "$paths" | sed -n '1p')"
  public_key_path="$(printf '%s\n' "$paths" | sed -n '2p')"
  public_key="$(cat "$public_key_path")"

  register_resp="$(api_json POST "/v1/agents/register" "" "$(cat <<EOF
{"model":"${role_model}","provider":"openclaw","capabilities":["planning","forum","marketplace"],"public_key":$(printf '%s' "$public_key" | "$JQ_BIN" -Rs .),"proof_of_capability":{"challenge":"ops-admin-acceptance","response":"self-attested"}}
EOF
)")"
  aid="$(printf '%s' "$register_resp" | "$JQ_BIN" -r '.aid')"
  token="$(login_with_key "$aid" "$private_key_path")"

  echo "$aid"
  echo "$token"
  echo "$private_key_path"
}

require_tool curl
require_tool "$JQ_BIN"
require_tool "$PYTHON_BIN"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required" >&2
  exit 1
fi

"$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import cryptography
PY

cleanup() {
  local exit_code=$?
  set +e
  if [[ "${SKIP_CLEANUP}" != "true" ]]; then
    if [[ -n "${TASK_ID:-}" && -n "${EMPLOYER_TOKEN:-}" ]]; then
      api_json_status POST "/v1/marketplace/tasks/${TASK_ID}/cancel" "${EMPLOYER_TOKEN}" ""
    fi
    if [[ -n "${WORKER_AID:-}" ]]; then
      admin_json PATCH "/v1/admin/agents/status" "{\"aid\":\"${WORKER_AID}\",\"status\":\"suspended\"}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${EMPLOYER_AID:-}" ]]; then
      admin_json PATCH "/v1/admin/agents/status" "{\"aid\":\"${EMPLOYER_AID}\",\"status\":\"suspended\"}" >/dev/null 2>&1 || true
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

RUN_ID="$(date +%Y%m%d%H%M%S)-$$-$(random_suffix)"
EMPLOYER_MODEL="${LABEL_PREFIX}-employer-${RUN_ID}"
WORKER_MODEL="${LABEL_PREFIX}-worker-${RUN_ID}"
TASK_TITLE="Ops admin acceptance ${RUN_ID}"
TASK_PROPOSAL="我可以处理这个任务，作为后台申请流转验收。"

echo "[1/8] Checking public readiness"
curl_fail "${HEALTH_BASE_URL}/health/ready" | "$JQ_BIN" >/dev/null

echo "[2/8] Registering and logging in employer"
employer_data="$(register_and_login employer "$EMPLOYER_MODEL")"
EMPLOYER_AID="$(printf '%s\n' "$employer_data" | sed -n '1p')"
EMPLOYER_TOKEN="$(printf '%s\n' "$employer_data" | sed -n '2p')"
EMPLOYER_PRIVATE_KEY="$(printf '%s\n' "$employer_data" | sed -n '3p')"

echo "[3/8] Registering and logging in worker"
worker_data="$(register_and_login worker "$WORKER_MODEL")"
WORKER_AID="$(printf '%s\n' "$worker_data" | sed -n '1p')"
WORKER_TOKEN="$(printf '%s\n' "$worker_data" | sed -n '2p')"
WORKER_PRIVATE_KEY="$(printf '%s\n' "$worker_data" | sed -n '3p')"

echo "[4/8] Verifying admin can suspend and recover a normal agent"
admin_json PATCH "/v1/admin/agents/status" "{\"aid\":\"${WORKER_AID}\",\"status\":\"suspended\"}" >/dev/null
login_with_key_expect_failure "$WORKER_AID" "$WORKER_PRIVATE_KEY"
if [[ "$RESPONSE_STATUS" == "200" ]]; then
  echo "Expected suspended worker login to fail, but it succeeded" >&2
  exit 1
fi
if ! printf '%s' "$RESPONSE_BODY" | "$JQ_BIN" -re '.error | strings | test("not active")' >/dev/null 2>&1; then
  echo "Expected suspended worker login error to mention not active" >&2
  printf '%s\n' "$RESPONSE_BODY" >&2
  exit 1
fi
admin_json PATCH "/v1/admin/agents/status" "{\"aid\":\"${WORKER_AID}\",\"status\":\"active\"}" >/dev/null
WORKER_TOKEN="$(login_with_key "$WORKER_AID" "$WORKER_PRIVATE_KEY")"

echo "[5/8] Creating live marketplace task and submitting application"
TASK_RESP="$(api_json POST "/v1/marketplace/tasks" "$EMPLOYER_TOKEN" "{\"title\":\"${TASK_TITLE}\",\"description\":\"线上运营后台真实流转验收任务。\",\"requirements\":\"验证后台筛选、申请查看与状态操作。\",\"reward\":9,\"employer_aid\":\"${EMPLOYER_AID}\"}")"
TASK_ID="$(printf '%s' "$TASK_RESP" | "$JQ_BIN" -r '.task_id')"
api_json POST "/v1/marketplace/tasks/${TASK_ID}/apply" "$WORKER_TOKEN" "{\"applicant_aid\":\"${WORKER_AID}\",\"proposal\":\"${TASK_PROPOSAL}\"}" >/dev/null

echo "[6/8] Verifying admin task list and application list"
ADMIN_TASKS="$(admin_json GET "/v1/admin/marketplace/tasks?limit=100&offset=0&employer_aid=$(urlencode "$EMPLOYER_AID")")"
ADMIN_TASK_MATCH="$(printf '%s' "$ADMIN_TASKS" | "$JQ_BIN" -r --arg task_id "$TASK_ID" '.data.items[]? | select(.task_id == $task_id) | .task_id' | head -n 1)"
if [[ "$ADMIN_TASK_MATCH" != "$TASK_ID" ]]; then
  echo "Admin task list did not return the created task" >&2
  exit 1
fi

ADMIN_APPS="$(admin_json GET "/v1/admin/marketplace/tasks/${TASK_ID}/applications")"
ADMIN_APP_COUNT="$(printf '%s' "$ADMIN_APPS" | "$JQ_BIN" -r '.data | length')"
ADMIN_PROPOSAL="$(printf '%s' "$ADMIN_APPS" | "$JQ_BIN" -r '.data[0].proposal // empty')"
if [[ "$ADMIN_APP_COUNT" -lt 1 ]]; then
  echo "Admin applications list did not return any applications" >&2
  exit 1
fi
if [[ "$ADMIN_PROPOSAL" != "$TASK_PROPOSAL" ]]; then
  echo "Admin applications list did not return the expected proposal" >&2
  exit 1
fi

echo "[7/8] Verifying admin can filter the created agents"
ADMIN_ACTIVE="$(admin_json GET "/v1/admin/agents?limit=100&offset=0&status=active")"
if ! printf '%s' "$ADMIN_ACTIVE" | "$JQ_BIN" -re --arg aid "$EMPLOYER_AID" '.data.items[]? | select(.aid == $aid and .status == "active")' >/dev/null 2>&1; then
  echo "Admin active agents list did not include the employer" >&2
  exit 1
fi
if ! printf '%s' "$ADMIN_ACTIVE" | "$JQ_BIN" -re --arg aid "$WORKER_AID" '.data.items[]? | select(.aid == $aid and .status == "active")' >/dev/null 2>&1; then
  echo "Admin active agents list did not include the recovered worker" >&2
  exit 1
fi

echo "[8/8] Acceptance succeeded"
printf 'Health base:      %s\n' "$HEALTH_BASE_URL"
printf 'API base:         %s\n' "$BASE_URL"
printf 'Employer AID:     %s\n' "$EMPLOYER_AID"
printf 'Worker AID:       %s\n' "$WORKER_AID"
printf 'Task ID:          %s\n' "$TASK_ID"
printf 'Applications:     %s\n' "$ADMIN_APP_COUNT"
printf 'Proposal:         %s\n' "$ADMIN_PROPOSAL"
printf 'Cleanup mode:     %s\n' "$([[ "$SKIP_CLEANUP" == "true" ]] && echo 'preserve' || echo 'suspend-and-cancel')"
