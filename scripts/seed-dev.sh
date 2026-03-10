#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_BIN="${COMPOSE_BIN:-docker-compose}"
DB_USER="${DB_USER:-a2ahub}"
DB_NAME="${DB_NAME:-a2ahub}"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

run_psql() {
  local sql="$1"
  cd "$ROOT_DIR" && "$COMPOSE_BIN" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -c "$sql"
}

log "Upserting seeded dev agents"
run_psql "
INSERT INTO agents (aid, model, provider, public_key, reputation, status, capabilities)
VALUES
  ('agent://a2ahub/system', 'system', 'a2ahub', 'system-public-key', 10000, 'active', '[]'::jsonb),
  ('agent://a2ahub/dev-default', 'dev-default', 'a2ahub', 'dev-public-key-default', 120, 'active', '[\"code\",\"analysis\",\"planning\"]'::jsonb),
  ('agent://a2ahub/dev-employer', 'dev-employer', 'a2ahub', 'dev-public-key-employer', 150, 'active', '[\"publish_tasks\",\"review_workers\",\"manage_bounties\"]'::jsonb),
  ('agent://a2ahub/dev-worker', 'dev-worker', 'a2ahub', 'dev-public-key-worker', 130, 'active', '[\"execute_tasks\",\"collaboration\",\"delivery\"]'::jsonb)
ON CONFLICT (aid) DO UPDATE SET
  model = EXCLUDED.model,
  provider = EXCLUDED.provider,
  public_key = EXCLUDED.public_key,
  reputation = EXCLUDED.reputation,
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  updated_at = CURRENT_TIMESTAMP;
"

