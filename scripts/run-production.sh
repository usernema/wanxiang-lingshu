#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.production}"
EXAMPLE_FILE="${EXAMPLE_FILE:-${ROOT}/.env.production.example}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.production.yml}"
DEBUG_COMPOSE_FILE="${DEBUG_COMPOSE_FILE:-${ROOT}/docker-compose.production.debug.yml}"
LEGACY_ENV_FILE="${ROOT}/.env.trial"

OVERRIDE_VARS=(
  ENABLE_DEBUG_OVERLAY
  RABBITMQ_MANAGEMENT_PORT
  MINIO_API_PORT
  MINIO_CONSOLE_PORT
  ENABLE_TLS
  PUBLIC_HOSTNAME
  PUBLIC_SCHEME
  HTTP_PORT
  HTTPS_PORT
  TLS_CERTS_DIR
  TLS_CERT_PATH
  TLS_KEY_PATH
  ALLOWED_ORIGINS
  JWT_SECRET
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_PASSWORD
  SMTP_FROM
  EMAIL_CODE_EXPIRATION
  EMAIL_ALLOW_INLINE_CODE_IN_DEV
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  RABBITMQ_DEFAULT_PASS
  MINIO_ROOT_PASSWORD
  MINIO_ROOT_USER
  POSTGRES_DB
  POSTGRES_USER
  IDENTITY_SERVICE_URL
  FORUM_SERVICE_URL
  CREDIT_SERVICE_URL
  MARKETPLACE_SERVICE_URL
  TRAINING_SERVICE_URL
  RANKING_SERVICE_URL
  HEALTH_OPTIONAL_SERVICES
  AUTO_ACTIVATE_NEW_AGENTS
  APP_MODE
  VITE_APP_MODE
  TRIAL_ENABLE_DEBUG_OVERLAY
  TRIAL_RABBITMQ_MANAGEMENT_PORT
  TRIAL_MINIO_API_PORT
  TRIAL_MINIO_CONSOLE_PORT
  TRIAL_ENABLE_TLS
  TRIAL_PUBLIC_HOSTNAME
  TRIAL_PUBLIC_SCHEME
  TRIAL_HTTP_PORT
  TRIAL_HTTPS_PORT
  TRIAL_TLS_CERTS_DIR
  TRIAL_TLS_CERT_PATH
  TRIAL_TLS_KEY_PATH
  TRIAL_VITE_APP_MODE
  TRIAL_VITE_BANNER_LABEL
  TRIAL_VITE_GATEWAY_LABEL
  TRIAL_VITE_RESET_SESSIONS_ON_LOAD
  TRIAL_AUTO_ACTIVATE
)

capture_override() {
  local name="$1"
  printf -v "__OVERRIDE_${name}" '%s' "${!name-}"
}

restore_override() {
  local name="$1"
  local override_name="__OVERRIDE_${name}"
  local value="${!override_name-}"
  if [[ -n "$value" ]]; then
    export "${name}=${value}"
  fi
}

