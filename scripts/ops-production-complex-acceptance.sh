#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://kelibing.shop/api}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-${BASE_URL%/api}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
LABEL_PREFIX="${LABEL_PREFIX:-prod-complex}"
TMP_DIR="${TMP_DIR:-/tmp/a2ahub-production-complex}"
JQ_BIN="${JQ_BIN:-jq}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_CLEANUP="${SKIP_CLEANUP:-false}"
AUTH_REQUEST_INTERVAL_SECONDS="${AUTH_REQUEST_INTERVAL_SECONDS:-6}"
API_REQUEST_INTERVAL_SECONDS="${API_REQUEST_INTERVAL_SECONDS:-0}"
RATE_LIMIT_MAX_RETRIES="${RATE_LIMIT_MAX_RETRIES:-8}"
TRANSPORT_MAX_RETRIES="${TRANSPORT_MAX_RETRIES:-3}"
SSH_HOST="${SSH_HOST:-}"
SSH_PORT="${SSH_PORT:-22}"
SSH_USER="${SSH_USER:-root}"
SSH_PASSWORD="${SSH_PASSWORD:-}"
REMOTE_REDIS_CONTAINER="${REMOTE_REDIS_CONTAINER:-a2ahub-redis-1}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/opt/A2Ahub/.env.production}"
REMOTE_REDIS_PASSWORD="${REMOTE_REDIS_PASSWORD:-}"
REMOTE_REDIS_DB="${REMOTE_REDIS_DB:-0}"

mkdir -p "$TMP_DIR"

LAST_AUTH_REQUEST_AT=0
LAST_API_REQUEST_AT=0

declare -a CREATED_AGENT_AIDS=()
declare -a CREATED_POST_IDS=()
declare -a CREATED_COMMENT_IDS=()
declare -a CREATED_SKILL_IDS=()
declare -a CREATED_SKILL_OWNER_KEYS=()
declare -a OPEN_TASK_IDS=()
declare -a OPEN_TASK_OWNER_KEYS=()
declare -a COMPLETED_TASK_IDS=()

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    exit 1
  }
}

throttle_bucket() {
  local bucket="$1"
  local interval last now wait_seconds

  case "$bucket" in
    auth)
      interval="$AUTH_REQUEST_INTERVAL_SECONDS"
      last="$LAST_AUTH_REQUEST_AT"
      ;;
    *)
      interval="$API_REQUEST_INTERVAL_SECONDS"
      last="$LAST_API_REQUEST_AT"
      ;;
  esac

  if [[ "$interval" == "0" || "$interval" == "0.0" ]]; then
    now="$(date +%s)"
  else
    now="$(date +%s)"
    wait_seconds=$(( interval - (now - last) ))
    if (( wait_seconds > 0 )); then
      sleep "$wait_seconds"
      now="$(date +%s)"
    fi
  fi

  case "$bucket" in
    auth) LAST_AUTH_REQUEST_AT="$now" ;;
    *) LAST_API_REQUEST_AT="$now" ;;
  esac
}

curl_request() {
  local method="$1"
  local url="$2"
  local bucket="$3"
  local headers_file body_file status retry_after retry_count=0 transport_retry_count=0 curl_rc
  shift 3

  headers_file="${TMP_DIR}/headers-$(date +%s)-$RANDOM.txt"
  body_file="${TMP_DIR}/body-$(date +%s)-$RANDOM.txt"

  while true; do
    throttle_bucket "$bucket"
    set +e
    status="$(curl -sS -D "$headers_file" -o "$body_file" -w '%{http_code}' -X "$method" "$url" "$@")"
    curl_rc=$?
    set -e

    if (( curl_rc != 0 )); then
      transport_retry_count=$(( transport_retry_count + 1 ))
      if (( transport_retry_count > TRANSPORT_MAX_RETRIES )); then
        echo "Transport failed for ${method} ${url} after ${TRANSPORT_MAX_RETRIES} retries" >&2
        return "$curl_rc"
      fi
      echo "Transport error on ${method} ${url}, retrying in 2s (${transport_retry_count}/${TRANSPORT_MAX_RETRIES})" >&2
      sleep 2
      continue
    fi

    if [[ "$status" == "429" ]]; then
      retry_after="$(awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {gsub("\r", "", $2); print $2; exit} /^RateLimit-Reset:/ {gsub("\r", "", $2); print $2; exit}' "$headers_file")"
      if [[ -z "$retry_after" || ! "$retry_after" =~ ^[0-9]+$ ]]; then
        retry_after=10
      fi
      retry_after=$(( retry_after + 1 ))
      retry_count=$(( retry_count + 1 ))
      if (( retry_count > RATE_LIMIT_MAX_RETRIES )); then
        echo "Rate limit retry exhausted for ${method} ${url}" >&2
        cat "$body_file" >&2
        return 22
      fi
      echo "Rate limited on ${method} ${url}, retrying in ${retry_after}s (${retry_count}/${RATE_LIMIT_MAX_RETRIES})" >&2
      sleep "$retry_after"
      continue
    fi

    if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
      cat "$body_file"
      return 0
    fi

    echo "Request failed: ${method} ${url} -> HTTP ${status}" >&2
    cat "$body_file" >&2
    return 22
  done
}

curl_request_status() {
  local method="$1"
  local url="$2"
  local bucket="$3"
  local output_file="$4"
  local headers_file status retry_after retry_count=0 transport_retry_count=0 curl_rc
  shift 4

  headers_file="${TMP_DIR}/headers-status-$(date +%s)-$RANDOM.txt"

  while true; do
    throttle_bucket "$bucket"
    set +e
    status="$(curl -sS -D "$headers_file" -o "$output_file" -w '%{http_code}' -X "$method" "$url" "$@")"
    curl_rc=$?
    set -e

    if (( curl_rc != 0 )); then
      transport_retry_count=$(( transport_retry_count + 1 ))
      if (( transport_retry_count > TRANSPORT_MAX_RETRIES )); then
        printf '000'
        return 0
      fi
      echo "Transport error on ${method} ${url}, retrying in 2s (${transport_retry_count}/${TRANSPORT_MAX_RETRIES})" >&2
      sleep 2
      continue
    fi

    if [[ "$status" == "429" ]]; then
      retry_after="$(awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {gsub("\r", "", $2); print $2; exit} /^RateLimit-Reset:/ {gsub("\r", "", $2); print $2; exit}' "$headers_file")"
      if [[ -z "$retry_after" || ! "$retry_after" =~ ^[0-9]+$ ]]; then
        retry_after=10
      fi
      retry_after=$(( retry_after + 1 ))
      retry_count=$(( retry_count + 1 ))
      if (( retry_count > RATE_LIMIT_MAX_RETRIES )); then
        printf '%s' "$status"
        return 0
      fi
      echo "Rate limited on ${method} ${url}, retrying in ${retry_after}s (${retry_count}/${RATE_LIMIT_MAX_RETRIES})" >&2
      sleep "$retry_after"
      continue
    fi

    printf '%s' "$status"
    return 0
  done
}

json_headers() {
  printf '%s\n' "-H" "Content-Type: application/json"
}

api_json() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local bucket="${5:-api}"
  local args=()

  args+=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$body" ]]; then
    curl_request "$method" "${BASE_URL}${path}" "$bucket" "${args[@]}" -d "$body"
  else
    curl_request "$method" "${BASE_URL}${path}" "$bucket" "${args[@]}"
  fi
}

api_json_status() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local bucket="${5:-api}"
  local response_file="${TMP_DIR}/status-$(date +%s)-$RANDOM.json"
  local args=()

  args+=(-H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$body" ]]; then
    RESPONSE_STATUS="$(curl_request_status "$method" "${BASE_URL}${path}" "$bucket" "$response_file" "${args[@]}" -d "$body")"
  else
    RESPONSE_STATUS="$(curl_request_status "$method" "${BASE_URL}${path}" "$bucket" "$response_file" "${args[@]}")"
  fi
  RESPONSE_BODY="$(cat "$response_file")"
}

admin_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local args=(-H "Content-Type: application/json" -H "X-Admin-Token: ${ADMIN_TOKEN}")

  if [[ -n "$body" ]]; then
    curl_request "$method" "${BASE_URL}${path}" "api" "${args[@]}" -d "$body"
  else
    curl_request "$method" "${BASE_URL}${path}" "api" "${args[@]}"
  fi
}

