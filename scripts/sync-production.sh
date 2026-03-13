#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/A2Ahub}"
REMOTE_PASSWORD="${REMOTE_PASSWORD:-}"
BUILD_SERVICES="${BUILD_SERVICES:-frontend identity-service marketplace-service api-gateway ingress}"
DRY_RUN="${DRY_RUN:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command rsync
require_command ssh

SSH_OPTS=(-o StrictHostKeyChecking=no -p "$REMOTE_PORT")
if [[ -n "$REMOTE_PASSWORD" ]]; then
  require_command sshpass
  SSH_PREFIX=(sshpass -p "$REMOTE_PASSWORD")
  RSYNC_RSH="sshpass -p '$REMOTE_PASSWORD' ssh -o StrictHostKeyChecking=no -p $REMOTE_PORT"
else
  SSH_PREFIX=()
  RSYNC_RSH="ssh -o StrictHostKeyChecking=no -p $REMOTE_PORT"
fi

RSYNC_ARGS=(
  -az
  --progress
  --exclude=.git/
  --exclude=.github/
  --exclude=.worktrees/
  --exclude=node_modules/
  --exclude=dist/
  --exclude=build/
  --exclude=.venv/
  --exclude=__pycache__/
  --exclude=.pytest_cache/
  --exclude=.mypy_cache/
  --exclude=logs/
  --exclude=*.log
  --exclude=.DS_Store
  --exclude=.env.production
  --exclude=frontend/certs/
)

if [[ "$DRY_RUN" == "true" ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
fi

echo "Syncing repository to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_RSH" "${ROOT}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run complete."
  exit 0
fi

REMOTE_COMMAND="cd '${REMOTE_DIR}' && docker compose --env-file .env.production -f docker-compose.production.yml up -d --build ${BUILD_SERVICES}"
echo "Rebuilding services: ${BUILD_SERVICES}"
"${SSH_PREFIX[@]}" ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_COMMAND"

echo "Done. Remote code synced without touching .env.production or TLS certs."
