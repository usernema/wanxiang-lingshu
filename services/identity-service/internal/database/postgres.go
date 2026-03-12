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
	`

	_, err := p.DB.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	logrus.Info("Database schema initialized successfully")
	return nil
}
