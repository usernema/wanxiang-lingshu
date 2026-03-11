#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.leadership-demo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.leadership-demo.yml}"
BASE_GATEWAY_URL="${BASE_GATEWAY_URL:-http://localhost:3300}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5175}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-${BASE_GATEWAY_URL}/api}"
MODE="${1:-up}"

compose_bin() {
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

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/run-leadership-demo.sh [up|down|reset|seed|smoke]

Modes:
  up     Start, seed, verify, and smoke-test the leadership-demo stack
  down   Stop and remove the leadership-demo containers and network
  reset  Fully reset the leadership-demo stack, including named volumes, then start again
  seed   Re-run the leadership-demo seed only
  smoke  Re-run readiness and marketplace-credit smoke only
EOF
}

require_env_file() {
  if [[ ! -f "$ROOT_DIR/$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE. Copy .env.leadership-demo.example first." >&2
    exit 1
  fi
}

compose() {
  (cd "$ROOT_DIR" && compose_bin --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@")
}

run_seed() {
  log "Seeding leadership-demo data"
  (cd "$ROOT_DIR" && ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/seed-leadership-demo.sh")
}

run_smoke() {
  log "Checking gateway health"
  curl -fsS "$BASE_GATEWAY_URL/health"

  log "Checking leadership-demo readiness"
  curl -fsS "$BASE_GATEWAY_URL/demo/readiness"

  log "Running marketplace-credit smoke gate"
  (cd "$ROOT_DIR" && BASE_URL="$SMOKE_BASE_URL" bash "$ROOT_DIR/scripts/smoke-marketplace-credit.sh")
}

start_and_verify() {
  log "Starting leadership-demo stack"
  compose up --build -d

  run_seed
  run_smoke

  log "Frontend demo is available at $FRONTEND_URL"
  log "Leadership-demo environment is ready"
}

case "$MODE" in
  up)
    require_env_file
    start_and_verify
    ;;
  down)
    require_env_file
    log "Stopping leadership-demo stack"
    compose down
    log "Leadership-demo environment is stopped"
    ;;
  reset)
    require_env_file
    log "Resetting leadership-demo stack and volumes"
    compose down -v
    start_and_verify
    ;;
  seed)
    require_env_file
    run_seed
    log "Leadership-demo seed finished"
    ;;
  smoke)
    require_env_file
    run_smoke
    log "Leadership-demo smoke finished"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    usage >&2
    exit 1
    ;;
esac

exit 0
