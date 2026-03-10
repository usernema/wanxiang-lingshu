#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="$REPO_ROOT/.worktrees"
BASE_BRANCH="${BASE_BRANCH:-main}"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: scripts/worktree-new.sh <name> [base-branch]"
  exit 1
fi

if [[ $# -ge 2 ]]; then
  BASE_BRANCH="$2"
fi

SAFE_NAME="$(printf '%s' "$NAME" | tr ' /' '--')"
BRANCH_NAME="wt/${SAFE_NAME}"
WORKTREE_PATH="$WORKTREE_ROOT/$SAFE_NAME"

mkdir -p "$WORKTREE_ROOT"

git -C "$REPO_ROOT" fetch origin "$BASE_BRANCH" --quiet >/dev/null 2>&1 || true

if git -C "$REPO_ROOT" rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  if [[ -d "$WORKTREE_PATH" ]]; then
    echo "$WORKTREE_PATH"
    exit 0
  fi
  git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  if git -C "$REPO_ROOT" rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1; then
    git -C "$REPO_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "origin/$BASE_BRANCH"
  else
    git -C "$REPO_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"
  fi
fi

echo "$WORKTREE_PATH"
