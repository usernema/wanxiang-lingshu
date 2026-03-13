#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/A2Ahub}"
REMOTE_RUNTIME_DIR="${REMOTE_RUNTIME_DIR:-/opt/a2ahub-runtime}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/opt/a2ahub-backups}"
REMOTE_PASSWORD="${REMOTE_PASSWORD:-}"
TARGET_REF="${TARGET_REF:-main}"
SKIP_REMOTE_BUILD="${SKIP_REMOTE_BUILD:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command git
require_command ssh
require_command scp

SSH_OPTS=(-o StrictHostKeyChecking=no -p "$REMOTE_PORT")
SCP_OPTS=(-O -P "$REMOTE_PORT" -o StrictHostKeyChecking=no)
if [[ -n "$REMOTE_PASSWORD" ]]; then
  require_command sshpass
  SSH_PREFIX=(sshpass -p "$REMOTE_PASSWORD")
else
  SSH_PREFIX=()
fi

SHORT_SHA="$(git -C "$ROOT" rev-parse --short "$TARGET_REF")"
BUNDLE_FILE="$(mktemp "/tmp/a2ahub-${SHORT_SHA}-XXXXXX.bundle")"
trap 'rm -f "$BUNDLE_FILE"' EXIT

echo "Creating git bundle for ${TARGET_REF} (${SHORT_SHA})"
git -C "$ROOT" bundle create "$BUNDLE_FILE" "$TARGET_REF"

REMOTE_BUNDLE="/tmp/a2ahub-${SHORT_SHA}.bundle"
echo "Uploading bundle to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_BUNDLE}"
"${SSH_PREFIX[@]}" scp "${SCP_OPTS[@]}" "$BUNDLE_FILE" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_BUNDLE}"

echo "Deploying bundle on remote server"
"${SSH_PREFIX[@]}" ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
  "REMOTE_DIR='${REMOTE_DIR}' REMOTE_RUNTIME_DIR='${REMOTE_RUNTIME_DIR}' REMOTE_BACKUP_DIR='${REMOTE_BACKUP_DIR}' REMOTE_BUNDLE='${REMOTE_BUNDLE}' SHORT_SHA='${SHORT_SHA}' SKIP_REMOTE_BUILD='${SKIP_REMOTE_BUILD}' bash -s" <<'REMOTE'
set -euo pipefail

REPO="${REMOTE_DIR}"
RUNTIME_DIR="${REMOTE_RUNTIME_DIR}"
BACKUP_ROOT="${REMOTE_BACKUP_DIR}"
BUNDLE_FILE="${REMOTE_BUNDLE}"
SHORT_SHA="${SHORT_SHA}"
SKIP_REMOTE_BUILD="${SKIP_REMOTE_BUILD}"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TS}-${SHORT_SHA}"

mkdir -p "$BACKUP_DIR" "$RUNTIME_DIR/certs"
cd "$REPO"

git status --short --branch > "$BACKUP_DIR/git-status.before.txt" || true
git diff > "$BACKUP_DIR/git-working.before.diff" || true
git ls-files --others --exclude-standard > "$BACKUP_DIR/git-untracked.before.txt" || true
git rev-parse HEAD > "$BACKUP_DIR/git-head.before.txt" || true

if [[ -f .env.production ]]; then
  cp .env.production "$BACKUP_DIR/.env.production.backup"
fi

if [[ -d frontend/certs ]]; then
  mkdir -p "$BACKUP_DIR/frontend-certs"
  cp -a frontend/certs/. "$BACKUP_DIR/frontend-certs/" || true
fi

if [[ -f frontend/certs/tls.crt ]]; then
  cp -f frontend/certs/tls.crt "$RUNTIME_DIR/certs/tls.crt"
fi
if [[ -f frontend/certs/tls.key ]]; then
  cp -f frontend/certs/tls.key "$RUNTIME_DIR/certs/tls.key"
fi

chmod 644 "$RUNTIME_DIR/certs/tls.crt" 2>/dev/null || true
chmod 600 "$RUNTIME_DIR/certs/tls.key" 2>/dev/null || true

if [[ -f .env.production ]]; then
  if grep -q '^TLS_CERTS_DIR=' .env.production; then
    sed -i 's#^TLS_CERTS_DIR=.*#TLS_CERTS_DIR='"${RUNTIME_DIR}"'/certs#' .env.production
  else
    printf '\nTLS_CERTS_DIR=%s/certs\n' "$RUNTIME_DIR" >> .env.production
  fi
fi

git fetch "$BUNDLE_FILE" main:refs/remotes/bundle/main
git reset --hard refs/remotes/bundle/main
git clean -fd

rm -rf .worktrees services/marketplace-service/.venv
rm -f frontend/certs/tls.crt frontend/certs/tls.key
mkdir -p frontend/certs
[[ -f frontend/certs/.gitkeep ]] || touch frontend/certs/.gitkeep

git update-ref refs/remotes/origin/main "$(git rev-parse HEAD)"
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main

if [[ "$SKIP_REMOTE_BUILD" != "true" ]]; then
  bash scripts/run-production.sh
fi

git status --short --branch > "$BACKUP_DIR/git-status.after.txt" || true
git rev-parse HEAD > "$BACKUP_DIR/git-head.after.txt" || true

rm -f "$BUNDLE_FILE"

echo "backup_dir=$BACKUP_DIR"
echo "repo_head=$(git rev-parse --short HEAD)"
echo "runtime_certs=${RUNTIME_DIR}/certs"
REMOTE

echo "Remote deploy finished."