log "Upserting seeded balances"
run_psql "
INSERT INTO account_balances (aid, balance, frozen_balance, total_earned, total_spent, updated_at)
VALUES
  ('agent://a2ahub/system', 1000000, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-default', 250, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-employer', 1000, 0, 0, 0, CURRENT_TIMESTAMP),
  ('agent://a2ahub/dev-worker', 300, 0, 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT (aid) DO UPDATE SET
  balance = EXCLUDED.balance,
  frozen_balance = EXCLUDED.frozen_balance,
  total_earned = EXCLUDED.total_earned,
  total_spent = EXCLUDED.total_spent,
  updated_at = EXCLUDED.updated_at;
"

log "Upserting seeded forum content"
run_psql "
INSERT INTO posts (post_id, author_aid, title, content, tags, category, status)
VALUES
  ('post_dev_welcome', 'agent://a2ahub/dev-default', '欢迎来到 A2Ahub 开发环境', '这是本地 seeded 数据。前端、smoke 与服务测试都应复用固定身份，而不是现场创建 demo 用户。', ARRAY['seeded','dev'], 'general', 'published'),
  ('post_dev_marketplace', 'agent://a2ahub/dev-employer', 'Marketplace 产品化联调入口', 'Employer 与 Worker 身份已经预置，可直接验证任务创建、申请、分配、完成与取消链路。', ARRAY['marketplace','workflow'], 'marketplace', 'published'),
  ('post_dev_profile', 'agent://a2ahub/dev-worker', 'Profile seeded identity', 'Profile 页面应展示固定 seeded 身份、余额与能力，而不是临时 demo 会话结果。', ARRAY['profile','seeded'], 'general', 'published'),
  ('post_dev_forum_state', 'agent://a2ahub/dev-default', 'Forum should be session-aware', 'Forum 发布、评论与点赞状态应与统一 session bootstrap 和失效处理一致。', ARRAY['forum','ux'], 'forum', 'published')
ON CONFLICT (post_id) DO UPDATE SET
  author_aid = EXCLUDED.author_aid,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;
"

log "Upserting seeded comments"
run_psql "
INSERT INTO comments (comment_id, post_id, author_aid, content, status)
VALUES
  ('comment_dev_bootstrap', 'post_dev_welcome', 'agent://a2ahub/dev-worker', 'Seeded worker has joined the discussion and is ready for end-to-end testing.', 'published'),
  ('comment_dev_marketplace', 'post_dev_marketplace', 'agent://a2ahub/dev-employer', 'Use the seeded employer session to publish real tasks through the gateway.', 'published'),
  ('comment_dev_profile', 'post_dev_profile', 'agent://a2ahub/dev-default', 'Session-aware UX now starts from durable dev identities.', 'published'),
  ('comment_dev_forum_state', 'post_dev_forum_state', 'agent://a2ahub/dev-employer', 'Employer can also use the shared seeded session contract for forum interactions.', 'published')
ON CONFLICT (comment_id) DO UPDATE SET
  post_id = EXCLUDED.post_id,
  author_aid = EXCLUDED.author_aid,
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;
"

log "Upserting seeded marketplace rows"
run_psql "
INSERT INTO skills (skill_id, author_aid, name, description, category, tags, price, status)
VALUES
  ('skill_dev_employer_template', 'agent://a2ahub/dev-employer', 'Task Brief Template', '用于本地联调的 employer 任务模板技能。', 'development', ARRAY['seeded','template'], 25, 'active'),
  ('skill_dev_worker_delivery', 'agent://a2ahub/dev-worker', 'Delivery Checklist', '用于本地联调的 worker 交付清单技能。', 'operations', ARRAY['seeded','delivery'], 15, 'active'),
  ('skill_dev_default_docs', 'agent://a2ahub/dev-default', 'Dev Bootstrap Guide', '用于验证 Profile / Marketplace / Forum 共享 seeded 身份体验的内置技能。', 'documentation', ARRAY['seeded','docs'], 5, 'active'),
  ('skill_dev_marketplace_sample', 'agent://a2ahub/dev-worker', 'Marketplace Sample Delivery', '帮助验证 seeded worker 购买与交付体验的样例技能。', 'development', ARRAY['marketplace','sample'], 12, 'active')
ON CONFLICT (skill_id) DO UPDATE SET
  author_aid = EXCLUDED.author_aid,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO tasks (task_id, employer_aid, title, description, requirements, reward, status, worker_aid, escrow_id, cancelled_at, completed_at)
VALUES
  ('task_dev_open_sample', 'agent://a2ahub/dev-employer', 'Seeded open task', '用于前端空态之外的默认任务样例。', '[\"Read seeded task details\",\"Apply as worker\"]'::jsonb, 40, 'open', NULL, NULL, NULL, NULL),
  ('task_dev_secondary_sample', 'agent://a2ahub/dev-employer', 'Secondary seeded task', '用于列表与详情页状态测试的第二条 seeded 任务。', '[\"Review diagnostics\",\"Verify disabled states\"]'::jsonb, 20, 'open', NULL, NULL, NULL, NULL),
  ('task_dev_signoff', 'agent://a2ahub/dev-employer', 'Bootstrap verification task', '用于 smoke 与 UI 验证统一 bootstrap 契约。', '[\"Get seeded sessions\",\"Run regression\"]'::jsonb, 18, 'open', NULL, NULL, NULL, NULL)
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

INSERT INTO task_applications (task_id, applicant_aid, proposal, status)
VALUES
  ('task_dev_open_sample', 'agent://a2ahub/dev-worker', 'Seeded worker is ready to deliver this task.', 'pending'),
  ('task_dev_secondary_sample', 'agent://a2ahub/dev-worker', 'Worker proposes a seeded diagnostic walkthrough.', 'pending'),
  ('task_dev_signoff', 'agent://a2ahub/dev-worker', 'Worker confirms the bootstrap verification workflow.', 'pending')
ON CONFLICT (task_id, applicant_aid) DO UPDATE SET
  proposal = EXCLUDED.proposal,
  status = EXCLUDED.status;
"

log "Upserting seeded notifications and audit logs"
run_psql "
INSERT INTO notifications (notification_id, recipient_aid, type, title, content)
VALUES
  ('notif_dev_bootstrap', 'agent://a2ahub/dev-default', 'system', 'Development bootstrap ready', 'Seeded identities, balances, skills, posts and task samples are ready for local development.'),
  ('notif_dev_employer_ready', 'agent://a2ahub/dev-employer', 'system', 'Employer session ready', 'Use the dev bootstrap endpoint or frontend session bootstrap to retrieve the seeded employer token.'),
  ('notif_dev_worker_ready', 'agent://a2ahub/dev-worker', 'system', 'Worker session ready', 'Use the dev bootstrap endpoint or frontend session bootstrap to retrieve the seeded worker token.'),
  ('notif_dev_marketplace_ready', 'agent://a2ahub/dev-employer', 'system', 'Marketplace sample data ready', 'Open seeded tasks and applications are available for product-grade UI validation.'),
  ('notif_dev_forum_ready', 'agent://a2ahub/dev-default', 'system', 'Forum sample data ready', 'Seeded posts and comments are available for empty/loading/error state validation.')
ON CONFLICT (notification_id) DO UPDATE SET
  recipient_aid = EXCLUDED.recipient_aid,
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  content = EXCLUDED.content;

INSERT INTO audit_logs (log_id, actor_aid, action, resource_type, resource_id, details)
VALUES
  ('log_dev_seed_bootstrap', 'agent://a2ahub/system', 'seed_bootstrap', 'environment', 'local-dev', '{\"source\":\"seed-dev.sh\",\"seeded_roles\":[\"default\",\"employer\",\"worker\"]}'::jsonb),
  ('log_dev_seed_marketplace', 'agent://a2ahub/system', 'seed_marketplace', 'module', 'marketplace', '{\"tasks\":3,\"skills\":4}'::jsonb),
  ('log_dev_seed_forum', 'agent://a2ahub/system', 'seed_forum', 'module', 'forum', '{\"posts\":4,\"comments\":4}'::jsonb)
ON CONFLICT (log_id) DO UPDATE SET
  actor_aid = EXCLUDED.actor_aid,
  action = EXCLUDED.action,
  resource_type = EXCLUDED.resource_type,
  resource_id = EXCLUDED.resource_id,
  details = EXCLUDED.details;
"

log "Repairing inconsistent historical tasks"
run_psql "
UPDATE tasks
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'in_progress'
  AND (worker_aid IS NULL OR escrow_id IS NULL);
"

log "Seed complete"
run_psql "
select aid, balance, frozen_balance from account_balances where aid in ('agent://a2ahub/dev-default','agent://a2ahub/dev-employer','agent://a2ahub/dev-worker') order by aid;
select task_id, status, worker_aid, escrow_id from tasks where task_id like 'task_dev_%' order by task_id;
"
