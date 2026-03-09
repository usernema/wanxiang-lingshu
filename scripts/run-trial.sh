#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/mac/A2Ahub"
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
CLI_TRIAL_VITE_APP_MODE="${TRIAL_VITE_APP_MODE-}"
CLI_TRIAL_VITE_BANNER_LABEL="${TRIAL_VITE_BANNER_LABEL-}"
CLI_TRIAL_VITE_GATEWAY_LABEL="${TRIAL_VITE_GATEWAY_LABEL-}"
CLI_TRIAL_VITE_RESET_SESSIONS_ON_LOAD="${TRIAL_VITE_RESET_SESSIONS_ON_LOAD-}"

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
  restore_cli_override TRIAL_VITE_APP_MODE "$CLI_TRIAL_VITE_APP_MODE"
  restore_cli_override TRIAL_VITE_BANNER_LABEL "$CLI_TRIAL_VITE_BANNER_LABEL"
  restore_cli_override TRIAL_VITE_GATEWAY_LABEL "$CLI_TRIAL_VITE_GATEWAY_LABEL"
  restore_cli_override TRIAL_VITE_RESET_SESSIONS_ON_LOAD "$CLI_TRIAL_VITE_RESET_SESSIONS_ON_LOAD"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env.trial. Copying from .env.trial.example ..."
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE. Please edit secrets before exposing this environment publicly."
fi

set -a
source "$ENV_FILE"
set +a
restore_cli_overrides

if [[ "${ALLOWED_ORIGINS:-}" == "*" ]]; then
  echo "Refusing to start trial with wildcard ALLOWED_ORIGINS=*" >&2
  exit 1
fi

if [[ "${TRIAL_ENABLE_TLS:-false}" == "true" ]]; then
  if [[ ! -f "${ROOT}/${TRIAL_TLS_CERTS_DIR#./}/tls.crt" && ! -f "${TRIAL_TLS_CERTS_DIR}/tls.crt" ]]; then
    echo "TRIAL_ENABLE_TLS=true but TLS certificate was not found under ${TRIAL_TLS_CERTS_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/${TRIAL_TLS_CERTS_DIR#./}/tls.key" && ! -f "${TRIAL_TLS_CERTS_DIR}/tls.key" ]]; then
    echo "TRIAL_ENABLE_TLS=true but TLS key was not found under ${TRIAL_TLS_CERTS_DIR}" >&2
    exit 1
  fi
fi

COMPOSE_ARGS=(--project-directory "$ROOT" -f "$COMPOSE_FILE")
if [[ "${TRIAL_ENABLE_DEBUG_OVERLAY:-false}" == "true" ]]; then
  COMPOSE_ARGS+=(-f "$DEBUG_COMPOSE_FILE")
fi

docker-compose "${COMPOSE_ARGS[@]}" up -d --build

PUBLIC_SCHEME="${TRIAL_PUBLIC_SCHEME:-http}"
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
  echo "RabbitMQ admin:  http://localhost:${TRIAL_RABBITMQ_MANAGEMENT_PORT:-15672}"
  echo "MinIO API:       http://localhost:${TRIAL_MINIO_API_PORT:-9000}"
  echo "MinIO console:   http://localhost:${TRIAL_MINIO_CONSOLE_PORT:-9001}"
fi
