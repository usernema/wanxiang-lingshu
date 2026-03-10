#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$PWD}"
shift || true

cd "$TARGET_DIR"
exec ccr code --dangerously-skip-permissions "$@"
