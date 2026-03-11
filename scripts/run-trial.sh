#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env.trial"
EXAMPLE_FILE="${ROOT}/.env.trial.example"
COMPOSE_FILE="${ROOT}/docker-compose.trial.yml"
DEBUG_COMPOSE_FILE="${ROOT}/docker-compose.trial.debug.yml"

CLI_TRIAL_ENABLE_DEBUG_OVERLAY="${TRIAL_ENABLE_DEBUG_OVERLAY-}"
CLI_TRIAL_RABBITMQ_MANAGEMENT_PORT="${TRIAL_RABBITMQ_MANAGEMENT_PORT-}"
CLI_TRIAL_MINIO_API_PORT="${TRIAL_MINIO_API_PORT-}"
CLI_TRIAL_MINIO_CONSOLE_PORT="${TRIAL_MINIO_CONSOLE_PORT-}"
CLI_TRIAL_ENABLE_TLS="${TRIAL_ENABLE_TLS-}"
CLI_TRIAL_PUBLIC_HOSTNAME="${TRIAL_PUBLIC_HOSTNAME-}"
CLI_TRIAL_PUBLIC_SCHEME="${TRIAL_PUBLIC_SCHEME-}"
CLI_TRIAL_HTTP_PORT="${TRIAL_HTTP_PORT-}"
CLI_TRIAL_HTTPS_PORT="${TRIAL_HTTPS_PORT-}"
CLI_TRIAL_TLS_CERTS_DIR="${TRIAL_TLS_CERTS_DIR-}"
CLI_TRIAL_TLS_CERT_PATH="${TRIAL_TLS_CERT_PATH-}"
CLI_TRIAL_TLS_KEY_PATH="${TRIAL_TLS_KEY_PATH-}"
CLI_ALLOWED_ORIGINS="${ALLOWED_ORIGINS-}"
CLI_JWT_SECRET="${JWT_SECRET-}"
CLI_POSTGRES_PASSWORD="${POSTGRES_PASSWORD-}"
CLI_REDIS_PASSWORD="${REDIS_PASSWORD-}"
CLI_RABBITMQ_DEFAULT_PASS="${RABBITMQ_DEFAULT_PASS-}"
CLI_MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD-}"
CLI_MINIO_ROOT_USER="${MINIO_ROOT_USER-}"
CLI_POSTGRES_DB="${POSTGRES_DB-}"
CLI_POSTGRES_USER="${POSTGRES_USER-}"
CLI_IDENTITY_SERVICE_URL="${IDENTITY_SERVICE_URL-}"
CLI_FORUM_SERVICE_URL="${FORUM_SERVICE_URL-}"
CLI_CREDIT_SERVICE_URL="${CREDIT_SERVICE_URL-}"
CLI_MARKETPLACE_SERVICE_URL="${MARKETPLACE_SERVICE_URL-}"
CLI_TRAINING_SERVICE_URL="${TRAINING_SERVICE_URL-}"
CLI_RANKING_SERVICE_URL="${RANKING_SERVICE_URL-}"
CLI_HEALTH_OPTIONAL_SERVICES="${HEALTH_OPTIONAL_SERVICES-}"
CLI_TRIAL_VITE_APP_MODE="${TRIAL_VITE_APP_MODE-}"
CLI_TRIAL_VITE_BANNER_LABEL="${TRIAL_VITE_BANNER_LABEL-}"
CLI_TRIAL_VITE_GATEWAY_LABEL="${TRIAL_VITE_GATEWAY_LABEL-}"
CLI_TRIAL_VITE_RESET_SESSIONS_ON_LOAD="${TRIAL_VITE_RESET_SESSIONS_ON_LOAD-}"

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

restore_cli_override() {
  local name="$1"
  local value="$2"
  if [[ -n "$value" ]]; then
    export "${name}=${value}"
  fi
}

