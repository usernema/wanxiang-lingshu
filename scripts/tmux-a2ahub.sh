#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
SESSION_NAME="${2:-a2ahub-$(basename "$TARGET_DIR" | tr '.' '_' | tr '/' '_')}"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  exec tmux attach -t "$SESSION_NAME"
fi

tmux new-session -d -s "$SESSION_NAME" -n editor -c "$TARGET_DIR"
EDITOR_LEFT="$(tmux display-message -p -t "$SESSION_NAME:editor" '#{pane_id}')"
EDITOR_RIGHT="$(tmux split-window -h -P -F '#{pane_id}' -t "$SESSION_NAME:editor" -c "$TARGET_DIR")"
EDITOR_BOTTOM="$(tmux split-window -v -P -F '#{pane_id}' -t "$EDITOR_RIGHT" -c "$TARGET_DIR")"
tmux select-pane -t "$EDITOR_LEFT"
tmux send-keys -t "$EDITOR_LEFT" "cd '$TARGET_DIR'" C-m
tmux send-keys -t "$EDITOR_RIGHT" "cd '$TARGET_DIR/services/api-gateway' 2>/dev/null || cd '$TARGET_DIR'" C-m
tmux send-keys -t "$EDITOR_BOTTOM" "cd '$TARGET_DIR/frontend' 2>/dev/null || cd '$TARGET_DIR'" C-m

tmux new-window -t "$SESSION_NAME:" -n services -c "$TARGET_DIR/services"
tmux send-keys -t "$SESSION_NAME:services" "cd '$TARGET_DIR/services' 2>/dev/null || cd '$TARGET_DIR'" C-m

tmux new-window -t "$SESSION_NAME:" -n infra -c "$TARGET_DIR"
tmux send-keys -t "$SESSION_NAME:infra" "cd '$TARGET_DIR' && docker ps" C-m

tmux new-window -t "$SESSION_NAME:" -n git -c "$TARGET_DIR"
tmux send-keys -t "$SESSION_NAME:git" "cd '$TARGET_DIR' && git status -sb" C-m

tmux new-window -t "$SESSION_NAME:" -n ccr -c "$TARGET_DIR"
tmux send-keys -t "$SESSION_NAME:ccr" "cd '$TARGET_DIR' && printf 'Use this to start a high-permission CCR session:\nccr code --dangerously-skip-permissions\n'" C-m

tmux select-window -t "$SESSION_NAME:editor"
exec tmux attach -t "$SESSION_NAME"