compose() {
  if [[ -n "${COMPOSE_BIN:-}" ]]; then
    if [[ "$COMPOSE_BIN" == "docker compose" ]]; then
      docker compose "$@"
      return
    fi
    "$COMPOSE_BIN" "$@"
    return
  fi

  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

csv_contains() {
  local csv="${1:-}"
  local needle="$2"
  local item
  IFS=',' read -r -a items <<<"$csv"
  for item in "${items[@]}"; do
    if [[ "$(trim "$item")" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

promote_legacy_var() {
  local current_name="$1"
  local legacy_name="$2"
  if [[ -z "${!current_name-}" && -n "${!legacy_name-}" ]]; then
    export "${current_name}=${!legacy_name}"
  fi
}

backfill_legacy_var() {
  local current_name="$1"
  local legacy_name="$2"
  if [[ -z "${!legacy_name-}" && -n "${!current_name-}" ]]; then
    export "${legacy_name}=${!current_name}"
  fi
}

ensure_not_placeholders() {
  local name="$1"
  local value="$2"
  shift 2

  if [[ -z "$value" ]]; then
    echo "Refusing to start production with empty ${name}" >&2
    exit 1
  fi

  local placeholder
  for placeholder in "$@"; do
    if [[ "$value" == "$placeholder" ]]; then
      echo "Refusing to start production with placeholder ${name}. Update ${ENV_FILE} before public use." >&2
      exit 1
    fi
  done
}

warn_optional_service() {
  local service_name="$1"
  local service_url="$2"
  echo "Warning: HEALTH_OPTIONAL_SERVICES includes '${service_name}' but the production compose file does not start that service." >&2
  echo "         ${service_name} URL: ${service_url}" >&2
  echo "         Keep HEALTH_OPTIONAL_SERVICES empty unless you intentionally publish and verify that dependency." >&2
}

legacy_pairs=(
  "ENABLE_DEBUG_OVERLAY:TRIAL_ENABLE_DEBUG_OVERLAY"
  "RABBITMQ_MANAGEMENT_PORT:TRIAL_RABBITMQ_MANAGEMENT_PORT"
  "MINIO_API_PORT:TRIAL_MINIO_API_PORT"
  "MINIO_CONSOLE_PORT:TRIAL_MINIO_CONSOLE_PORT"
  "ENABLE_TLS:TRIAL_ENABLE_TLS"
  "PUBLIC_HOSTNAME:TRIAL_PUBLIC_HOSTNAME"
  "PUBLIC_SCHEME:TRIAL_PUBLIC_SCHEME"
  "HTTP_PORT:TRIAL_HTTP_PORT"
  "HTTPS_PORT:TRIAL_HTTPS_PORT"
  "TLS_CERTS_DIR:TRIAL_TLS_CERTS_DIR"
  "TLS_CERT_PATH:TRIAL_TLS_CERT_PATH"
  "TLS_KEY_PATH:TRIAL_TLS_KEY_PATH"
  "VITE_APP_MODE:TRIAL_VITE_APP_MODE"
  "AUTO_ACTIVATE_NEW_AGENTS:TRIAL_AUTO_ACTIVATE"
)

for name in "${OVERRIDE_VARS[@]}"; do
  capture_override "$name"
done

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$LEGACY_ENV_FILE" ]]; then
    echo "Missing .env.production. Copying current .env.trial into .env.production ..."
    cp "$LEGACY_ENV_FILE" "$ENV_FILE"
  else
    echo "Missing .env.production. Copying from .env.production.example ..."
    cp "$EXAMPLE_FILE" "$ENV_FILE"
  fi
  echo "Created $ENV_FILE. Replace all placeholder secrets before exposing this environment publicly."
fi

set -a
source "$ENV_FILE"
set +a

for name in "${OVERRIDE_VARS[@]}"; do
  restore_override "$name"
done

for pair in "${legacy_pairs[@]}"; do
  IFS=':' read -r current_name legacy_name <<<"$pair"
  promote_legacy_var "$current_name" "$legacy_name"
done

if [[ -z "${APP_MODE:-}" || "${APP_MODE:-}" == "trial" ]]; then
  export APP_MODE="production"
fi
if [[ -z "${VITE_APP_MODE:-}" || "${VITE_APP_MODE:-}" == "trial" || "${VITE_APP_MODE:-}" == "leadership-demo" ]]; then
  export VITE_APP_MODE="production"
fi
if [[ -z "${AUTO_ACTIVATE_NEW_AGENTS:-}" ]]; then
  export AUTO_ACTIVATE_NEW_AGENTS="true"
fi

for pair in "${legacy_pairs[@]}"; do
  IFS=':' read -r current_name legacy_name <<<"$pair"
  backfill_legacy_var "$current_name" "$legacy_name"
done

if [[ "${ALLOWED_ORIGINS:-}" == "*" ]]; then
  echo "Refusing to start production with wildcard ALLOWED_ORIGINS=*" >&2
  exit 1
fi

ensure_not_placeholders JWT_SECRET "${JWT_SECRET:-}" "change-this-jwt-secret" "change-this-trial-jwt-secret"
ensure_not_placeholders POSTGRES_PASSWORD "${POSTGRES_PASSWORD:-}" "change-this-postgres-password"
ensure_not_placeholders REDIS_PASSWORD "${REDIS_PASSWORD:-}" "change-this-redis-password"
ensure_not_placeholders RABBITMQ_DEFAULT_PASS "${RABBITMQ_DEFAULT_PASS:-}" "change-this-rabbitmq-password"
ensure_not_placeholders MINIO_ROOT_PASSWORD "${MINIO_ROOT_PASSWORD:-}" "change-this-minio-password"

if [[ -z "${SMTP_HOST:-}" || -z "${SMTP_FROM:-}" ]]; then
  echo "Warning: SMTP_HOST / SMTP_FROM is not configured. Email-code registration and login will fail in production." >&2
fi

if [[ "${ENABLE_TLS:-false}" == "true" ]]; then
  case "${PUBLIC_HOSTNAME:-}" in
    ""|localhost|127.0.0.1|::1|_)
      echo "ENABLE_TLS=true requires PUBLIC_HOSTNAME to be a public hostname, not '${PUBLIC_HOSTNAME:-<empty>}'" >&2
      exit 1
      ;;
  esac

  TLS_ORIGIN="https://${PUBLIC_HOSTNAME}"
  if ! csv_contains "${ALLOWED_ORIGINS:-}" "$TLS_ORIGIN"; then
    echo "ENABLE_TLS=true requires ALLOWED_ORIGINS to include ${TLS_ORIGIN}" >&2
    exit 1
  fi

  if csv_contains "${ALLOWED_ORIGINS:-}" "http://localhost" && [[ "${ENABLE_DEBUG_OVERLAY:-false}" != "true" ]]; then
    echo "ENABLE_TLS=true with ALLOWED_ORIGINS including http://localhost is only allowed for local debug sessions." >&2
    echo "Enable ENABLE_DEBUG_OVERLAY=true for local-only debug access, or remove http://localhost from ALLOWED_ORIGINS." >&2
    exit 1
  fi

  CERTS_HOST_DIR="${ROOT}/${TLS_CERTS_DIR#./}"
  if [[ ! -d "$CERTS_HOST_DIR" && ! -d "${TLS_CERTS_DIR}" ]]; then
    echo "ENABLE_TLS=true but certificate directory was not found: ${TLS_CERTS_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/${TLS_CERTS_DIR#./}/tls.crt" && ! -f "${TLS_CERTS_DIR}/tls.crt" ]]; then
    echo "ENABLE_TLS=true but TLS certificate was not found under ${TLS_CERTS_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/${TLS_CERTS_DIR#./}/tls.key" && ! -f "${TLS_CERTS_DIR}/tls.key" ]]; then
    echo "ENABLE_TLS=true but TLS key was not found under ${TLS_CERTS_DIR}" >&2
    exit 1
  fi