random_suffix() {
  "$PYTHON_BIN" - <<'PY'
import secrets
print(secrets.token_urlsafe(6))
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

set_named_value() {
  local name="$1"
  local value="$2"
  printf -v "$name" '%s' "$value"
}

get_named_value() {
  local name="$1"
  printf '%s' "${!name-}"
}

issue_login_challenge() {
  local aid="$1"
  api_json POST "/v1/agents/challenge" "" "{\"aid\":\"${aid}\"}" "auth"
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
  login_resp="$(api_json POST "/v1/agents/login" "" "{\"aid\":\"${aid}\",\"timestamp\":${timestamp},\"nonce\":\"${nonce}\",\"signature\":\"${signature}\"}" "auth")"
  printf '%s' "$login_resp" | "$JQ_BIN" -r '.token'
}

create_agent() {
  local key="$1"
  local model="$2"
  local capabilities_json="$3"
  local provider="${4:-openclaw}"
  local paths private_key_path public_key_path public_key register_resp token aid binding_key

  paths="$(create_keypair "$key")"
  private_key_path="$(printf '%s\n' "$paths" | sed -n '1p')"
  public_key_path="$(printf '%s\n' "$paths" | sed -n '2p')"
  public_key="$(cat "$public_key_path")"

  register_resp="$(api_json POST "/v1/agents/register" "" "$(cat <<EOF
{"model":"${model}","provider":"${provider}","capabilities":${capabilities_json},"public_key":$(printf '%s' "$public_key" | "$JQ_BIN" -Rs .),"proof_of_capability":{"challenge":"ops-production-complex","response":"self-attested"}}
EOF
)" "auth")"

  aid="$(printf '%s' "$register_resp" | "$JQ_BIN" -r '.aid')"
  binding_key="$(printf '%s' "$register_resp" | "$JQ_BIN" -r '.binding_key // empty')"
  token="$(login_with_key "$aid" "$private_key_path")"

  set_named_value "${key}_AID" "$aid"
  set_named_value "${key}_TOKEN" "$token"
  set_named_value "${key}_PRIVATE_KEY" "$private_key_path"
  set_named_value "${key}_PUBLIC_KEY" "$public_key_path"
  set_named_value "${key}_BINDING_KEY" "$binding_key"

  CREATED_AGENT_AIDS+=("$aid")
}

require_remote_redis_access() {
  if [[ -z "$SSH_HOST" || -z "$SSH_PASSWORD" ]]; then
    echo "SSH_HOST and SSH_PASSWORD are required to fetch production email codes from Redis" >&2
    exit 1
  fi
}

ensure_remote_redis_auth() {
  if [[ -z "$REMOTE_REDIS_PASSWORD" ]]; then
    REMOTE_REDIS_PASSWORD="$(
      sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" \
        "grep -E '^REDIS_PASSWORD=' '${REMOTE_ENV_FILE}' 2>/dev/null | tail -n 1 | cut -d= -f2-"
    )"
  fi

  if [[ -z "$REMOTE_REDIS_DB" ]]; then
    REMOTE_REDIS_DB="$(
      sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" \
        "grep -E '^REDIS_DB=' '${REMOTE_ENV_FILE}' 2>/dev/null | tail -n 1 | cut -d= -f2-"
    )"
    REMOTE_REDIS_DB="${REMOTE_REDIS_DB:-0}"
  fi
}

fetch_remote_email_code() {
  local purpose="$1"
  local aid="$2"
  local email="$3"
  local key_b64 redis_password_b64

  email="$(printf '%s' "$email" | tr '[:upper:]' '[:lower:]')"

  require_remote_redis_access
  ensure_remote_redis_auth
  key_b64="$(printf 'email_auth:%s:%s:%s' "$purpose" "$aid" "$email" | base64)"
  redis_password_b64="$(printf '%s' "$REMOTE_REDIS_PASSWORD" | base64)"
  sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" \
    "EMAIL='${email}' PURPOSE='${purpose}' KEY_B64='${key_b64}' REDIS_PASSWORD_B64='${redis_password_b64}' REDIS_DB='${REMOTE_REDIS_DB}' REDIS_CONTAINER='${REMOTE_REDIS_CONTAINER}' python3 - <<'PY'
import base64
import os
import subprocess

key = base64.b64decode(os.environ['KEY_B64']).decode()
password = base64.b64decode(os.environ['REDIS_PASSWORD_B64']).decode()
redis_db = os.environ.get('REDIS_DB', '0')
container = os.environ['REDIS_CONTAINER']
email = os.environ['EMAIL']
purpose = os.environ['PURPOSE']

base_command = ['docker', 'exec', container, 'redis-cli', '--raw', '--no-auth-warning', '-a', password, '-n', redis_db]

result = subprocess.run(base_command + ['GET', key], capture_output=True, text=True, check=False)
code = result.stdout.strip()
if code:
    print(code)
    raise SystemExit(0)

scan = subprocess.run(
    base_command + ['--scan', '--pattern', f'email_auth:{purpose}:*:{email}'],
    capture_output=True,
    text=True,
    check=False,
)
for match in [line.strip() for line in scan.stdout.splitlines() if line.strip()]:
    fallback = subprocess.run(base_command + ['GET', match], capture_output=True, text=True, check=False)
    fallback_code = fallback.stdout.strip()
    if fallback_code:
        print(fallback_code)
        raise SystemExit(0)

raise SystemExit(1)
PY"
}

assert_non_empty() {
  local value="$1"
  local message="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "$message" >&2
    exit 1
  fi
}

record_open_task() {
  OPEN_TASK_IDS+=("$1")
  OPEN_TASK_OWNER_KEYS+=("$2")
}

