package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
	"github.com/sirupsen/logrus"
)

// PostgresDB PostgreSQL 数据库连接
type PostgresDB struct {
	DB *sql.DB
}

// NewPostgresDB 创建新的 PostgreSQL 连接
func NewPostgresDB(dsn string) (*PostgresDB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// 设置连接池
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	logrus.Info("PostgreSQL connected successfully")

	return &PostgresDB{DB: db}, nil
}

// Close 关闭数据库连接
func (p *PostgresDB) Close() error {
	return p.DB.Close()
}

// InitSchema 初始化数据库表结构
func (p *PostgresDB) InitSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS agents (
		aid VARCHAR(128) PRIMARY KEY,
		model VARCHAR(64) NOT NULL,
		provider VARCHAR(64) NOT NULL,
		public_key TEXT NOT NULL,
		capabilities JSONB,
		reputation INT DEFAULT 100,
		status VARCHAR(32) DEFAULT 'active',
		membership_level VARCHAR(32) NOT NULL DEFAULT 'registered',
		trust_level VARCHAR(32) NOT NULL DEFAULT 'new',
		headline VARCHAR(160) NOT NULL DEFAULT '',
		bio TEXT NOT NULL DEFAULT '',
		availability_status VARCHAR(32) NOT NULL DEFAULT 'available',
		binding_key_hash VARCHAR(128) NOT NULL DEFAULT '',
		owner_email VARCHAR(320) NOT NULL DEFAULT '',
		owner_email_verified_at TIMESTAMP NULL,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	ALTER TABLE agents ADD COLUMN IF NOT EXISTS membership_level VARCHAR(32) NOT NULL DEFAULT 'registered';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS trust_level VARCHAR(32) NOT NULL DEFAULT 'new';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS headline VARCHAR(160) NOT NULL DEFAULT '';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS availability_status VARCHAR(32) NOT NULL DEFAULT 'available';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS binding_key_hash VARCHAR(128) NOT NULL DEFAULT '';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_email VARCHAR(320) NOT NULL DEFAULT '';
	ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_email_verified_at TIMESTAMP NULL;
	UPDATE agents SET trust_level = 'active' WHERE trust_level = 'trial';

	CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model);
	CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider);
	CREATE INDEX IF NOT EXISTS idx_agents_reputation ON agents(reputation DESC);
	CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
	CREATE INDEX IF NOT EXISTS idx_agents_binding_key_hash ON agents(binding_key_hash);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_owner_email_unique ON agents(owner_email) WHERE owner_email <> '';

	CREATE TABLE IF NOT EXISTS reputation_history (
		id BIGSERIAL PRIMARY KEY,
		aid VARCHAR(128) NOT NULL,
		change INT NOT NULL,
		reason VARCHAR(256) NOT NULL,
		old_value INT NOT NULL,
		new_value INT NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		FOREIGN KEY (aid) REFERENCES agents(aid) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_reputation_history_aid ON reputation_history(aid);
	CREATE INDEX IF NOT EXISTS idx_reputation_history_created_at ON reputation_history(created_at DESC);

	CREATE TABLE IF NOT EXISTS notifications (
		id BIGSERIAL PRIMARY KEY,
		notification_id VARCHAR(64) UNIQUE NOT NULL,
		recipient_aid VARCHAR(128) NOT NULL REFERENCES agents(aid) ON DELETE CASCADE,
		type VARCHAR(32) NOT NULL,
		title VARCHAR(256) NOT NULL,
		content TEXT,
		link VARCHAR(512),
		is_read BOOLEAN DEFAULT FALSE,
		metadata JSONB DEFAULT '{}'::jsonb,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_notifications_recipient_aid ON notifications(recipient_aid);
	CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
	CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

	CREATE TABLE IF NOT EXISTS agent_capability_profiles (
		aid VARCHAR(128) PRIMARY KEY REFERENCES agents(aid) ON DELETE CASCADE,
		owner_email VARCHAR(320) NOT NULL DEFAULT '',
		primary_domain VARCHAR(64) NOT NULL DEFAULT 'automation',
		domain_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
		current_maturity_pool VARCHAR(32) NOT NULL DEFAULT 'cold_start',
		recommended_task_scope VARCHAR(64) NOT NULL DEFAULT 'low_risk_only',
		auto_growth_eligible BOOLEAN NOT NULL DEFAULT FALSE,
		completed_task_count INT NOT NULL DEFAULT 0,
		active_skill_count INT NOT NULL DEFAULT 0,
		total_task_count INT NOT NULL DEFAULT 0,
		incubating_draft_count INT NOT NULL DEFAULT 0,
		validated_draft_count INT NOT NULL DEFAULT 0,
		published_draft_count INT NOT NULL DEFAULT 0,
		employer_template_count INT NOT NULL DEFAULT 0,
		template_reuse_count INT NOT NULL DEFAULT 0,
		experience_card_count INT NOT NULL DEFAULT 0,
		cross_employer_validated_count INT NOT NULL DEFAULT 0,
		active_risk_memory_count INT NOT NULL DEFAULT 0,
		high_risk_memory_count INT NOT NULL DEFAULT 0,
		growth_score INT NOT NULL DEFAULT 0,
		risk_score INT NOT NULL DEFAULT 0,
		promotion_readiness_score INT NOT NULL DEFAULT 0,
		recommended_next_pool VARCHAR(32) NOT NULL DEFAULT 'observed',
		promotion_candidate BOOLEAN NOT NULL DEFAULT FALSE,
		suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
		risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
		evaluation_summary TEXT NOT NULL DEFAULT '',
		last_evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS incubating_draft_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS validated_draft_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS published_draft_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS employer_template_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS template_reuse_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS experience_card_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS cross_employer_validated_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS active_risk_memory_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS high_risk_memory_count INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS growth_score INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS risk_score INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS promotion_readiness_score INT NOT NULL DEFAULT 0;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS recommended_next_pool VARCHAR(32) NOT NULL DEFAULT 'observed';
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS promotion_candidate BOOLEAN NOT NULL DEFAULT FALSE;
	ALTER TABLE agent_capability_profiles ADD COLUMN IF NOT EXISTS suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb;

	CREATE INDEX IF NOT EXISTS idx_agent_capability_profiles_maturity_pool ON agent_capability_profiles(current_maturity_pool);
	CREATE INDEX IF NOT EXISTS idx_agent_capability_profiles_primary_domain ON agent_capability_profiles(primary_domain);
	CREATE INDEX IF NOT EXISTS idx_agent_capability_profiles_last_evaluated_at ON agent_capability_profiles(last_evaluated_at DESC);
	CREATE INDEX IF NOT EXISTS idx_agent_capability_profiles_promotion_candidate ON agent_capability_profiles(promotion_candidate);

	CREATE TABLE IF NOT EXISTS agent_pool_memberships (
		id BIGSERIAL PRIMARY KEY,
		aid VARCHAR(128) NOT NULL REFERENCES agents(aid) ON DELETE CASCADE,
		pool_type VARCHAR(32) NOT NULL,
		pool_key VARCHAR(64) NOT NULL,
		pool_score INT NOT NULL DEFAULT 0,
		status VARCHAR(32) NOT NULL DEFAULT 'active',
		effective_at TIMESTAMP NOT NULL DEFAULT NOW(),
		expires_at TIMESTAMP NULL,
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_agent_pool_memberships_aid ON agent_pool_memberships(aid);
	CREATE INDEX IF NOT EXISTS idx_agent_pool_memberships_pool_type ON agent_pool_memberships(pool_type);
	CREATE INDEX IF NOT EXISTS idx_agent_pool_memberships_pool_key ON agent_pool_memberships(pool_key);

	CREATE TABLE IF NOT EXISTS agent_evaluation_runs (
		id BIGSERIAL PRIMARY KEY,
		evaluation_id VARCHAR(64) NOT NULL UNIQUE,
		aid VARCHAR(128) NOT NULL REFERENCES agents(aid) ON DELETE CASCADE,
		trigger_type VARCHAR(64) NOT NULL DEFAULT 'manual',
		primary_domain VARCHAR(64) NOT NULL,
		maturity_pool VARCHAR(32) NOT NULL,
		domain_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
		risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
		decision_summary TEXT NOT NULL DEFAULT '',
		profile_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_agent_evaluation_runs_aid ON agent_evaluation_runs(aid);
	CREATE INDEX IF NOT EXISTS idx_agent_evaluation_runs_trigger_type ON agent_evaluation_runs(trigger_type);
	CREATE INDEX IF NOT EXISTS idx_agent_evaluation_runs_created_at ON agent_evaluation_runs(created_at DESC);
	`

	_, err := p.DB.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	logrus.Info("Database schema initialized successfully")
	return nil
}
