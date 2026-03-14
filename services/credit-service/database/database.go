package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
	"github.com/a2ahub/credit-service/config"
)

func Connect(cfg *config.DatabaseConfig) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return db, nil
}

func InitSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS account_balances (
		aid VARCHAR(128) PRIMARY KEY,
		balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
		frozen_balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
		total_earned DECIMAL(18, 2) NOT NULL DEFAULT 0,
		total_spent DECIMAL(18, 2) NOT NULL DEFAULT 0,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS transactions (
		id BIGSERIAL PRIMARY KEY,
		transaction_id VARCHAR(64) UNIQUE NOT NULL,
		type VARCHAR(32) NOT NULL,
		from_aid VARCHAR(128) NOT NULL,
		to_aid VARCHAR(128) NOT NULL,
		amount DECIMAL(18, 2) NOT NULL,
		fee DECIMAL(18, 2) DEFAULT 0,
		status VARCHAR(32) NOT NULL,
		metadata JSONB,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(64);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type VARCHAR(32);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS from_aid VARCHAR(128);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_aid VARCHAR(128);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount DECIMAL(18, 2);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee DECIMAL(18, 2) DEFAULT 0;
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(32);
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB;
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);
	CREATE INDEX IF NOT EXISTS idx_transactions_from_aid ON transactions(from_aid);
	CREATE INDEX IF NOT EXISTS idx_transactions_to_aid ON transactions(to_aid);
	CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

	CREATE TABLE IF NOT EXISTS escrows (
		id BIGSERIAL PRIMARY KEY,
		escrow_id VARCHAR(64) UNIQUE NOT NULL,
		payer_aid VARCHAR(128) NOT NULL,
		payee_aid VARCHAR(128) NOT NULL,
		amount DECIMAL(18, 2) NOT NULL,
		status VARCHAR(32) NOT NULL,
		release_condition VARCHAR(128),
		timeout TIMESTAMP NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS escrow_id VARCHAR(64);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS payer_aid VARCHAR(128);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS payee_aid VARCHAR(128);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS amount DECIMAL(18, 2);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS status VARCHAR(32);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS release_condition VARCHAR(128);
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS timeout TIMESTAMP;
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	ALTER TABLE escrows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_escrow_id ON escrows(escrow_id);
	CREATE INDEX IF NOT EXISTS idx_escrows_payer_aid ON escrows(payer_aid);
	CREATE INDEX IF NOT EXISTS idx_escrows_payee_aid ON escrows(payee_aid);
	CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id BIGSERIAL PRIMARY KEY,
		transaction_id VARCHAR(64),
		action VARCHAR(64) NOT NULL,
		actor_aid VARCHAR(128) NOT NULL,
		details JSONB,
		ip_address VARCHAR(45),
		user_agent TEXT,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(64);
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(64);
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_aid VARCHAR(128);
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
	ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction_id ON audit_logs(transaction_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_aid ON audit_logs(actor_aid);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

	CREATE TABLE IF NOT EXISTS notifications (
		id BIGSERIAL PRIMARY KEY,
		notification_id VARCHAR(64) UNIQUE NOT NULL,
		recipient_aid VARCHAR(128) NOT NULL,
		type VARCHAR(32) NOT NULL,
		title VARCHAR(256) NOT NULL,
		content TEXT,
		link VARCHAR(512),
		is_read BOOLEAN DEFAULT FALSE,
		metadata JSONB DEFAULT '{}'::jsonb,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_id VARCHAR(64);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_aid VARCHAR(128);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(32);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(256);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS content TEXT;
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(512);
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
	ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_notification_id ON notifications(notification_id);
	CREATE INDEX IF NOT EXISTS idx_notifications_recipient_aid ON notifications(recipient_aid);
	CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
	CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
	`

	_, err := db.Exec(schema)
	return err
}
