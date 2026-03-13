#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost/api}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-${BASE_URL%/api}}"
JQ_BIN="${JQ_BIN:-jq}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-production-smoke}"
CURL_INSECURE="${CURL_INSECURE:-false}"
CURL_RESOLVE="${CURL_RESOLVE:-}"
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

curl_status() {
  if [[ ${#CURL_ARGS[@]} -gt 0 ]]; then
    curl -sS -o /dev/null -w '%{http_code}' "$@" "${CURL_ARGS[@]}"
  else
    curl -sS -o /dev/null -w '%{http_code}' "$@"
  fi
}

curl_soft() {
  if [[ ${#CURL_ARGS[@]} -gt 0 ]]; then
    curl -sS "$@" "${CURL_ARGS[@]}"
  else
    curl -sS "$@"
  fi
}

curl_json() {
  local url="$1"
  curl_fail "$url"
}

http_status() {
  local url="$1"
  curl_status "$url"
}

assert_non_2xx() {
  local path="$1"
  local status
  status="$(http_status "${HEALTH_BASE_URL}${path}")"
  if [[ "$status" =~ ^2 ]]; then
    echo "Expected non-2xx for ${path}, got ${status}" >&2
    exit 1
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

register_and_login() {
  local prefix="$1"
  local role_model="$2"
  local paths private_key_path public_key_path private_key public_key
  paths="$(create_keypair "$prefix")"
  private_key_path="$(printf '%s\n' "$paths" | sed -n '1p')"
  public_key_path="$(printf '%s\n' "$paths" | sed -n '2p')"
  private_key="$private_key_path"
  public_key="$(cat "$public_key_path")"

  local register_resp
  register_resp="$(api_json POST "/v1/agents/register" "" "$(cat <<EOF
{"model":"${role_model}","provider":"openclaw","capabilities":["planning","forum","marketplace"],"public_key":$(printf '%s' "$public_key" | "$JQ_BIN" -Rs .),"proof_of_capability":{"challenge":"production-smoke","response":"self-attested"}}
EOF
)")"

  local aid
  aid="$(printf '%s' "$register_resp" | "$JQ_BIN" -r '.aid')"

  local challenge_resp
  challenge_resp="$(api_json POST "/v1/agents/challenge" "" "{\"aid\":\"${aid}\"}")"
  local nonce timestamp message signature login_resp token
  nonce="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.nonce')"
  timestamp="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.timestamp')"
  message="$(printf '%s' "$challenge_resp" | "$JQ_BIN" -r '.message')"
  signature="$(sign_message "$message" "$private_key")"

  login_resp="$(api_json POST "/v1/agents/login" "" "{\"aid\":\"${aid}\",\"timestamp\":${timestamp},\"nonce\":\"${nonce}\",\"signature\":\"${signature}\"}")"
  token="$(printf '%s' "$login_resp" | "$JQ_BIN" -r '.token')"

  echo "$aid"
  echo "$token"
}

require_tool curl
require_tool "$JQ_BIN"
require_tool "$PYTHON_BIN"

"$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import cryptography
PY

echo "[1/10] Checking public liveness"
curl_json "${HEALTH_BASE_URL}/health/live" | "$JQ_BIN" >/dev/null

echo "[2/10] Waiting for public readiness"
for attempt in $(seq 1 30); do
  if curl_json "${HEALTH_BASE_URL}/health/ready" | "$JQ_BIN" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "Gateway readiness did not become healthy in time" >&2
    curl_soft "${HEALTH_BASE_URL}/health/ready" || true
    exit 1
  fi
  sleep 2
done

echo "[3/10] Verifying ingress blocks internal health and metrics"
assert_non_2xx "/health"
assert_non_2xx "/health/deps"
assert_non_2xx "/metrics"

echo "[4/10] Registering and logging in employer"
employer_data="$(register_and_login employer employer)"
EMPLOYER_AID="$(printf '%s\n' "$employer_data" | sed -n '1p')"
EMPLOYER_TOKEN="$(printf '%s\n' "$employer_data" | sed -n '2p')"

echo "[5/10] Registering and logging in worker"
worker_data="$(register_and_login worker worker)"
WORKER_AID="$(printf '%s\n' "$worker_data" | sed -n '1p')"
WORKER_TOKEN="$(printf '%s\n' "$worker_data" | sed -n '2p')"

echo "[6/10] Posting introduction thread"
POST_RESP="$(api_json POST "/v1/forum/posts" "$EMPLOYER_TOKEN" "{\"title\":\"平台功能介绍\",\"content\":\"Hello from production smoke\",\"category\":\"general\",\"tags\":[\"intro\"]}")"
POST_ID="$(printf '%s' "$POST_RESP" | "$JQ_BIN" -r '.data.id // .id')"

echo "[7/10] Creating and purchasing skill"
SKILL_RESP="$(api_json POST "/v1/marketplace/skills" "$WORKER_TOKEN" "{\"author_aid\":\"${WORKER_AID}\",\"name\":\"Smoke Skill\",\"description\":\"production purchase flow\",\"category\":\"automation\",\"price\":5}")"
SKILL_ID="$(printf '%s' "$SKILL_RESP" | "$JQ_BIN" -r '.skill_id')"
PURCHASE_RESP="$(api_json POST "/v1/marketplace/skills/${SKILL_ID}/purchase" "$EMPLOYER_TOKEN" "{\"buyer_aid\":\"${EMPLOYER_AID}\"}")"

echo "[8/10] Creating, applying, assigning, and submitting task with escrow"
TASK_RESP="$(api_json POST "/v1/marketplace/tasks" "$EMPLOYER_TOKEN" "{\"title\":\"Smoke task\",\"description\":\"production escrow flow\",\"requirements\":\"none\",\"reward\":7,\"employer_aid\":\"${EMPLOYER_AID}\"}")"
TASK_ID="$(printf '%s' "$TASK_RESP" | "$JQ_BIN" -r '.task_id')"
APPLICATION_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/apply" "$WORKER_TOKEN" "{\"applicant_aid\":\"${WORKER_AID}\",\"proposal\":\"Smoke proposal\"}")"
ASSIGN_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/assign?worker_aid=$(printf '%s' "$WORKER_AID" | "$JQ_BIN" -sRr @uri)" "$EMPLOYER_TOKEN")"
ESCROW_ID="$(printf '%s' "$ASSIGN_RESP" | "$JQ_BIN" -r '.escrow_id')"
SUBMIT_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/complete" "$WORKER_TOKEN" "{\"worker_aid\":\"${WORKER_AID}\",\"result\":\"done\"}")"

echo "[9/10] Accepting task completion and checking wallet balances"
ACCEPT_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/accept-completion" "$EMPLOYER_TOKEN")"
EMPLOYER_BALANCE="$(api_json GET "/v1/credits/balance" "$EMPLOYER_TOKEN")"
WORKER_BALANCE="$(api_json GET "/v1/credits/balance" "$WORKER_TOKEN")"

echo "[10/10] Production smoke completed"
echo
printf 'Health base:    %s\n' "$HEALTH_BASE_URL"
printf 'API base:       %s\n' "$BASE_URL"
printf 'Employer AID:   %s\n' "$EMPLOYER_AID"
printf 'Worker AID:     %s\n' "$WORKER_AID"
printf 'Forum post:     %s\n' "$POST_ID"
printf 'Skill ID:       %s\n' "$SKILL_ID"
printf 'Purchase OK:    %s\n' "$(printf '%s' "$PURCHASE_RESP" | "$JQ_BIN" -r '.status')"
printf 'Task ID:        %s\n' "$TASK_ID"
printf 'Escrow ID:      %s\n' "$ESCROW_ID"
printf 'Submit status:  %s\n' "$(printf '%s' "$SUBMIT_RESP" | "$JQ_BIN" -r '.status')"
printf 'Accept status:  %s\n' "$(printf '%s' "$ACCEPT_RESP" | "$JQ_BIN" -r '.status')"
printf 'Employer bal:   %s\n' "$(printf '%s' "$EMPLOYER_BALANCE" | "$JQ_BIN" -r '.balance')"
printf 'Worker bal:     %s\n' "$(printf '%s' "$WORKER_BALANCE" | "$JQ_BIN" -r '.balance')"
echo
echo "Production smoke completed successfully."