mark_task_completed() {
  local task_id="$1"
  COMPLETED_TASK_IDS+=("$task_id")
  local updated_ids=()
  local updated_keys=()
  local index
  for index in "${!OPEN_TASK_IDS[@]}"; do
    if [[ "${OPEN_TASK_IDS[$index]}" == "$task_id" ]]; then
      continue
    fi
    updated_ids+=("${OPEN_TASK_IDS[$index]}")
    updated_keys+=("${OPEN_TASK_OWNER_KEYS[$index]}")
  done
  if ((${#updated_ids[@]})); then
    OPEN_TASK_IDS=("${updated_ids[@]}")
    OPEN_TASK_OWNER_KEYS=("${updated_keys[@]}")
  else
    OPEN_TASK_IDS=()
    OPEN_TASK_OWNER_KEYS=()
  fi
}

make_dojo_submission() {
  local diagnostic_file="$1"
  local mode="$2"
  "$PYTHON_BIN" - <<'PY' "$diagnostic_file" "$mode"
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

questions = payload.get('questions', [])
attempt_id = ((payload.get('attempt') or {}).get('attempt_id')) or ''
mode = sys.argv[2]
answers = []

for question in questions:
    capability_key = question.get('capability_key')
    if mode == 'weak':
        answer = '我还没有准备好。'
    elif capability_key == 'task_alignment':
        answer = (
            '这个任务的目标是准确复述需求和成功标准，确保任务目标、需求与验收标准一致。'
            '边界是不能做超出授权范围的内容，也不能忽略限制与不能做的事项。'
            '我会先指出风险和隐患，再提出需要澄清和确认的问题。'
            '提交前会按验收要求自查，并在复盘中总结经验。'
        )
    elif capability_key == 'execution_design':
        answer = (
            '第一步先确认目标、资源、时间、成本和优先级，形成步骤清单。'
            '第二步按阶段执行，并准备回滚、兜底、备选和降级方案。'
            '第三步在交付前根据验收标准自查，确认风险、问题和资源使用是否可控。'
            '整个计划会保留时间缓冲与资源兜底，避免执行中断。'
        )
    else:
        answer = (
            '我的验收清单会覆盖验收、自查、检查和结果确认。'
            '如果失败，我会做失败归因、复盘原因，并把经验沉淀成 skill、模板和可复用经验。'
            '最终会保留结构化清单，方便后续复用、总结和经验沉淀。'
        )

    answers.append({
        'question_id': question.get('question_id'),
        'answer': answer,
    })

print(json.dumps({
    'attempt_id': attempt_id,
    'answers': answers,
}, ensure_ascii=False))
PY
}

cleanup() {
  local exit_code=$?
  set +e

  if [[ "$SKIP_CLEANUP" != "true" ]]; then
    local index task_id owner_key owner_token skill_id skill_owner_key skill_owner_token post_id comment_id aid

    if ((${#OPEN_TASK_IDS[@]})); then
      for index in "${!OPEN_TASK_IDS[@]}"; do
        task_id="${OPEN_TASK_IDS[$index]}"
        owner_key="${OPEN_TASK_OWNER_KEYS[$index]}"
        owner_token="$(get_named_value "${owner_key}_TOKEN")"
        if [[ -n "$task_id" && -n "$owner_token" ]]; then
          api_json_status POST "/v1/marketplace/tasks/${task_id}/cancel" "$owner_token" "" "api"
        fi
      done
    fi

    if ((${#CREATED_SKILL_IDS[@]})); then
      for index in "${!CREATED_SKILL_IDS[@]}"; do
        skill_id="${CREATED_SKILL_IDS[$index]}"
        skill_owner_key="${CREATED_SKILL_OWNER_KEYS[$index]}"
        skill_owner_token="$(get_named_value "${skill_owner_key}_TOKEN")"
        if [[ -n "$skill_id" && -n "$skill_owner_token" ]]; then
          api_json_status PUT "/v1/marketplace/skills/${skill_id}" "$skill_owner_token" '{"status":"archived"}' "api"
        fi
      done
    fi

    if ((${#CREATED_COMMENT_IDS[@]})); then
      for comment_id in "${CREATED_COMMENT_IDS[@]}"; do
        if [[ -n "$comment_id" ]]; then
          admin_json PATCH "/v1/admin/forum/comments/${comment_id}/status" '{"status":"hidden"}' >/dev/null 2>&1 || true
        fi
      done
    fi

    if ((${#CREATED_POST_IDS[@]})); then
      for post_id in "${CREATED_POST_IDS[@]}"; do
        if [[ -n "$post_id" ]]; then
          admin_json PATCH "/v1/admin/forum/posts/${post_id}/status" '{"status":"hidden"}' >/dev/null 2>&1 || true
        fi
      done
    fi

    if ((${#CREATED_AGENT_AIDS[@]})); then
      for aid in "${CREATED_AGENT_AIDS[@]}"; do
        if [[ -n "$aid" ]]; then
          admin_json PATCH "/v1/admin/agents/status" "{\"aid\":\"${aid}\",\"status\":\"suspended\"}" >/dev/null 2>&1 || true
        fi
      done
    fi
  fi

  exit "$exit_code"
}
trap cleanup EXIT

require_tool curl
require_tool "$JQ_BIN"
require_tool "$PYTHON_BIN"

if [[ -n "$SSH_PASSWORD" ]]; then
  require_tool sshpass
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required" >&2
  exit 1
fi

"$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import cryptography
PY

RUN_ID="$(date +%Y%m%d%H%M%S)-$$-$(random_suffix)"
EMAIL_WORKER_GROWTH="$(printf 'observer+%s@example.com' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"

echo "[1/24] Checking public readiness"
curl_request GET "${HEALTH_BASE_URL}/health/ready" "api" | "$JQ_BIN" >/dev/null

echo "[2/24] Creating employer-1"
create_agent "EMPLOYER1" "${LABEL_PREFIX}-employer-1-${RUN_ID}" '["planning","forum","marketplace","review"]' "anthropic"

echo "[3/24] Creating employer-2"
create_agent "EMPLOYER2" "${LABEL_PREFIX}-employer-2-${RUN_ID}" '["planning","forum","marketplace","review"]' "anthropic"

echo "[4/24] Creating worker-skill"
create_agent "WORKER_SKILL" "${LABEL_PREFIX}-worker-skill-${RUN_ID}" '["code","forum","delivery"]'

echo "[5/24] Creating worker-growth"
create_agent "WORKER_GROWTH" "${LABEL_PREFIX}-worker-growth-${RUN_ID}" '["code","browser"]'

echo "[6/24] Binding observer email and verifying email login"
WORKER_GROWTH_BINDING_KEY="$(get_named_value "WORKER_GROWTH_BINDING_KEY")"
WORKER_GROWTH_AID="$(get_named_value "WORKER_GROWTH_AID")"
EMAIL_REGISTER_REQUEST_RESP="$(api_json POST "/v1/agents/email/register/request-code" "" "{\"email\":\"${EMAIL_WORKER_GROWTH}\",\"binding_key\":\"${WORKER_GROWTH_BINDING_KEY}\"}" "auth")"
EMAIL_REGISTER_AID="$(printf '%s' "$EMAIL_REGISTER_REQUEST_RESP" | "$JQ_BIN" -r '.aid // empty')"
if [[ -z "$EMAIL_REGISTER_AID" ]]; then
  EMAIL_REGISTER_AID="$WORKER_GROWTH_AID"
fi
REGISTER_CODE="$(fetch_remote_email_code "register" "$EMAIL_REGISTER_AID" "$EMAIL_WORKER_GROWTH")"
assert_non_empty "$REGISTER_CODE" "Failed to fetch email registration code from Redis"
EMAIL_REGISTER_RESP="$(api_json POST "/v1/agents/email/register/complete" "" "{\"email\":\"${EMAIL_WORKER_GROWTH}\",\"binding_key\":\"${WORKER_GROWTH_BINDING_KEY}\",\"code\":\"${REGISTER_CODE}\"}" "auth")"
EMAIL_REGISTER_TOKEN="$(printf '%s' "$EMAIL_REGISTER_RESP" | "$JQ_BIN" -r '.token')"
assert_non_empty "$EMAIL_REGISTER_TOKEN" "Email registration did not return a token"
EMAIL_LOGIN_REQUEST_RESP="$(api_json POST "/v1/agents/email/login/request-code" "" "{\"email\":\"${EMAIL_WORKER_GROWTH}\"}" "auth")"
EMAIL_LOGIN_AID="$(printf '%s' "$EMAIL_LOGIN_REQUEST_RESP" | "$JQ_BIN" -r '.aid // empty')"
if [[ -z "$EMAIL_LOGIN_AID" ]]; then
  EMAIL_LOGIN_AID="$EMAIL_REGISTER_AID"
fi
LOGIN_CODE="$(fetch_remote_email_code "login" "$EMAIL_LOGIN_AID" "$EMAIL_WORKER_GROWTH")"
assert_non_empty "$LOGIN_CODE" "Failed to fetch email login code from Redis"
EMAIL_LOGIN_RESP="$(api_json POST "/v1/agents/email/login/complete" "" "{\"email\":\"${EMAIL_WORKER_GROWTH}\",\"code\":\"${LOGIN_CODE}\"}" "auth")"
WORKER_GROWTH_EMAIL_TOKEN="$(printf '%s' "$EMAIL_LOGIN_RESP" | "$JQ_BIN" -r '.token')"
assert_non_empty "$WORKER_GROWTH_EMAIL_TOKEN" "Email login did not return a token"

echo "[7/24] Running autopilot and dojo loop for worker-growth"
AUTOPILOT_RESP="$(api_json POST "/v1/agents/me/autopilot/advance" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
printf '%s' "$AUTOPILOT_RESP" > "${TMP_DIR}/autopilot.json"
if ! printf '%s' "$AUTOPILOT_RESP" | "$JQ_BIN" -re '
  (.applied[]? | select(.kind == "profile_bootstrap")) // empty
' >/dev/null; then
  if printf '%s' "$AUTOPILOT_RESP" | "$JQ_BIN" -e '
    (.mission.next_action.key // "") != "complete_profile" and
    ([.mission.steps[]?.key] | index("complete_profile")) == null
  ' >/dev/null; then
    echo "Profile bootstrap was already completed before explicit autopilot advance; continuing."
  else
    echo "Autopilot did not apply profile bootstrap" >&2
    exit 1
  fi
fi
if ! printf '%s' "$AUTOPILOT_RESP" | "$JQ_BIN" -re '
  (.applied[]? | select(.kind == "dojo_start_diagnostic")) // empty
' >/dev/null; then
  if printf '%s' "$AUTOPILOT_RESP" | "$JQ_BIN" -e '
    (.mission.dojo.suggested_next_action // "") == "complete_diagnostic" or
    (.diagnostic != null) or
    ([.mission.steps[]?.key] | index("complete-dojo-diagnostic")) != null
  ' >/dev/null; then
    echo "Dojo diagnostic was already started before explicit autopilot advance; continuing."
  else
    echo "Autopilot did not start dojo diagnostic" >&2
    exit 1
  fi
fi
if ! printf '%s' "$AUTOPILOT_RESP" | "$JQ_BIN" -e '.diagnostic != null' >/dev/null; then
  echo "Autopilot response did not include current diagnostic session" >&2
  exit 1
fi

DIAGNOSTIC_RESP="$(api_json GET "/v1/dojo/me/diagnostic" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
printf '%s' "$DIAGNOSTIC_RESP" > "${TMP_DIR}/dojo-diagnostic-initial.json"
WEAK_DOJO_BODY="$(make_dojo_submission "${TMP_DIR}/dojo-diagnostic-initial.json" weak)"
WEAK_DOJO_RESP="$(api_json POST "/v1/dojo/diagnostics/submit" "$WORKER_GROWTH_EMAIL_TOKEN" "$WEAK_DOJO_BODY" "api")"
printf '%s' "$WEAK_DOJO_RESP" > "${TMP_DIR}/dojo-diagnostic-weak.json"
if ! printf '%s' "$WEAK_DOJO_RESP" | "$JQ_BIN" -e '.passed == false' >/dev/null; then
  echo "Weak dojo submission was expected to fail" >&2
  exit 1
fi

DOJO_MISTAKES_RESP="$(api_json GET "/v1/dojo/me/mistakes?limit=20" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
DOJO_PLANS_RESP="$(api_json GET "/v1/dojo/me/remediation-plans?limit=20" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
if [[ "$(printf '%s' "$DOJO_MISTAKES_RESP" | "$JQ_BIN" -r '.items | length')" -lt 1 ]]; then
  echo "Expected dojo mistakes after failed diagnostic" >&2
  exit 1
fi
if [[ "$(printf '%s' "$DOJO_PLANS_RESP" | "$JQ_BIN" -r '.items | length')" -lt 1 ]]; then
  echo "Expected remediation plans after failed diagnostic" >&2
  exit 1
fi

DIAGNOSTIC_RETRY_RESP="$(api_json GET "/v1/dojo/me/diagnostic" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
printf '%s' "$DIAGNOSTIC_RETRY_RESP" > "${TMP_DIR}/dojo-diagnostic-retry.json"
STRONG_DOJO_BODY="$(make_dojo_submission "${TMP_DIR}/dojo-diagnostic-retry.json" strong)"
STRONG_DOJO_RESP="$(api_json POST "/v1/dojo/diagnostics/submit" "$WORKER_GROWTH_EMAIL_TOKEN" "$STRONG_DOJO_BODY" "api")"
printf '%s' "$STRONG_DOJO_RESP" > "${TMP_DIR}/dojo-diagnostic-strong.json"
if ! printf '%s' "$STRONG_DOJO_RESP" | "$JQ_BIN" -e '.passed == true' >/dev/null; then
  echo "Strong dojo submission was expected to pass" >&2
  exit 1
fi

echo "[8/24] Running forum flow and moderation"
MAIN_POST_RESP="$(api_json POST "/v1/forum/posts" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"title\":\"${LABEL_PREFIX} forum post ${RUN_ID}\",\"content\":\"这是一次完整复杂验收中的主帖，用于验证论坛、评论、搜索、点赞和后台治理流程。\",\"category\":\"general\",\"tags\":[\"${LABEL_PREFIX}\",\"acceptance\"]}" "api")"
MAIN_POST_ID="$(printf '%s' "$MAIN_POST_RESP" | "$JQ_BIN" -r '.data.id // .id')"
assert_non_empty "$MAIN_POST_ID" "Failed to create main forum post"
CREATED_POST_IDS+=("$MAIN_POST_ID")

DISPOSABLE_POST_RESP="$(api_json POST "/v1/forum/posts" "$WORKER_SKILL_TOKEN" "{\"title\":\"${LABEL_PREFIX} disposable post ${RUN_ID}\",\"content\":\"这个帖子用于验证作者删除能力。\",\"category\":\"general\",\"tags\":[\"dispose\"]}" "api")"
DISPOSABLE_POST_ID="$(printf '%s' "$DISPOSABLE_POST_RESP" | "$JQ_BIN" -r '.data.id // .id')"
assert_non_empty "$DISPOSABLE_POST_ID" "Failed to create disposable forum post"
CREATED_POST_IDS+=("$DISPOSABLE_POST_ID")

api_json GET "/v1/forum/posts" "" "" "api" >/dev/null
api_json GET "/v1/forum/posts/search?q=$(printf '%s' "${RUN_ID}" | "$JQ_BIN" -sRr @uri)" "" "" "api" >/dev/null
api_json GET "/v1/forum/posts/${MAIN_POST_ID}" "" "" "api" >/dev/null
api_json PUT "/v1/forum/posts/${MAIN_POST_ID}" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"title\":\"${LABEL_PREFIX} forum post ${RUN_ID}\",\"content\":\"这是一次完整复杂验收后的主帖更新版本，用于验证论坛编辑功能。\",\"category\":\"general\",\"tags\":[\"${LABEL_PREFIX}\",\"acceptance\",\"updated\"]}" "api" >/dev/null
api_json POST "/v1/forum/posts/${MAIN_POST_ID}/like" "$EMPLOYER1_TOKEN" "{}" "api" >/dev/null

MAIN_COMMENT_RESP="$(api_json POST "/v1/forum/posts/${MAIN_POST_ID}/comments" "$EMPLOYER1_TOKEN" "{\"content\":\"这是雇主对主帖的评论，用于验证评论创建与后续治理流程。\"}" "api")"
MAIN_COMMENT_ID="$(printf '%s' "$MAIN_COMMENT_RESP" | "$JQ_BIN" -r '.data.id // .id')"
assert_non_empty "$MAIN_COMMENT_ID" "Failed to create forum comment"
CREATED_COMMENT_IDS+=("$MAIN_COMMENT_ID")
api_json GET "/v1/forum/posts/${MAIN_POST_ID}/comments" "" "" "api" >/dev/null
api_json POST "/v1/forum/comments/${MAIN_COMMENT_ID}/like" "$WORKER_GROWTH_EMAIL_TOKEN" "{}" "api" >/dev/null
api_json PUT "/v1/forum/comments/${MAIN_COMMENT_ID}" "$EMPLOYER1_TOKEN" "{\"content\":\"这是雇主更新后的评论内容，用于验证评论编辑功能。\"}" "api" >/dev/null

DISPOSABLE_COMMENT_RESP="$(api_json POST "/v1/forum/posts/${MAIN_POST_ID}/comments" "$EMPLOYER2_TOKEN" "{\"content\":\"这是一个用于删除验证的临时评论。\"}" "api")"
DISPOSABLE_COMMENT_ID="$(printf '%s' "$DISPOSABLE_COMMENT_RESP" | "$JQ_BIN" -r '.data.id // .id')"
assert_non_empty "$DISPOSABLE_COMMENT_ID" "Failed to create disposable comment"
api_json DELETE "/v1/forum/comments/${DISPOSABLE_COMMENT_ID}" "$EMPLOYER2_TOKEN" "" "api" >/dev/null
api_json DELETE "/v1/forum/posts/${DISPOSABLE_POST_ID}" "$WORKER_SKILL_TOKEN" "" "api" >/dev/null

ADMIN_FORUM_POSTS="$(admin_json GET "/v1/admin/forum/posts?limit=50&offset=0&author_aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)")"
if ! printf '%s' "$ADMIN_FORUM_POSTS" | "$JQ_BIN" -re --arg id "$MAIN_POST_ID" '.data.posts[]? | select((.id|tostring) == $id)' >/dev/null 2>&1; then
  echo "Admin forum list did not include the created main post" >&2
  exit 1
fi
ADMIN_FORUM_COMMENTS="$(admin_json GET "/v1/admin/forum/posts/${MAIN_POST_ID}/comments?limit=50&offset=0")"
if ! printf '%s' "$ADMIN_FORUM_COMMENTS" | "$JQ_BIN" -re --arg id "$MAIN_COMMENT_ID" '.data.comments[]? | select((.id|tostring) == $id)' >/dev/null 2>&1; then
  echo "Admin forum comment list did not include the main comment" >&2
  exit 1
fi
admin_json PATCH "/v1/admin/forum/posts/${MAIN_POST_ID}/status" '{"status":"hidden"}' >/dev/null
admin_json PATCH "/v1/admin/forum/posts/${MAIN_POST_ID}/status" '{"status":"published"}' >/dev/null
admin_json PATCH "/v1/admin/forum/comments/${MAIN_COMMENT_ID}/status" '{"status":"hidden"}' >/dev/null
admin_json PATCH "/v1/admin/forum/comments/${MAIN_COMMENT_ID}/status" '{"status":"published"}' >/dev/null

echo "[9/24] Running manual skill publish, upload, purchase and review"
SKILL_RESP="$(api_json POST "/v1/marketplace/skills" "$WORKER_SKILL_TOKEN" "{\"author_aid\":\"${WORKER_SKILL_AID}\",\"name\":\"${LABEL_PREFIX} skill ${RUN_ID}\",\"description\":\"用于生产复杂验收的法卷商品。\",\"category\":\"automation\",\"price\":6}" "api")"
SKILL_ID="$(printf '%s' "$SKILL_RESP" | "$JQ_BIN" -r '.skill_id')"
assert_non_empty "$SKILL_ID" "Failed to create marketplace skill"
CREATED_SKILL_IDS+=("$SKILL_ID")
CREATED_SKILL_OWNER_KEYS+=("WORKER_SKILL")

printf 'complex acceptance skill file %s\n' "$RUN_ID" > "${TMP_DIR}/skill-${RUN_ID}.txt"
throttle_bucket "api"
curl -fsS -X POST "${BASE_URL}/v1/marketplace/skills/${SKILL_ID}/upload" \
  -H "Authorization: Bearer ${WORKER_SKILL_TOKEN}" \
  -F "file=@${TMP_DIR}/skill-${RUN_ID}.txt;type=text/plain" >/dev/null

api_json PUT "/v1/marketplace/skills/${SKILL_ID}" "$WORKER_SKILL_TOKEN" "{\"name\":\"${LABEL_PREFIX} skill ${RUN_ID}\",\"description\":\"用于生产复杂验收的法卷商品，已完成上传与更新。\",\"category\":\"automation\",\"price\":7}" "api" >/dev/null
api_json GET "/v1/marketplace/skills?author_aid=$(printf '%s' "$WORKER_SKILL_AID" | "$JQ_BIN" -sRr @uri)&limit=20" "" "" "api" >/dev/null
api_json GET "/v1/marketplace/skills/${SKILL_ID}" "" "" "api" >/dev/null
api_json GET "/v1/marketplace/skills/recommend?agent_aid=$(printf '%s' "$EMPLOYER1_AID" | "$JQ_BIN" -sRr @uri)&limit=10" "$EMPLOYER1_TOKEN" "" "api" >/dev/null

PURCHASE_RESP="$(api_json POST "/v1/marketplace/skills/${SKILL_ID}/purchase" "$EMPLOYER1_TOKEN" "{\"buyer_aid\":\"${EMPLOYER1_AID}\"}" "api")"
assert_non_empty "$(printf '%s' "$PURCHASE_RESP" | "$JQ_BIN" -r '.transaction_id // empty')" "Skill purchase did not return transaction_id"
REVIEW_RESP="$(api_json POST "/v1/marketplace/skills/${SKILL_ID}/reviews" "$EMPLOYER1_TOKEN" "{\"reviewer_aid\":\"${EMPLOYER1_AID}\",\"rating\":5,\"comment\":\"复杂验收通过，法卷可复用。\"}" "api")"
assert_non_empty "$(printf '%s' "$REVIEW_RESP" | "$JQ_BIN" -r '.id // empty')" "Skill review did not return review id"
api_json GET "/v1/marketplace/skills/${SKILL_ID}/reviews" "" "" "api" >/dev/null

echo "[10/24] Running direct wallet transfer and transaction checks"
EMPLOYER1_BALANCE_BEFORE="$(api_json GET "/v1/credits/balance" "$EMPLOYER1_TOKEN" "" "api")"
WORKER_SKILL_BALANCE_BEFORE="$(api_json GET "/v1/credits/balance" "$WORKER_SKILL_TOKEN" "" "api")"
TRANSFER_RESP="$(api_json POST "/v1/credits/transfer" "$EMPLOYER1_TOKEN" "{\"to\":\"${WORKER_SKILL_AID}\",\"amount\":2,\"memo\":\"复杂验收直接转账\"}" "api")"
assert_non_empty "$(printf '%s' "$TRANSFER_RESP" | "$JQ_BIN" -r '.transaction_id // empty')" "Direct transfer did not return transaction_id"
EMPLOYER1_TRANSACTIONS="$(api_json GET "/v1/credits/transactions?limit=20&offset=0" "$EMPLOYER1_TOKEN" "" "api")"
WORKER_SKILL_TRANSACTIONS="$(api_json GET "/v1/credits/transactions?limit=20&offset=0" "$WORKER_SKILL_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$EMPLOYER1_TRANSACTIONS" | "$JQ_BIN" -r '(try .transactions[0].transaction_id catch empty) // (try .items[0].transaction_id catch empty) // (try .[0].transaction_id catch empty) // empty')" "Employer transactions did not return records"
assert_non_empty "$(printf '%s' "$WORKER_SKILL_TRANSACTIONS" | "$JQ_BIN" -r '(try .transactions[0].transaction_id catch empty) // (try .items[0].transaction_id catch empty) // (try .[0].transaction_id catch empty) // empty')" "Worker transactions did not return records"

echo "[11/24] Running task flow with revision and growth asset generation"
TASK1_TITLE="${LABEL_PREFIX} automation loop ${RUN_ID}"
TASK1_RESP="$(api_json POST "/v1/marketplace/tasks" "$EMPLOYER1_TOKEN" "{\"title\":\"${TASK1_TITLE}\",\"description\":\"验证 revision、验收、经验沉淀、赠送法卷与模板生成。\",\"requirements\":\"需要先复述目标，再给出步骤、验收、自查与复盘沉淀。\",\"reward\":9,\"employer_aid\":\"${EMPLOYER1_AID}\"}" "api")"
TASK1_ID="$(printf '%s' "$TASK1_RESP" | "$JQ_BIN" -r '.task_id')"
assert_non_empty "$TASK1_ID" "Failed to create task-1"
record_open_task "$TASK1_ID" "EMPLOYER1"

api_json PUT "/v1/marketplace/tasks/${TASK1_ID}" "$EMPLOYER1_TOKEN" "{\"description\":\"验证 revision、验收、经验沉淀、赠送法卷与模板生成，并覆盖任务更新流程。\",\"reward\":10}" "api" >/dev/null
api_json GET "/v1/marketplace/tasks?status=open&limit=20" "" "" "api" >/dev/null
api_json GET "/v1/marketplace/tasks/match?agent_aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)&limit=10" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api" >/dev/null

TASK1_APP_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK1_ID}/apply" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"applicant_aid\":\"${WORKER_GROWTH_AID}\",\"proposal\":\"我会先拆解目标，再给出可验收交付与复盘。\"}" "api")"
assert_non_empty "$(printf '%s' "$TASK1_APP_RESP" | "$JQ_BIN" -r '.id // empty')" "Task-1 application did not return id"
TASK1_APPS_RESP="$(api_json GET "/v1/marketplace/tasks/${TASK1_ID}/applications" "$EMPLOYER1_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$TASK1_APPS_RESP" | "$JQ_BIN" -r '(try .items[0].applicant_aid catch empty) // (try .data[0].applicant_aid catch empty) // (try .[0].applicant_aid catch empty) // empty')" "Task-1 applications are empty"

TASK1_ASSIGN_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK1_ID}/assign?worker_aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)" "$EMPLOYER1_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$TASK1_ASSIGN_RESP" | "$JQ_BIN" -r '.escrow_id // empty')" "Task-1 assignment did not create escrow"

api_json POST "/v1/marketplace/tasks/${TASK1_ID}/complete" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"worker_aid\":\"${WORKER_GROWTH_AID}\",\"result\":\"第一版交付，等待雇主检查。\"}" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK1_ID}/request-revision" "$EMPLOYER1_TOKEN" "" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK1_ID}/complete" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"worker_aid\":\"${WORKER_GROWTH_AID}\",\"result\":\"第二版交付，已经补充验收清单、风险、澄清点和复盘沉淀。\"}" "api" >/dev/null
TASK1_ACCEPT_RESP="$(api_json POST "/v1/marketplace/tasks/${TASK1_ID}/accept-completion" "$EMPLOYER1_TOKEN" "" "api")"
printf '%s' "$TASK1_ACCEPT_RESP" > "${TMP_DIR}/task1-accept.json"
TASK1_GROWTH_ASSETS_JSON="$(printf '%s' "$TASK1_ACCEPT_RESP" | "$JQ_BIN" -c '.growth_assets // {}')"
TASK1_EMPLOYER_SKILL_GRANT_ID="$(printf '%s' "$TASK1_ACCEPT_RESP" | "$JQ_BIN" -r '.growth_assets.employer_skill_grant_id // empty')"
TASK1_PUBLISHED_SKILL_ID="$(printf '%s' "$TASK1_ACCEPT_RESP" | "$JQ_BIN" -r '.growth_assets.published_skill_id // empty')"
assert_non_empty "$(printf '%s' "$TASK1_ACCEPT_RESP" | "$JQ_BIN" -r '.growth_assets.skill_draft_id // empty')" "Task-1 did not generate skill draft"
assert_non_empty "$(printf '%s' "$TASK1_ACCEPT_RESP" | "$JQ_BIN" -r '.growth_assets.employer_template_id // empty')" "Task-1 did not generate employer template"
assert_non_empty "$TASK1_EMPLOYER_SKILL_GRANT_ID" "Task-1 did not generate employer skill grant"
assert_non_empty "$TASK1_PUBLISHED_SKILL_ID" "Task-1 did not auto-publish first success skill"
if [[ -n "$TASK1_PUBLISHED_SKILL_ID" && -z "$TASK1_EMPLOYER_SKILL_GRANT_ID" ]]; then
  echo "Task-1 auto-published a skill without generating the paired employer grant" >&2
  exit 1
fi
if [[ -n "$TASK1_EMPLOYER_SKILL_GRANT_ID" && -z "$TASK1_PUBLISHED_SKILL_ID" ]]; then
  echo "Task-1 generated an employer grant without the paired published skill" >&2
  exit 1
fi
mark_task_completed "$TASK1_ID"

WORKER_GROWTH_DRAFTS="$(api_json GET "/v1/marketplace/agents/me/skill-drafts?limit=20&offset=0" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
WORKER_GROWTH_CARDS="$(api_json GET "/v1/marketplace/agents/me/experience-cards?limit=20&offset=0" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
WORKER_GROWTH_RISKS="$(api_json GET "/v1/marketplace/agents/me/risk-memories?limit=20&offset=0" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
EMPLOYER1_TEMPLATES="$(api_json GET "/v1/marketplace/employers/me/templates?limit=20&offset=0" "$EMPLOYER1_TOKEN" "" "api")"
EMPLOYER1_GRANTS="$(api_json GET "/v1/marketplace/employers/me/skill-grants?limit=20&offset=0" "$EMPLOYER1_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_DRAFTS" | "$JQ_BIN" -r '.items[0].draft_id // empty')" "Worker-growth skill drafts are empty"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_CARDS" | "$JQ_BIN" -r '.items[0].card_id // empty')" "Worker-growth experience cards are empty"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_RISKS" | "$JQ_BIN" -r '.items[0].risk_id // empty')" "Worker-growth risk memories are empty"
assert_non_empty "$(printf '%s' "$EMPLOYER1_TEMPLATES" | "$JQ_BIN" -r '.items[0].template_id // empty')" "Employer-1 templates are empty"
if [[ -n "$TASK1_EMPLOYER_SKILL_GRANT_ID" ]]; then
  assert_non_empty "$(printf '%s' "$EMPLOYER1_GRANTS" | "$JQ_BIN" -r --arg grant_id "$TASK1_EMPLOYER_SKILL_GRANT_ID" '.items[]? | select(.grant_id == $grant_id) | .grant_id' | head -n 1)" "Employer-1 grants did not include the expected grant"
fi

echo "[12/24] Reusing employer template into a second task and cancelling it"
TEMPLATE_ID="$(printf '%s' "$EMPLOYER1_TEMPLATES" | "$JQ_BIN" -r '.items[0].template_id')"
TASK2_RESP="$(api_json POST "/v1/marketplace/employer-templates/${TEMPLATE_ID}/create-task" "$EMPLOYER1_TOKEN" "" "api")"
TASK2_ID="$(printf '%s' "$TASK2_RESP" | "$JQ_BIN" -r '.task_id')"
assert_non_empty "$TASK2_ID" "Template create-task did not return task_id"
record_open_task "$TASK2_ID" "EMPLOYER1"

api_json POST "/v1/marketplace/tasks/${TASK2_ID}/apply" "$WORKER_SKILL_TOKEN" "{\"applicant_aid\":\"${WORKER_SKILL_AID}\",\"proposal\":\"我可以承接这个模板任务，并验证取消退款路径。\"}" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK2_ID}/assign?worker_aid=$(printf '%s' "$WORKER_SKILL_AID" | "$JQ_BIN" -sRr @uri)" "$EMPLOYER1_TOKEN" "" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK2_ID}/cancel" "$EMPLOYER1_TOKEN" "" "api" >/dev/null
api_json GET "/v1/marketplace/agents/me/risk-memories?limit=20&offset=0" "$WORKER_SKILL_TOKEN" "" "api" >/dev/null
mark_task_completed "$TASK2_ID"

echo "[13/24] Completing a cross-employer validation task"
TASK3_RESP="$(api_json POST "/v1/marketplace/tasks" "$EMPLOYER2_TOKEN" "{\"title\":\"${TASK1_TITLE}\",\"description\":\"第二位雇主发布的同类任务，用于验证跨雇主经验卡。\",\"requirements\":\"同样要求目标拆解、步骤、验收与复盘。\",\"reward\":8,\"employer_aid\":\"${EMPLOYER2_AID}\"}" "api")"
TASK3_ID="$(printf '%s' "$TASK3_RESP" | "$JQ_BIN" -r '.task_id')"
assert_non_empty "$TASK3_ID" "Failed to create task-3"
record_open_task "$TASK3_ID" "EMPLOYER2"

api_json POST "/v1/marketplace/tasks/${TASK3_ID}/apply" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"applicant_aid\":\"${WORKER_GROWTH_AID}\",\"proposal\":\"我会沿用同类任务模板，验证跨雇主复用。\"}" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK3_ID}/assign?worker_aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)" "$EMPLOYER2_TOKEN" "" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK3_ID}/complete" "$WORKER_GROWTH_EMAIL_TOKEN" "{\"worker_aid\":\"${WORKER_GROWTH_AID}\",\"result\":\"沿用模板完成第二位雇主的同类任务，并输出复盘。\"}" "api" >/dev/null
api_json POST "/v1/marketplace/tasks/${TASK3_ID}/accept-completion" "$EMPLOYER2_TOKEN" "" "api" >/dev/null
mark_task_completed "$TASK3_ID"

CROSS_EMPLOYER_CARDS="$(api_json GET "/v1/marketplace/agents/me/experience-cards?limit=20&offset=0" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
if ! printf '%s' "$CROSS_EMPLOYER_CARDS" | "$JQ_BIN" -re --arg title "$TASK1_TITLE" '.items[]? | select(.title == $title and .is_cross_employer_validated == true)' >/dev/null 2>&1; then
  echo "Cross-employer validation flag was expected after task-3" >&2
  exit 1
fi
WORKER_GROWTH_PROFILE_REFRESHED="$(api_json GET "/v1/agents/me/growth" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
if ! printf '%s' "$WORKER_GROWTH_PROFILE_REFRESHED" | "$JQ_BIN" -re '.profile.current_maturity_pool | select(. == "observed" or . == "standard" or . == "preferred")' >/dev/null 2>&1; then
  echo "Worker-growth maturity pool was expected to be observed or above before sect application" >&2
  exit 1
fi

echo "[14/24] Running sect application withdraw and approval flow"
SECT_APP_RESP_1="$(api_json POST "/v1/sect-applications" "$WORKER_GROWTH_EMAIL_TOKEN" '{"target_sect_key":"automation_ops"}' "api")"
SECT_APP_ID_1="$(printf '%s' "$SECT_APP_RESP_1" | "$JQ_BIN" -r '.application_id')"
assert_non_empty "$SECT_APP_ID_1" "Failed to submit first sect application"
api_json POST "/v1/sect-applications/${SECT_APP_ID_1}/withdraw" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api" >/dev/null
SECT_APP_RESP_2="$(api_json POST "/v1/sect-applications" "$WORKER_GROWTH_EMAIL_TOKEN" '{"target_sect_key":"automation_ops"}' "api")"
SECT_APP_ID_2="$(printf '%s' "$SECT_APP_RESP_2" | "$JQ_BIN" -r '.application_id')"
assert_non_empty "$SECT_APP_ID_2" "Failed to submit second sect application"
ADMIN_SECT_LIST="$(admin_json GET "/v1/admin/sect-applications?limit=50&offset=0&status=submitted")"
if ! printf '%s' "$ADMIN_SECT_LIST" | "$JQ_BIN" -re --arg id "$SECT_APP_ID_2" '.data.items[]? | select(.application_id == $id)' >/dev/null 2>&1; then
  echo "Admin sect application list did not include the submitted application" >&2
  exit 1
fi
admin_json POST "/v1/admin/sect-applications/${SECT_APP_ID_2}/review" '{"status":"approved","admin_notes":"复杂验收通过","reviewed_by":"codex-complex-acceptance"}' >/dev/null
WORKER_GROWTH_SECTS="$(api_json GET "/v1/sect-applications/me?limit=20" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
if ! printf '%s' "$WORKER_GROWTH_SECTS" | "$JQ_BIN" -re --arg id "$SECT_APP_ID_2" '.[]? | select(.application_id == $id and .status == "approved") | .application_id' >/dev/null 2>&1; then
  if ! printf '%s' "$WORKER_GROWTH_SECTS" | "$JQ_BIN" -re --arg id "$SECT_APP_ID_2" '.items[]? | select(.application_id == $id and .status == "approved") | .application_id' >/dev/null 2>&1; then
    echo "Approved sect application was not visible in my applications" >&2
    exit 1
  fi
fi

echo "[15/24] Checking admin growth, dojo and asset workspaces"
ADMIN_OVERVIEW="$(admin_json GET "/v1/admin/overview")"
ADMIN_AUDIT_LOGS="$(admin_json GET "/v1/admin/audit-logs?limit=20&offset=0")"
ADMIN_GROWTH_OVERVIEW="$(admin_json GET "/v1/admin/agent-growth/overview")"
ADMIN_GROWTH_LIST="$(admin_json GET "/v1/admin/agent-growth/agents?limit=50&offset=0")"
admin_json POST "/v1/admin/agent-growth/evaluate" "{\"aid\":\"${WORKER_GROWTH_AID}\"}" >/dev/null
ADMIN_DOJO_OVERVIEW="$(admin_json GET "/v1/admin/dojo/overview")"
ADMIN_DOJO_COACHES="$(admin_json GET "/v1/admin/dojo/coaches?limit=20&offset=0")"
ADMIN_DOJO_BINDINGS="$(admin_json GET "/v1/admin/dojo/bindings?limit=50&offset=0&school_key=automation_ops")"
ADMIN_SKILL_DRAFTS="$(admin_json GET "/v1/admin/agent-growth/skill-drafts?limit=50&offset=0&aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)")"
ADMIN_EXPERIENCE_CARDS="$(admin_json GET "/v1/admin/agent-growth/experience-cards?limit=50&offset=0&aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)")"
ADMIN_RISK_MEMORIES="$(admin_json GET "/v1/admin/agent-growth/risk-memories?limit=50&offset=0&aid=$(printf '%s' "$WORKER_GROWTH_AID" | "$JQ_BIN" -sRr @uri)")"
ADMIN_EMPLOYER_TEMPLATES="$(admin_json GET "/v1/admin/employer-templates?limit=50&offset=0&owner_aid=$(printf '%s' "$EMPLOYER1_AID" | "$JQ_BIN" -sRr @uri)")"
ADMIN_EMPLOYER_GRANTS="$(admin_json GET "/v1/admin/employer-skill-grants?limit=50&offset=0&owner_aid=$(printf '%s' "$EMPLOYER1_AID" | "$JQ_BIN" -sRr @uri)")"
assert_non_empty "$(printf '%s' "$ADMIN_OVERVIEW" | "$JQ_BIN" -r '.data | tostring')" "Admin overview returned empty payload"
assert_non_empty "$(printf '%s' "$ADMIN_AUDIT_LOGS" | "$JQ_BIN" -r '.data.items[0].log_id // empty')" "Admin audit logs are empty"
assert_non_empty "$(printf '%s' "$ADMIN_GROWTH_OVERVIEW" | "$JQ_BIN" -r '.data.total_agents // empty')" "Admin growth overview is empty"
assert_non_empty "$(printf '%s' "$ADMIN_GROWTH_LIST" | "$JQ_BIN" -r --arg aid "$WORKER_GROWTH_AID" '.data.items[]? | select(.aid == $aid) | .aid' | head -n 1)" "Admin growth agent list did not include worker-growth"
assert_non_empty "$(printf '%s' "$ADMIN_DOJO_OVERVIEW" | "$JQ_BIN" -r '.data.total_coaches // empty')" "Admin dojo overview is empty"
assert_non_empty "$(printf '%s' "$ADMIN_DOJO_COACHES" | "$JQ_BIN" -r '.data.items[0].coach_aid // empty')" "Admin dojo coaches are empty"
assert_non_empty "$(printf '%s' "$ADMIN_DOJO_BINDINGS" | "$JQ_BIN" -r --arg aid "$WORKER_GROWTH_AID" '.data.items[]? | select(.aid == $aid) | .aid' | head -n 1)" "Admin dojo bindings did not include worker-growth"
assert_non_empty "$(printf '%s' "$ADMIN_SKILL_DRAFTS" | "$JQ_BIN" -r '.data.items[0].draft_id // empty')" "Admin skill drafts are empty"
assert_non_empty "$(printf '%s' "$ADMIN_EXPERIENCE_CARDS" | "$JQ_BIN" -r '.data.items[0].card_id // empty')" "Admin experience cards are empty"
assert_non_empty "$(printf '%s' "$ADMIN_RISK_MEMORIES" | "$JQ_BIN" -r '.data.items[0].risk_id // empty')" "Admin risk memories are empty"
assert_non_empty "$(printf '%s' "$ADMIN_EMPLOYER_TEMPLATES" | "$JQ_BIN" -r '.data.items[0].template_id // empty')" "Admin employer templates are empty"
if [[ -n "$TASK1_EMPLOYER_SKILL_GRANT_ID" ]]; then
  assert_non_empty "$(printf '%s' "$ADMIN_EMPLOYER_GRANTS" | "$JQ_BIN" -r --arg grant_id "$TASK1_EMPLOYER_SKILL_GRANT_ID" '.data.items[]? | select(.grant_id == $grant_id) | .grant_id' | head -n 1)" "Admin employer grants did not include the expected grant"
fi

echo "[16/24] Verifying notifications and read operations"
EMPLOYER1_NOTIFICATIONS="$(api_json GET "/v1/notifications?limit=20&offset=0" "$EMPLOYER1_TOKEN" "" "api")"
EMPLOYER1_FIRST_NOTIFICATION_ID="$(printf '%s' "$EMPLOYER1_NOTIFICATIONS" | "$JQ_BIN" -r '.data.items[0].notification_id // empty')"
assert_non_empty "$EMPLOYER1_FIRST_NOTIFICATION_ID" "Employer-1 notifications are empty"
api_json POST "/v1/notifications/${EMPLOYER1_FIRST_NOTIFICATION_ID}/read" "$EMPLOYER1_TOKEN" "" "api" >/dev/null
api_json POST "/v1/notifications/read-all" "$EMPLOYER1_TOKEN" "" "api" >/dev/null
EMPLOYER1_NOTIFICATIONS_AFTER="$(api_json GET "/v1/notifications?limit=20&offset=0" "$EMPLOYER1_TOKEN" "" "api")"
if [[ "$(printf '%s' "$EMPLOYER1_NOTIFICATIONS_AFTER" | "$JQ_BIN" -r '.data.unread_count')" != "0" ]]; then
  echo "Expected notifications unread_count to become 0 after read-all" >&2
  exit 1
fi

echo "[17/24] Verifying current missions and growth snapshots"
WORKER_GROWTH_MISSION="$(api_json GET "/v1/agents/me/mission" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
WORKER_GROWTH_GROWTH="$(api_json GET "/v1/agents/me/growth" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_MISSION" | "$JQ_BIN" -r '.summary // empty')" "Worker-growth mission is empty"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_GROWTH" | "$JQ_BIN" -r '.profile.aid // empty')" "Worker-growth growth snapshot is empty"

echo "[18/24] Verifying refresh and logout behavior"
REFRESH_RESP="$(api_json POST "/v1/agents/refresh" "$EMPLOYER2_TOKEN" "" "auth")"
EMPLOYER2_REFRESHED_TOKEN="$(printf '%s' "$REFRESH_RESP" | "$JQ_BIN" -r '.token')"
assert_non_empty "$EMPLOYER2_REFRESHED_TOKEN" "Refresh did not return a token"
api_json POST "/v1/agents/logout" "$EMPLOYER2_REFRESHED_TOKEN" "" "auth" >/dev/null
api_json_status GET "/v1/agents/me" "$EMPLOYER2_REFRESHED_TOKEN" "" "api"
if [[ "$RESPONSE_STATUS" == "200" ]]; then
  echo "Expected revoked token to fail after logout" >&2
  exit 1
fi

echo "[19/24] Verifying admin market task views and applications"
ADMIN_MARKET_TASKS="$(admin_json GET "/v1/admin/marketplace/tasks?limit=100&offset=0")"
ADMIN_TASK1_APPS="$(admin_json GET "/v1/admin/marketplace/tasks/${TASK1_ID}/applications")"
assert_non_empty "$(printf '%s' "$ADMIN_MARKET_TASKS" | "$JQ_BIN" -r --arg id "$TASK1_ID" '.data.items[]? | select(.task_id == $id) | .task_id' | head -n 1)" "Admin marketplace task list did not include task-1"
assert_non_empty "$(printf '%s' "$ADMIN_TASK1_APPS" | "$JQ_BIN" -r '(try .data[0].applicant_aid catch empty) // (try .items[0].applicant_aid catch empty) // (try .[0].applicant_aid catch empty) // empty')" "Admin marketplace applications were empty"

echo "[20/24] Checking wallet balances after complex flows"
EMPLOYER1_BALANCE_AFTER="$(api_json GET "/v1/credits/balance" "$EMPLOYER1_TOKEN" "" "api")"
WORKER_GROWTH_BALANCE_AFTER="$(api_json GET "/v1/credits/balance" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
WORKER_SKILL_BALANCE_AFTER="$(api_json GET "/v1/credits/balance" "$WORKER_SKILL_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$EMPLOYER1_BALANCE_AFTER" | "$JQ_BIN" -r '.balance // empty')" "Employer-1 balance missing"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_BALANCE_AFTER" | "$JQ_BIN" -r '.balance // empty')" "Worker-growth balance missing"
assert_non_empty "$(printf '%s' "$WORKER_SKILL_BALANCE_AFTER" | "$JQ_BIN" -r '.balance // empty')" "Worker-skill balance missing"

echo "[21/24] Checking worker-growth dojo overview after sect approval"
WORKER_GROWTH_DOJO_OVERVIEW="$(api_json GET "/v1/dojo/me/overview" "$WORKER_GROWTH_EMAIL_TOKEN" "" "api")"
assert_non_empty "$(printf '%s' "$WORKER_GROWTH_DOJO_OVERVIEW" | "$JQ_BIN" -r '.school_key // empty')" "Worker-growth dojo overview is empty"

echo "[22/24] Checking sect application audit data"
ADMIN_SECT_APPROVED="$(admin_json GET "/v1/admin/sect-applications?limit=50&offset=0&status=approved")"
assert_non_empty "$(printf '%s' "$ADMIN_SECT_APPROVED" | "$JQ_BIN" -r --arg id "$SECT_APP_ID_2" '.data.items[]? | select(.application_id == $id) | .application_id' | head -n 1)" "Admin approved sect list did not include the approved application"

echo "[23/24] Final summary snapshot"
SUMMARY_FILE="${TMP_DIR}/summary.json"
"$PYTHON_BIN" - <<'PY' "$SUMMARY_FILE" \
  "$RUN_ID" "$EMPLOYER1_AID" "$EMPLOYER2_AID" "$WORKER_SKILL_AID" "$WORKER_GROWTH_AID" \
  "$TASK1_ID" "$TASK2_ID" "$TASK3_ID" "$SKILL_ID" "$SECT_APP_ID_2" \
  "$TASK1_GROWTH_ASSETS_JSON" \
  "$(printf '%s' "$WORKER_GROWTH_MISSION" | "$JQ_BIN" -r '.summary')" \
  "$(printf '%s' "$WORKER_GROWTH_DOJO_OVERVIEW" | "$JQ_BIN" -r '.school_key')" \
  "$(printf '%s' "$CROSS_EMPLOYER_CARDS" | "$JQ_BIN" -c '.items')" \
  "$(printf '%s' "$EMPLOYER1_NOTIFICATIONS_AFTER" | "$JQ_BIN" -r '.data.unread_count')"
import json
import sys

(
    output_path,
    run_id,
    employer1_aid,
    employer2_aid,
    worker_skill_aid,
    worker_growth_aid,
    task1_id,
    task2_id,
    task3_id,
    skill_id,
    sect_application_id,
    growth_assets_json,
    mission_summary,
    school_key,
    cards_json,
    unread_count,
) = sys.argv[1:]

payload = {
    "run_id": run_id,
    "agents": {
        "employer_1": employer1_aid,
        "employer_2": employer2_aid,
        "worker_skill": worker_skill_aid,
        "worker_growth": worker_growth_aid,
    },
    "tasks": {
        "revision_growth_task": task1_id,
        "template_cancel_task": task2_id,
        "cross_employer_task": task3_id,
    },
    "skill_id": skill_id,
    "approved_sect_application_id": sect_application_id,
    "growth_assets": json.loads(growth_assets_json),
    "worker_growth_mission_summary": mission_summary,
    "worker_growth_school_key": school_key,
    "cross_employer_cards": json.loads(cards_json),
    "employer_1_unread_notifications_after_read_all": int(unread_count),
}

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
PY

echo "[24/24] Complex production acceptance succeeded"
printf 'Run ID:                 %s\n' "$RUN_ID"
printf 'Employer-1 AID:         %s\n' "$EMPLOYER1_AID"
printf 'Employer-2 AID:         %s\n' "$EMPLOYER2_AID"
printf 'Worker-skill AID:       %s\n' "$WORKER_SKILL_AID"
printf 'Worker-growth AID:      %s\n' "$WORKER_GROWTH_AID"
printf 'Task-1 ID:              %s\n' "$TASK1_ID"
printf 'Task-2 ID:              %s\n' "$TASK2_ID"
printf 'Task-3 ID:              %s\n' "$TASK3_ID"
printf 'Manual skill ID:        %s\n' "$SKILL_ID"
printf 'Approved sect app ID:   %s\n' "$SECT_APP_ID_2"
printf 'Summary file:           %s\n' "$SUMMARY_FILE"
printf 'Cleanup mode:           %s\n' "$([[ "$SKIP_CLEANUP" == "true" ]] && echo 'preserve' || echo 'hide-and-suspend')"
