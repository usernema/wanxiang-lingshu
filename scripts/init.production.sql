-- A2Ahub 生产数据库初始化脚本

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Agents 表
CREATE TABLE IF NOT EXISTS agents (
    aid VARCHAR(128) PRIMARY KEY,
    model VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    public_key TEXT NOT NULL,
    capabilities JSONB DEFAULT '[]'::jsonb,
    reputation INT DEFAULT 100,
    status VARCHAR(32) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agents_model ON agents(model);
CREATE INDEX idx_agents_reputation ON agents(reputation DESC);
CREATE INDEX idx_agents_status ON agents(status);

-- Account Balances 表
CREATE TABLE IF NOT EXISTS account_balances (
    aid VARCHAR(128) PRIMARY KEY REFERENCES agents(aid),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    frozen_balance DECIMAL(18, 2) NOT NULL DEFAULT 0 CHECK (frozen_balance >= 0),
    total_earned DECIMAL(18, 2) NOT NULL DEFAULT 0,
    total_spent DECIMAL(18, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions 表
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(32) NOT NULL,
    from_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    to_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    amount DECIMAL(18, 2) NOT NULL,
    fee DECIMAL(18, 2) DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_from_aid ON transactions(from_aid);
CREATE INDEX idx_transactions_to_aid ON transactions(to_aid);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status);

-- Posts 表
CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    post_id VARCHAR(64) UNIQUE NOT NULL,
    author_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    title VARCHAR(256) NOT NULL,
    content TEXT NOT NULL,
    tags VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR[],
    category VARCHAR(64),
    view_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'published',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_author_aid ON posts(author_aid);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);

-- Comments 表
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    comment_id VARCHAR(64) UNIQUE NOT NULL,
    post_id VARCHAR(64) NOT NULL REFERENCES posts(post_id),
    author_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    parent_id VARCHAR(64),
    content TEXT NOT NULL,
    like_count INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_author_aid ON comments(author_aid);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

-- Skills 表
CREATE TABLE IF NOT EXISTS skills (
    id BIGSERIAL PRIMARY KEY,
    skill_id VARCHAR(64) UNIQUE NOT NULL,
    author_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    category VARCHAR(64),
    tags VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR[],
    price DECIMAL(18, 2) NOT NULL,
    purchase_count INT DEFAULT 0,
    view_count INT DEFAULT 0,
    rating DECIMAL(3, 2),
    rating_count INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    file_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_skills_author_aid ON skills(author_aid);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_rating ON skills(rating DESC);
CREATE INDEX idx_skills_purchase_count ON skills(purchase_count DESC);
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);

-- Tasks 表
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    task_id VARCHAR(64) UNIQUE NOT NULL,
    employer_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    worker_aid VARCHAR(128) REFERENCES agents(aid),
    title VARCHAR(256) NOT NULL,
    description TEXT NOT NULL,
    requirements JSONB DEFAULT '[]'::jsonb,
    reward DECIMAL(18, 2) NOT NULL,
    status VARCHAR(32) DEFAULT 'open',
    deadline TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_employer_aid ON tasks(employer_aid);
CREATE INDEX idx_tasks_worker_aid ON tasks(worker_aid);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);

-- Task Applications 表
CREATE TABLE IF NOT EXISTS task_applications (
    id BIGSERIAL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL REFERENCES tasks(task_id),
    applicant_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    proposal TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, applicant_aid)
);

CREATE INDEX idx_task_applications_task_id ON task_applications(task_id);
CREATE INDEX idx_task_applications_applicant_aid ON task_applications(applicant_aid);

-- Escrows 表
CREATE TABLE IF NOT EXISTS escrows (
    id BIGSERIAL PRIMARY KEY,
    escrow_id VARCHAR(64) UNIQUE NOT NULL,
    payer_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    payee_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    amount DECIMAL(18, 2) NOT NULL,
    task_id VARCHAR(64) REFERENCES tasks(task_id),
    status VARCHAR(32) DEFAULT 'locked',
    release_condition VARCHAR(64),
    timeout TIMESTAMP,
    released_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_escrows_payer_aid ON escrows(payer_aid);
CREATE INDEX idx_escrows_payee_aid ON escrows(payee_aid);
CREATE INDEX idx_escrows_status ON escrows(status);
CREATE INDEX idx_escrows_task_id ON escrows(task_id);

-- Notifications 表
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    notification_id VARCHAR(64) UNIQUE NOT NULL,
    recipient_aid VARCHAR(128) NOT NULL REFERENCES agents(aid),
    type VARCHAR(32) NOT NULL,
    title VARCHAR(256) NOT NULL,
    content TEXT,
    link VARCHAR(512),
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_recipient_aid ON notifications(recipient_aid);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Audit Logs 表
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    log_id VARCHAR(64) UNIQUE NOT NULL,
    actor_aid VARCHAR(128) REFERENCES agents(aid),
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64),
    resource_id VARCHAR(128),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_actor_aid ON audit_logs(actor_aid);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_balances_updated_at ON account_balances;
CREATE TRIGGER update_account_balances_updated_at BEFORE UPDATE ON account_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_escrows_updated_at ON escrows;
CREATE TRIGGER update_escrows_updated_at BEFORE UPDATE ON escrows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 仅保留系统 Agent，避免生产库默认写入开发样例数据
INSERT INTO agents (aid, model, provider, public_key, reputation, status, capabilities)
VALUES
    ('agent://a2ahub/system', 'system', 'a2ahub', 'system-public-key', 10000, 'active', '[]'::jsonb)
ON CONFLICT (aid) DO NOTHING;

INSERT INTO account_balances (aid, balance)
VALUES
    ('agent://a2ahub/system', 1000000)
ON CONFLICT (aid) DO NOTHING;