restore_cli_overrides() {
  restore_cli_override TRIAL_ENABLE_DEBUG_OVERLAY "$CLI_TRIAL_ENABLE_DEBUG_OVERLAY"
  restore_cli_override TRIAL_RABBITMQ_MANAGEMENT_PORT "$CLI_TRIAL_RABBITMQ_MANAGEMENT_PORT"
  restore_cli_override TRIAL_MINIO_API_PORT "$CLI_TRIAL_MINIO_API_PORT"
  restore_cli_override TRIAL_MINIO_CONSOLE_PORT "$CLI_TRIAL_MINIO_CONSOLE_PORT"
  restore_cli_override TRIAL_ENABLE_TLS "$CLI_TRIAL_ENABLE_TLS"
  restore_cli_override TRIAL_PUBLIC_HOSTNAME "$CLI_TRIAL_PUBLIC_HOSTNAME"
  restore_cli_override TRIAL_PUBLIC_SCHEME "$CLI_TRIAL_PUBLIC_SCHEME"
  restore_cli_override TRIAL_HTTP_PORT "$CLI_TRIAL_HTTP_PORT"
  restore_cli_override TRIAL_HTTPS_PORT "$CLI_TRIAL_HTTPS_PORT"
  restore_cli_override TRIAL_TLS_CERTS_DIR "$CLI_TRIAL_TLS_CERTS_DIR"
  restore_cli_override TRIAL_TLS_CERT_PATH "$CLI_TRIAL_TLS_CERT_PATH"
  restore_cli_override TRIAL_TLS_KEY_PATH "$CLI_TRIAL_TLS_KEY_PATH"
  restore_cli_override ALLOWED_ORIGINS "$CLI_ALLOWED_ORIGINS"
  restore_cli_override JWT_SECRET "$CLI_JWT_SECRET"
  restore_cli_override POSTGRES_PASSWORD "$CLI_POSTGRES_PASSWORD"
  restore_cli_override REDIS_PASSWORD "$CLI_REDIS_PASSWORD"
  restore_cli_override RABBITMQ_DEFAULT_PASS "$CLI_RABBITMQ_DEFAULT_PASS"
  restore_cli_override MINIO_ROOT_PASSWORD "$CLI_MINIO_ROOT_PASSWORD"
  restore_cli_override MINIO_ROOT_USER "$CLI_MINIO_ROOT_USER"
  restore_cli_override POSTGRES_DB "$CLI_POSTGRES_DB"
  restore_cli_override POSTGRES_USER "$CLI_POSTGRES_USER"
  restore_cli_override IDENTITY_SERVICE_URL "$CLI_IDENTITY_SERVICE_URL"
  restore_cli_override FORUM_SERVICE_URL "$CLI_FORUM_SERVICE_URL"
  restore_cli_override CREDIT_SERVICE_URL "$CLI_CREDIT_SERVICE_URL"
  restore_cli_override MARKETPLACE_SERVICE_URL "$CLI_MARKETPLACE_SERVICE_URL"
  restore_cli_override TRAINING_SERVICE_URL "$CLI_TRAINING_SERVICE_URL"
  restore_cli_override RANKING_SERVICE_URL "$CLI_RANKING_SERVICE_URL"
  restore_cli_override HEALTH_OPTIONAL_SERVICES "$CLI_HEALTH_OPTIONAL_SERVICES"
  restore_cli_override TRIAL_VITE_APP_MODE "$CLI_TRIAL_VITE_APP_MODE"
  restore_cli_override TRIAL_VITE_BANNER_LABEL "$CLI_TRIAL_VITE_BANNER_LABEL"
  restore_cli_override TRIAL_VITE_GATEWAY_LABEL "$CLI_TRIAL_VITE_GATEWAY_LABEL"
  restore_cli_override TRIAL_VITE_RESET_SESSIONS_ON_LOAD "$CLI_TRIAL_VITE_RESET_SESSIONS_ON_LOAD"
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

ensure_not_placeholder() {
  local name="$1"
  local value="$2"
  local placeholder="$3"

  if [[ -z "$value" ]]; then
    echo "Refusing to start trial with empty ${name}" >&2
    exit 1
  fi

  if [[ "$value" == "$placeholder" ]]; then
    echo "Refusing to start trial with placeholder ${name}. Update ${ENV_FILE} before public use." >&2
    exit 1
  fi
}

warn_optional_service() {
  local service_name="$1"
  local service_url="$2"
  echo "Warning: HEALTH_OPTIONAL_SERVICES includes '${service_name}' but docker-compose.trial.yml does not start that service." >&2
  echo "         ${service_name} URL: ${service_url}" >&2
  echo "         Keep HEALTH_OPTIONAL_SERVICES empty unless you intentionally publish and verify that dependency." >&2
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env.trial. Copying from .env.trial.example ..."
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE. Replace all placeholder secrets before exposing this environment publicly."
fi

set -a
source "$ENV_FILE"
set +a
restore_cli_overrides

if [[ "${ALLOWED_ORIGINS:-}" == "*" ]]; then
  echo "Refusing to start trial with wildcard ALLOWED_ORIGINS=*" >&2
  exit 1
fi

ensure_not_placeholder JWT_SECRET "${JWT_SECRET:-}" "change-this-trial-jwt-secret"
ensure_not_placeholder POSTGRES_PASSWORD "${POSTGRES_PASSWORD:-}" "change-this-postgres-password"
ensure_not_placeholder REDIS_PASSWORD "${REDIS_PASSWORD:-}" "change-this-redis-password"
ensure_not_placeholder RABBITMQ_DEFAULT_PASS "${RABBITMQ_DEFAULT_PASS:-}" "change-this-rabbitmq-password"
ensure_not_placeholder MINIO_ROOT_PASSWORD "${MINIO_ROOT_PASSWORD:-}" "change-this-minio-password"

if [[ "${TRIAL_ENABLE_TLS:-false}" == "true" ]]; then
  case "${TRIAL_PUBLIC_HOSTNAME:-}" in
    ""|localhost|127.0.0.1|::1|_)
      echo "TRIAL_ENABLE_TLS=true requires TRIAL_PUBLIC_HOSTNAME to be a public hostname, not '${TRIAL_PUBLIC_HOSTNAME:-<empty>}'" >&2
      exit 1
      ;;
  esac

  TLS_ORIGIN="https://${TRIAL_PUBLIC_HOSTNAME}"
  if ! csv_contains "${ALLOWED_ORIGINS:-}" "$TLS_ORIGIN"; then
    echo "TRIAL_ENABLE_TLS=true requires ALLOWED_ORIGINS to include ${TLS_ORIGIN}" >&2
    exit 1
  fi

  if csv_contains "${ALLOWED_ORIGINS:-}" "http://localhost" && [[ "${TRIAL_ENABLE_DEBUG_OVERLAY:-false}" != "true" ]]; then
    echo "TRIAL_ENABLE_TLS=true with ALLOWED_ORIGINS including http://localhost is only allowed for local debug sessions." >&2
    echo "Enable TRIAL_ENABLE_DEBUG_OVERLAY=true for local-only debug access, or remove http://localhost from ALLOWED_ORIGINS." >&2
    exit 1
  fi

  CERTS_HOST_DIR="${ROOT}/${TRIAL_TLS_CERTS_DIR#./}"
  if [[ ! -d "$CERTS_HOST_DIR" && ! -d "${TRIAL_TLS_CERTS_DIR}" ]]; then
    echo "TRIAL_ENABLE_TLS=true but certificate directory was not found: ${TRIAL_TLS_CERTS_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/${TRIAL_TLS_CERTS_DIR#./}/tls.crt" && ! -f "${TRIAL_TLS_CERTS_DIR}/tls.crt" ]]; then
    echo "TRIAL_ENABLE_TLS=true but TLS certificate was not found under ${TRIAL_TLS_CERTS_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/${TRIAL_TLS_CERTS_DIR#./}/tls.key" && ! -f "${TRIAL_TLS_CERTS_DIR}/tls.key" ]]; then
    echo "TRIAL_ENABLE_TLS=true but TLS key was not found under ${TRIAL_TLS_CERTS_DIR}" >&2
    exit 1
  fi
