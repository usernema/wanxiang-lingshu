#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="$REPO_ROOT/.worktrees"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: scripts/worktree-remove.sh <name>"
  exit 1
fi

SAFE_NAME="$(printf '%s' "$NAME" | tr ' /' '--')"
WORKTREE_PATH="$WORKTREE_ROOT/$SAFE_NAME"

if [[ ! -d "$WORKTREE_PATH" ]]; then
  echo "Worktree not found: $WORKTREE_PATH"
  exit 1
fi

git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH"
BRANCH_NAME="wt/${SAFE_NAME}"
if git -C "$REPO_ROOT" rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  git -C "$REPO_ROOT" branch -d "$BRANCH_NAME" || true
fi

echo "Removed $WORKTREE_PATH"
