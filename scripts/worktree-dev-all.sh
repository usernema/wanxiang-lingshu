#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_BRANCH="${1:-main}"
AGENTS=(forum-agent marketplace-agent frontend-agent)

for agent in "${AGENTS[@]}"; do
  "$REPO_ROOT/scripts/worktree-new.sh" "$agent" "$BASE_BRANCH" >/dev/null
  SESSION_NAME="a2ahub-${agent}"
  WORKTREE_PATH="$REPO_ROOT/.worktrees/$agent"

  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    continue
  fi

  tmux new-session -d -s "$SESSION_NAME" -n dev -c "$WORKTREE_PATH"
  PANE_GIT="$(tmux display-message -p -t "$SESSION_NAME:dev" '#{pane_id}')"
  PANE_CCR="$(tmux split-window -h -P -F '#{pane_id}' -t "$SESSION_NAME:dev" -c "$WORKTREE_PATH")"
  PANE_DOCKER="$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_CCR" -c "$WORKTREE_PATH")"
  tmux send-keys -t "$PANE_GIT" "cd '$WORKTREE_PATH' && git status -sb" C-m
  tmux send-keys -t "$PANE_CCR" "cd '$WORKTREE_PATH' && ccr code --dangerously-skip-permissions" C-m
  tmux send-keys -t "$PANE_DOCKER" "cd '$WORKTREE_PATH' && docker ps" C-m

  tmux new-window -t "$SESSION_NAME:" -n app -c "$WORKTREE_PATH"
  APP_LEFT="$(tmux display-message -p -t "$SESSION_NAME:app" '#{pane_id}')"
  APP_RIGHT="$(tmux split-window -h -P -F '#{pane_id}' -t "$SESSION_NAME:app" -c "$WORKTREE_PATH")"
  tmux send-keys -t "$APP_LEFT" "cd '$WORKTREE_PATH/frontend' 2>/dev/null || cd '$WORKTREE_PATH'" C-m
  tmux send-keys -t "$APP_RIGHT" "cd '$WORKTREE_PATH/services' 2>/dev/null || cd '$WORKTREE_PATH'" C-m

  tmux new-window -t "$SESSION_NAME:" -n agent-2 -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME:agent-2" "cd '$WORKTREE_PATH' && ccr code --dangerously-skip-permissions" C-m

  tmux new-window -t "$SESSION_NAME:" -n git -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME:git" "cd '$WORKTREE_PATH' && git branch --show-current && git worktree list" C-m
done

printf 'Started sessions:\n'
for agent in "${AGENTS[@]}"; do
  printf '  - a2ahub-%s\n' "$agent"
done
printf '\nAttach with:\n'
for agent in "${AGENTS[@]}"; do
  printf '  tmux attach -t a2ahub-%s\n' "$agent"
done