fi

if [[ "${TRIAL_ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  echo "Warning: TRIAL_ENABLE_DEBUG_OVERLAY=true exposes debug-only management ports on 127.0.0.1." >&2
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
if [[ "${TRIAL_ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  COMPOSE_ARGS+=(-f "$DEBUG_COMPOSE_FILE")
fi

compose "${COMPOSE_ARGS[@]}" up -d --build

PUBLIC_SCHEME="http"
PUBLIC_HOST="${TRIAL_PUBLIC_HOSTNAME:-localhost}"
PUBLIC_PORT="${TRIAL_HTTP_PORT:-80}"
if [[ "${TRIAL_ENABLE_TLS:-false}" == "true" ]]; then
  PUBLIC_SCHEME="https"
  PUBLIC_PORT="${TRIAL_HTTPS_PORT:-443}"
fi

if [[ "$PUBLIC_PORT" == "80" || "$PUBLIC_PORT" == "443" ]]; then
  PUBLIC_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}"
else
  PUBLIC_BASE="${PUBLIC_SCHEME}://${PUBLIC_HOST}:${PUBLIC_PORT}"
fi

echo "Trial environment started."
echo "Public entry:    ${PUBLIC_BASE}/"
echo "API base:        ${PUBLIC_BASE}/api"
echo "Health live:     ${PUBLIC_BASE}/health/live"
echo "Health ready:    ${PUBLIC_BASE}/health/ready"
echo "Internal health: blocked at ingress (/health, /health/deps)"
echo "Metrics:         blocked at ingress (/metrics)"
if [[ "${TRIAL_ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  echo "RabbitMQ admin:  http://127.0.0.1:${TRIAL_RABBITMQ_MANAGEMENT_PORT:-15672}"
  echo "MinIO API:       http://127.0.0.1:${TRIAL_MINIO_API_PORT:-9000}"
  echo "MinIO console:   http://127.0.0.1:${TRIAL_MINIO_CONSOLE_PORT:-9001}"
fi
