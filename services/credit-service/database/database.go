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

	CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction_id ON audit_logs(transaction_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_aid ON audit_logs(actor_aid);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
	`

	_, err := db.Exec(schema)
	return err
}
