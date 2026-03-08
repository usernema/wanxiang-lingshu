package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/a2ahub/credit-service/models"
	"github.com/shopspring/decimal"
)

type TransactionRepository struct {
	db *sql.DB
}

func NewTransactionRepository(db *sql.DB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

func (r *TransactionRepository) Create(ctx context.Context, tx *sql.Tx, transaction *models.Transaction) error {
	query := `
		INSERT INTO transactions (transaction_id, type, from_aid, to_aid, amount, fee, status, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`
	return tx.QueryRowContext(ctx, query,
		transaction.TransactionID,
		transaction.Type,
		transaction.FromAID,
		transaction.ToAID,
		transaction.Amount,
		transaction.Fee,
		transaction.Status,
		transaction.Metadata,
		transaction.CreatedAt,
		transaction.UpdatedAt,
	).Scan(&transaction.ID)
}

func (r *TransactionRepository) UpdateStatus(ctx context.Context, tx *sql.Tx, transactionID string, status string) error {
	query := `
		UPDATE transactions
		SET status = $1, updated_at = $2
		WHERE transaction_id = $3
	`
	_, err := tx.ExecContext(ctx, query, status, time.Now(), transactionID)
	return err
}

func (r *TransactionRepository) GetByID(ctx context.Context, transactionID string) (*models.Transaction, error) {
	query := `
		SELECT id, transaction_id, type, from_aid, to_aid, amount, fee, status, metadata, created_at, updated_at
		FROM transactions
		WHERE transaction_id = $1
	`
	var transaction models.Transaction
	err := r.db.QueryRowContext(ctx, query, transactionID).Scan(
		&transaction.ID,
		&transaction.TransactionID,
		&transaction.Type,
		&transaction.FromAID,
		&transaction.ToAID,
		&transaction.Amount,
		&transaction.Fee,
		&transaction.Status,
		&transaction.Metadata,
		&transaction.CreatedAt,
		&transaction.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &transaction, err
}

func (r *TransactionRepository) List(ctx context.Context, aid string, limit, offset int) ([]*models.Transaction, error) {
	query := `
		SELECT id, transaction_id, type, from_aid, to_aid, amount, fee, status, metadata, created_at, updated_at
		FROM transactions
		WHERE from_aid = $1 OR to_aid = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, query, aid, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*models.Transaction
	for rows.Next() {
		var transaction models.Transaction
		err := rows.Scan(
			&transaction.ID,
			&transaction.TransactionID,
			&transaction.Type,
			&transaction.FromAID,
			&transaction.ToAID,
			&transaction.Amount,
			&transaction.Fee,
			&transaction.Status,
			&transaction.Metadata,
			&transaction.CreatedAt,
			&transaction.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, &transaction)
	}
	return transactions, nil
}

func (r *TransactionRepository) GetDailyTotal(ctx context.Context, aid string) (decimal.Decimal, error) {
	query := `
		SELECT COALESCE(SUM(amount), 0)
		FROM transactions
		WHERE from_aid = $1 AND status = $2 AND created_at >= $3
	`
	var total decimal.Decimal
	err := r.db.QueryRowContext(ctx, query, aid, models.TransactionStatusCompleted, time.Now().Truncate(24*time.Hour)).Scan(&total)
	return total, err
}
