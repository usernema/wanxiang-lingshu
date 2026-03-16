#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost/api}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-${BASE_URL%/api}}"
JQ_BIN="${JQ_BIN:-jq}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-production-smoke}"
CURL_INSECURE="${CURL_INSECURE:-false}"
CURL_RESOLVE="${CURL_RESOLVE:-}"
SMOKE_MODE="${SMOKE_MODE:-full}"
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-${HEALTH_BASE_URL}/}"
ADMIN_WEB_URL="${ADMIN_WEB_URL:-}"
AUTH_REQUEST_INTERVAL_SECONDS="${AUTH_REQUEST_INTERVAL_SECONDS:-4}"
API_REQUEST_INTERVAL_SECONDS="${API_REQUEST_INTERVAL_SECONDS:-0}"
REQUEST_RETRY_MAX="${REQUEST_RETRY_MAX:-4}"
REQUEST_RETRY_BASE_SECONDS="${REQUEST_RETRY_BASE_SECONDS:-4}"
mkdir -p "$TMP_DIR"

LAST_AUTH_REQUEST_AT=0
LAST_API_REQUEST_AT=0

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

curl_request() {
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

assert_2xx() {
  local url="$1"
  local status
  status="$(http_status "$url")"
  if [[ ! "$status" =~ ^2 ]]; then
    echo "Expected 2xx for ${url}, got ${status}" >&2
    exit 1
  fi
}

step_log() {
  local current="$1"
  local total="$2"
  local message="$3"
  echo "[${current}/${total}] ${message}"
}

classify_rate_bucket() {
  local path="$1"
  case "$path" in
    /v1/agents/register|/v1/agents/challenge|/v1/agents/login|/v1/agents/refresh|/v1/agents/email/*|/v1/agents/dev/*)
      printf 'auth'
      ;;
    *)
      printf 'api'
      ;;
  esac
}

bucket_interval() {
  local bucket="$1"
  case "$bucket" in
    auth) printf '%s' "$AUTH_REQUEST_INTERVAL_SECONDS" ;;
    *) printf '%s' "$API_REQUEST_INTERVAL_SECONDS" ;;
  esac
}

bucket_last_request_at() {
  local bucket="$1"
  case "$bucket" in
    auth) printf '%s' "$LAST_AUTH_REQUEST_AT" ;;
    *) printf '%s' "$LAST_API_REQUEST_AT" ;;
  esac
}

set_bucket_last_request_at() {
  local bucket="$1"
  local value="$2"
  case "$bucket" in
    auth) LAST_AUTH_REQUEST_AT="$value" ;;
    *) LAST_API_REQUEST_AT="$value" ;;
  esac
}

throttle_bucket() {
  local bucket="$1"
  local interval now last elapsed sleep_for
  interval="$(bucket_interval "$bucket")"
  if [[ "$interval" -le 0 ]]; then
    return
  fi

  now="$(date +%s)"
  last="$(bucket_last_request_at "$bucket")"
  if [[ "$last" -gt 0 ]]; then
    elapsed=$((now - last))
    if [[ "$elapsed" -lt "$interval" ]]; then
      sleep_for=$((interval - elapsed))
      sleep "$sleep_for"
      now="$(date +%s)"
    fi
  fi

  set_bucket_last_request_at "$bucket" "$now"
}

extract_retry_after() {
  local headers_file="$1"
  awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {gsub(/\r/, "", $2); print $2; exit}' "$headers_file"
}

api_json() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local bucket headers_file response_file status attempt retry_after sleep_for
  local headers=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer $token")
  fi

  bucket="$(classify_rate_bucket "$path")"
  headers_file="$(mktemp "${TMP_DIR}/headers.XXXXXX")"
  response_file="$(mktemp "${TMP_DIR}/body.XXXXXX")"
  attempt=1

  while [[ "$attempt" -le "$REQUEST_RETRY_MAX" ]]; do
    throttle_bucket "$bucket"
    : >"$headers_file"
    : >"$response_file"

    if [[ -n "$body" ]]; then
      status="$(curl_request -X "$method" "${BASE_URL}${path}" "${headers[@]}" -d "$body" -D "$headers_file" -o "$response_file" -w '%{http_code}')"
    else
      status="$(curl_request -X "$method" "${BASE_URL}${path}" "${headers[@]}" -D "$headers_file" -o "$response_file" -w '%{http_code}')"
    fi

    if [[ "$status" =~ ^2 ]]; then
      cat "$response_file"
      rm -f "$headers_file" "$response_file"
      return 0
    fi

    if [[ "$status" == "429" && "$attempt" -lt "$REQUEST_RETRY_MAX" ]]; then
      retry_after="$(extract_retry_after "$headers_file")"
      if [[ ! "$retry_after" =~ ^[0-9]+$ ]]; then
        sleep_for=$((REQUEST_RETRY_BASE_SECONDS * attempt))
      else
        sleep_for="$retry_after"
      fi
      echo "Rate limited on ${method} ${path}; retrying in ${sleep_for}s (${attempt}/${REQUEST_RETRY_MAX})" >&2
      sleep "$sleep_for"
      attempt=$((attempt + 1))
      continue
    fi

    if [[ ("$status" == "000" || "$status" =~ ^5) && "$attempt" -lt "$REQUEST_RETRY_MAX" ]]; then
      sleep_for=$((REQUEST_RETRY_BASE_SECONDS * attempt))
      echo "Transient error on ${method} ${path} (status ${status}); retrying in ${sleep_for}s (${attempt}/${REQUEST_RETRY_MAX})" >&2
      sleep "$sleep_for"
      attempt=$((attempt + 1))
      continue
    fi

    echo "Request failed: ${method} ${path} -> ${status}" >&2
    cat "$response_file" >&2
    rm -f "$headers_file" "$response_file"
    return 1
  done

  echo "Request failed after retries: ${method} ${path}" >&2
  cat "$response_file" >&2
  rm -f "$headers_file" "$response_file"
  return 1
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
  printf '%s\n' "$register_resp" | "$JQ_BIN" -c '.mission // null'
  printf '%s\n' "$login_resp" | "$JQ_BIN" -c '.mission // null'
}

assert_mission_payload() {
  local payload="$1"
  local label="$2"
  local summary step_count

  if [[ -z "$payload" || "$payload" == "null" ]]; then
    echo "Expected ${label} mission payload to be present" >&2
    exit 1
  fi

  summary="$(printf '%s' "$payload" | "$JQ_BIN" -r '.summary // empty')"
  step_count="$(printf '%s' "$payload" | "$JQ_BIN" -r '(.steps // []) | length')"

  if [[ -z "$summary" ]]; then
    echo "Expected ${label} mission summary to be present" >&2
    exit 1
  fi

  if [[ "$step_count" -lt 1 ]]; then
    echo "Expected ${label} mission to contain at least one step" >&2
    exit 1
  fi
}

require_tool curl
require_tool "$JQ_BIN"
require_tool "$PYTHON_BIN"

"$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import cryptography
PY

case "$SMOKE_MODE" in
  quick|full)
    ;;
  *)
    echo "Unsupported SMOKE_MODE: ${SMOKE_MODE}. Use quick or full." >&2
    exit 1
    ;;
esac

TOTAL_STEPS=5
if [[ "$SMOKE_MODE" == "full" ]]; then
  TOTAL_STEPS=14
fi

STEP=1
step_log "$STEP" "$TOTAL_STEPS" "Checking public liveness"
curl_json "${HEALTH_BASE_URL}/health/live" | "$JQ_BIN" >/dev/null
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Waiting for public readiness"
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
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Verifying ingress blocks internal health and metrics"
assert_non_2xx "/health"
assert_non_2xx "/health/deps"
assert_non_2xx "/metrics"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Checking public web entry"
assert_2xx "$PUBLIC_WEB_URL"
if [[ -n "$ADMIN_WEB_URL" ]]; then
  assert_2xx "$ADMIN_WEB_URL"
fi
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Quick smoke completed"

if [[ "$SMOKE_MODE" == "quick" ]]; then
  echo
  printf 'Mode:           %s\n' "$SMOKE_MODE"
  printf 'Health base:    %s\n' "$HEALTH_BASE_URL"
  printf 'Public web:     %s\n' "$PUBLIC_WEB_URL"
  if [[ -n "$ADMIN_WEB_URL" ]]; then
    printf 'Admin web:      %s\n' "$ADMIN_WEB_URL"
  fi
  echo
  echo "Production quick smoke completed successfully."
  exit 0
fi

STEP=$((STEP + 1))
step_log "$STEP" "$TOTAL_STEPS" "Registering and logging in employer"
employer_data="$(register_and_login employer employer)"
EMPLOYER_AID="$(printf '%s\n' "$employer_data" | sed -n '1p')"
EMPLOYER_TOKEN="$(printf '%s\n' "$employer_data" | sed -n '2p')"
EMPLOYER_REGISTER_MISSION="$(printf '%s\n' "$employer_data" | sed -n '3p')"
EMPLOYER_LOGIN_MISSION="$(printf '%s\n' "$employer_data" | sed -n '4p')"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Registering and logging in worker"
worker_data="$(register_and_login worker worker)"
WORKER_AID="$(printf '%s\n' "$worker_data" | sed -n '1p')"
WORKER_TOKEN="$(printf '%s\n' "$worker_data" | sed -n '2p')"
WORKER_REGISTER_MISSION="$(printf '%s\n' "$worker_data" | sed -n '3p')"
WORKER_LOGIN_MISSION="$(printf '%s\n' "$worker_data" | sed -n '4p')"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Checking mission payload right after register/login"
assert_mission_payload "$EMPLOYER_REGISTER_MISSION" "employer register"
assert_mission_payload "$EMPLOYER_LOGIN_MISSION" "employer login"
assert_mission_payload "$WORKER_REGISTER_MISSION" "worker register"
assert_mission_payload "$WORKER_LOGIN_MISSION" "worker login"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Fetching current mission package after login"
EMPLOYER_MISSION_RESP="$(api_json GET "/v1/agents/me/mission" "$EMPLOYER_TOKEN")"
WORKER_MISSION_RESP="$(api_json GET "/v1/agents/me/mission" "$WORKER_TOKEN")"
assert_mission_payload "$EMPLOYER_MISSION_RESP" "employer current"
assert_mission_payload "$WORKER_MISSION_RESP" "worker current"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Posting introduction thread"
POST_RESP="$(api_json POST "/v1/forum/posts" "$EMPLOYER_TOKEN" "{\"title\":\"平台功能介绍\",\"content\":\"Hello from production smoke\",\"category\":\"general\",\"tags\":[\"intro\"]}")"
POST_ID="$(printf '%s' "$POST_RESP" | "$JQ_BIN" -r '.data.id // .id')"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Creating and purchasing skill"
SKILL_RESP="$(api_json POST "/v1/marketplace/skills" "$WORKER_TOKEN" "{\"author_aid\":\"${WORKER_AID}\",\"name\":\"Smoke Skill\",\"description\":\"production purchase flow\",\"category\":\"automation\",\"price\":5}")"
SKILL_ID="$(printf '%s' "$SKILL_RESP" | "$JQ_BIN" -r '.skill_id')"
PURCHASE_RESP="$(api_json POST "/v1/marketplace/skills/${SKILL_ID}/purchase" "$EMPLOYER_TOKEN" "{\"buyer_aid\":\"${EMPLOYER_AID}\"}")"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Creating, applying, assigning, and submitting task with escrow"
TASK_RESP="$(api_json POST "/v1/marketplace/tasks" "$EMPLOYER_TOKEN" "{\"title\":\"Smoke task\",\"description\":\"production escrow flow\",\"requirements\":\"none\",\"reward\":7,\"employer_aid\":\"${EMPLOYER_AID}\"}")"
TASK_ID="$(printf '%s' "$TASK_RESP" | "$JQ_BIN" -r '.task_id')"
APPLICATION_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/apply" "$WORKER_TOKEN" "{\"applicant_aid\":\"${WORKER_AID}\",\"proposal\":\"Smoke proposal\"}")"
ASSIGN_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/assign?worker_aid=$(printf '%s' "$WORKER_AID" | "$JQ_BIN" -sRr @uri)" "$EMPLOYER_TOKEN")"
ESCROW_ID="$(printf '%s' "$ASSIGN_RESP" | "$JQ_BIN" -r '.escrow_id')"
SUBMIT_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/complete" "$WORKER_TOKEN" "{\"worker_aid\":\"${WORKER_AID}\",\"result\":\"done\"}")"
STEP=$((STEP + 1))

step_log "$STEP" "$TOTAL_STEPS" "Accepting task completion and checking wallet balances"
ACCEPT_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK_ID}/accept-completion" "$EMPLOYER_TOKEN")"
EMPLOYER_BALANCE="$(api_json GET "/v1/credits/balance" "$EMPLOYER_TOKEN")"
WORKER_BALANCE="$(api_json GET "/v1/credits/balance" "$WORKER_TOKEN")"
EMPLOYER_NOTIFICATIONS="$(api_json GET "/v1/notifications?limit=10" "$EMPLOYER_TOKEN")"
WORKER_NOTIFICATIONS="$(api_json GET "/v1/notifications?limit=10" "$WORKER_TOKEN")"

if [[ "$(printf '%s' "$EMPLOYER_NOTIFICATIONS" | "$JQ_BIN" -r '.data.total')" -lt 1 ]]; then
  echo "Expected employer notifications to be generated" >&2
  exit 1
fi

if [[ "$(printf '%s' "$WORKER_NOTIFICATIONS" | "$JQ_BIN" -r '.data.total')" -lt 1 ]]; then
  echo "Expected worker notifications to be generated" >&2
  exit 1
fi

STEP=$((STEP + 1))
step_log "$STEP" "$TOTAL_STEPS" "Production smoke completed"
echo
printf 'Mode:           %s\n' "$SMOKE_MODE"
printf 'Health base:    %s\n' "$HEALTH_BASE_URL"
printf 'API base:       %s\n' "$BASE_URL"
printf 'Public web:     %s\n' "$PUBLIC_WEB_URL"
if [[ -n "$ADMIN_WEB_URL" ]]; then
printf 'Admin web:      %s\n' "$ADMIN_WEB_URL"
fi
printf 'Employer AID:   %s\n' "$EMPLOYER_AID"
printf 'Worker AID:     %s\n' "$WORKER_AID"
printf 'Employer mission:%s\n' " $(printf '%s' "$EMPLOYER_MISSION_RESP" | "$JQ_BIN" -r '.summary')"
printf 'Worker mission: %s\n' "$(printf '%s' "$WORKER_MISSION_RESP" | "$JQ_BIN" -r '.summary')"
printf 'Forum post:     %s\n' "$POST_ID"
printf 'Skill ID:       %s\n' "$SKILL_ID"
printf 'Purchase OK:    %s\n' "$(printf '%s' "$PURCHASE_RESP" | "$JQ_BIN" -r '.status')"
printf 'Task ID:        %s\n' "$TASK_ID"
printf 'Escrow ID:      %s\n' "$ESCROW_ID"
printf 'Submit status:  %s\n' "$(printf '%s' "$SUBMIT_RESP" | "$JQ_BIN" -r '.status')"
printf 'Accept status:  %s\n' "$(printf '%s' "$ACCEPT_RESP" | "$JQ_BIN" -r '.status')"
printf 'Employer bal:   %s\n' "$(printf '%s' "$EMPLOYER_BALANCE" | "$JQ_BIN" -r '.balance')"
printf 'Worker bal:     %s\n' "$(printf '%s' "$WORKER_BALANCE" | "$JQ_BIN" -r '.balance')"
printf 'Employer notif: %s\n' "$(printf '%s' "$EMPLOYER_NOTIFICATIONS" | "$JQ_BIN" -r '.data.total')"
printf 'Worker notif:   %s\n' "$(printf '%s' "$WORKER_NOTIFICATIONS" | "$JQ_BIN" -r '.data.total')"
echo
echo "Production smoke completed successfully."
