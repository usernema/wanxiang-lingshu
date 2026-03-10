#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${1:-a2ahub-dashboard}"
MAIN_TARGET="${MAIN_TARGET:-8:0.0}"
FRONTEND_TARGET="${FRONTEND_TARGET:-a2ahub-frontend-agent:0.1}"
FORUM_TARGET="${FORUM_TARGET:-a2ahub-forum-agent:0.1}"
MARKETPLACE_TARGET="${MARKETPLACE_TARGET:-a2ahub-marketplace-agent:0.1}"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  exec tmux attach -t "$SESSION_NAME"
fi

run_monitor() {
  local label="$1"
  local target="$2"
  while true; do
    clear
    printf '=== %s ===\n' "$label"
    printf 'target: %s\n\n' "$target"
    if tmux has-session -t "${target%%:*}" 2>/dev/null; then
      tmux capture-pane -pt "$target" -S -30 2>/dev/null || printf '[unavailable pane]\n'
    else
      printf '[session not found]\n'
    fi
    sleep 1
  done
}

TMUX_MONITOR_MAIN="$(printf '%q ' bash -lc "$(declare -f run_monitor); run_monitor 'MAIN' '$MAIN_TARGET'")"
TMUX_MONITOR_FRONTEND="$(printf '%q ' bash -lc "$(declare -f run_monitor); run_monitor 'FRONTEND' '$FRONTEND_TARGET'")"
TMUX_MONITOR_FORUM="$(printf '%q ' bash -lc "$(declare -f run_monitor); run_monitor 'FORUM' '$FORUM_TARGET'")"
TMUX_MONITOR_MARKETPLACE="$(printf '%q ' bash -lc "$(declare -f run_monitor); run_monitor 'MARKETPLACE' '$MARKETPLACE_TARGET'")"

tmux new-session -d -s "$SESSION_NAME" -n dashboard
tmux send-keys -t "$SESSION_NAME:dashboard" "$TMUX_MONITOR_MAIN" C-m
TOP_RIGHT="$(tmux split-window -h -P -F '#{pane_id}' -t "$SESSION_NAME:dashboard")"
BOTTOM_LEFT="$(tmux split-window -v -P -F '#{pane_id}' -t "$SESSION_NAME:dashboard.0")"
BOTTOM_RIGHT="$(tmux split-window -v -P -F '#{pane_id}' -t "$TOP_RIGHT")"

tmux send-keys -t "$TOP_RIGHT" "$TMUX_MONITOR_FRONTEND" C-m
tmux send-keys -t "$BOTTOM_LEFT" "$TMUX_MONITOR_FORUM" C-m
tmux send-keys -t "$BOTTOM_RIGHT" "$TMUX_MONITOR_MARKETPLACE" C-m

tmux select-layout -t "$SESSION_NAME:dashboard" tiled
exec tmux attach -t "$SESSION_NAME"
