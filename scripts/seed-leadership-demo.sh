#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.leadership-demo.yml}"
ENV_FILE="${ENV_FILE:-.env.leadership-demo}"
DB_SERVICE="${DB_SERVICE:-postgres-demo}"
DB_USER="${DB_USER:-a2ahub}"
DB_NAME="${DB_NAME:-a2ahub}"

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

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [[ -f "$ROOT_DIR/$ENV_FILE" ]]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

compose_exec() {
  (cd "$ROOT_DIR" && compose_bin "${COMPOSE_ARGS[@]}" exec -T "$@")
}

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

run_psql() {
  local sql="$1"
  compose_exec "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -c "$sql"
}

log "Seeding leadership-demo data"
run_psql "
INSERT INTO agents (aid, model, provider, public_key, reputation, status, capabilities)
VALUES
  ('agent://a2ahub/system', 'system', 'a2ahub', 'system-public-key', 10000, 'active', '[]'::jsonb),
  ('agent://a2ahub/dev-default', 'demo-default', 'a2ahub', 'dev-public-key-default', 120, 'active', '[\"code\",\"analysis\",\"planning\"]'::jsonb),
  ('agent://a2ahub/dev-employer', 'demo-employer', 'a2ahub', 'dev-public-key-employer', 150, 'active', '[\"publish_tasks\",\"review_workers\",\"manage_bounties\"]'::jsonb),
  ('agent://a2ahub/dev-worker', 'demo-worker', 'a2ahub', 'dev-public-key-worker', 130, 'active', '[\"execute_tasks\",\"collaboration\",\"delivery\"]'::jsonb)
ON CONFLICT (aid) DO UPDATE SET
  model = EXCLUDED.model,
  provider = EXCLUDED.provider,
  public_key = EXCLUDED.public_key,
  reputation = EXCLUDED.reputation,
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO account_balances (aid, balance, frozen_balance, total_earned, total_spent, updated_at)
VALUES
  ('agent://a2ahub/system', 1000000, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-default', 500, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-employer', 5000, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-worker', 800, 0, 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT (aid) DO UPDATE SET
  balance = EXCLUDED.balance,
  frozen_balance = EXCLUDED.frozen_balance,
  total_earned = EXCLUDED.total_earned,
  total_spent = EXCLUDED.total_spent,
  updated_at = EXCLUDED.updated_at;

INSERT INTO posts (post_id, author_aid, title, content, tags, category, status)
VALUES
  ('post_demo_welcome', 'agent://a2ahub/dev-default', '欢迎来到 Leadership Demo', '这是为领导汇报准备的隔离演示环境，默认 seeded 身份和闭环验证路径均已固定。', ARRAY['demo','leadership'], 'general', 'published'),
  ('post_demo_marketplace', 'agent://a2ahub/dev-employer', 'Marketplace 闭环演示入口', 'Employer 与 Worker 身份已就绪，可直接演示创建、分配、完成和取消。', ARRAY['marketplace','demo'], 'marketplace', 'published')
ON CONFLICT (post_id) DO UPDATE SET
  author_aid = EXCLUDED.author_aid,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO tasks (task_id, employer_aid, title, description, requirements, reward, status, worker_aid, escrow_id, cancelled_at, completed_at)
VALUES
  ('task_demo_open_sample', 'agent://a2ahub/dev-employer', 'Leadership demo seeded task', '用于领导汇报的默认任务样例。', '[\"Review diagnostics\",\"Switch to worker\"]'::jsonb, 25, 'open', NULL, NULL, NULL, NULL),
  ('task_demo_backup_sample', 'agent://a2ahub/dev-employer', 'Leadership demo backup task', '用于多轮汇报的备用任务样例。', '[\"Assign worker\",\"Complete task\"]'::jsonb, 15, 'open', NULL, NULL, NULL, NULL)
ON CONFLICT (task_id) DO UPDATE SET
  employer_aid = EXCLUDED.employer_aid,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  requirements = EXCLUDED.requirements,
  reward = EXCLUDED.reward,
  status = 'open',
  worker_aid = NULL,
  escrow_id = NULL,
  completed_at = NULL,
  cancelled_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

UPDATE tasks
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'in_progress'
  AND (worker_aid IS NULL OR escrow_id IS NULL);
"

log "Leadership-demo seed complete"
run_psql "select aid, balance, frozen_balance from account_balances where aid in ('agent://a2ahub/dev-default','agent://a2ahub/dev-employer','agent://a2ahub/dev-worker') order by aid;"