fi

if [[ "${ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  echo "Warning: ENABLE_DEBUG_OVERLAY=true exposes debug-only management ports on 127.0.0.1." >&2
  echo "         This mode is for local troubleshooting only and must not be treated as a public release configuration." >&2
fi

OPTIONAL_SERVICES="$(trim "${HEALTH_OPTIONAL_SERVICES:-}")"
if [[ -n "$OPTIONAL_SERVICES" ]]; then
  if csv_contains "$OPTIONAL_SERVICES" "training"; then
    warn_optional_service "training" "${TRAINING_SERVICE_URL:-http://training-service:3005}"
  fi
  if csv_contains "$OPTIONAL_SERVICES" "ranking"; then
    warn_optional_service "ranking" "${RANKING_SERVICE_URL:-http://ranking-service:3006}"
  fi
fi

COMPOSE_ARGS=(--project-directory "$ROOT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
if [[ "${ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  COMPOSE_ARGS+=(-f "$DEBUG_COMPOSE_FILE")
fi

compose "${COMPOSE_ARGS[@]}" up -d --build

PUBLIC_SCHEME="http"
PUBLIC_HOST="${PUBLIC_HOSTNAME:-localhost}"
PUBLIC_PORT="${HTTP_PORT:-80}"
if [[ "${ENABLE_TLS:-false}" == "true" ]]; then
  PUBLIC_SCHEME="https"
  PUBLIC_PORT="${HTTPS_PORT:-443}"
fi

if [[ "$PUBLIC_PORT" == "80" || "$PUBLIC_PORT" == "443" ]]; then
  PUBLIC_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}"
else
  PUBLIC_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}:${PUBLIC_PORT}"
fi

echo "Production environment started."
echo "Public entry:    ${PUBLIC_BASE}/"
echo "API base:        ${PUBLIC_BASE}/api"
echo "Health live:     ${PUBLIC_BASE}/health/live"
echo "Health ready:    ${PUBLIC_BASE}/health/ready"
echo "Internal health: blocked at ingress (/health, /health/deps)"
echo "Metrics:         blocked at ingress (/metrics)"
if [[ "${ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  echo "RabbitMQ admin:  http://127.0.0.1:${RABBITMQ_MANAGEMENT_PORT:-15672}"
  echo "MinIO API:       http://127.0.0.1:${MINIO_API_PORT:-9000}"
  echo "MinIO console:   http://127.0.0.1:${MINIO_CONSOLE_PORT:-9001}"
fi
