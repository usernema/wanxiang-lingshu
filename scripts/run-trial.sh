#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.trial}"
EXAMPLE_FILE="${EXAMPLE_FILE:-${ROOT}/.env.trial.example}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.trial.yml}"
DEBUG_COMPOSE_FILE="${DEBUG_COMPOSE_FILE:-${ROOT}/docker-compose.trial.debug.yml}"

exec "${ROOT}/scripts/run-production.sh"
