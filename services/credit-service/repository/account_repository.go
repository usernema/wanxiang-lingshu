package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/a2ahub/credit-service/models"
	"github.com/shopspring/decimal"
)

type AccountRepository struct {
	db *sql.DB
}

func NewAccountRepository(db *sql.DB) *AccountRepository {
	return &AccountRepository{db: db}
}

func (r *AccountRepository) Create(ctx context.Context, aid string) error {
	return r.CreateWithInitialBalance(ctx, aid, decimal.Zero)
}

func (r *AccountRepository) CreateWithInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error {
	query := `
		INSERT INTO account_balances (aid, balance, frozen_balance, total_earned, total_spent, updated_at)
		VALUES ($1, $2, 0, 0, 0, $3)
		ON CONFLICT (aid) DO NOTHING
	`
	_, err := r.db.ExecContext(ctx, query, aid, initialBalance, time.Now())
	return err
}

func (r *AccountRepository) UpsertInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error {
	query := `
		INSERT INTO account_balances (aid, balance, frozen_balance, total_earned, total_spent, updated_at)
		VALUES ($1, $2, 0, 0, 0, $3)
		ON CONFLICT (aid) DO UPDATE
		SET balance = CASE
			WHEN account_balances.balance = 0 AND account_balances.frozen_balance = 0 AND account_balances.total_earned = 0 AND account_balances.total_spent = 0
			THEN EXCLUDED.balance
			ELSE account_balances.balance
		END,
		updated_at = EXCLUDED.updated_at
	`
	_, err := r.db.ExecContext(ctx, query, aid, initialBalance, time.Now())
	return err
}

func (r *AccountRepository) GetBalance(ctx context.Context, aid string) (*models.Account, error) {
	query := `
		SELECT aid, balance, frozen_balance, total_earned, total_spent, updated_at
		FROM account_balances
		WHERE aid = $1
	`
	var account models.Account
	err := r.db.QueryRowContext(ctx, query, aid).Scan(
		&account.AID,
		&account.Balance,
		&account.FrozenBalance,
		&account.TotalEarned,
		&account.TotalSpent,
		&account.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("account not found")
	}
	return &account, err
}

func (r *AccountRepository) UpdateBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	query := `
		UPDATE account_balances
		SET balance = balance + $1, updated_at = $2
		WHERE aid = $3
	`
	_, err := tx.ExecContext(ctx, query, amount, time.Now(), aid)
	return err
}

func (r *AccountRepository) FreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	query := `
		UPDATE account_balances
		SET balance = balance - $1, frozen_balance = frozen_balance + $1, updated_at = $2
		WHERE aid = $3 AND balance >= $1
	`
	result, err := tx.ExecContext(ctx, query, amount, time.Now(), aid)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("insufficient balance")
	}
	return nil
}

func (r *AccountRepository) UnfreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	query := `
		UPDATE account_balances
		SET frozen_balance = frozen_balance - $1, balance = balance + $1, updated_at = $2
		WHERE aid = $3 AND frozen_balance >= $1
	`
	_, err := tx.ExecContext(ctx, query, amount, time.Now(), aid)
	return err
}

func (r *AccountRepository) ReleaseFrozenBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	query := `
		UPDATE account_balances
		SET frozen_balance = frozen_balance - $1, updated_at = $2
		WHERE aid = $3 AND frozen_balance >= $1
	`
	_, err := tx.ExecContext(ctx, query, amount, time.Now(), aid)
	return err
}
