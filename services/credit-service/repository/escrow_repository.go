package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/a2ahub/credit-service/models"
)

type EscrowRepository struct {
	db *sql.DB
}

func NewEscrowRepository(db *sql.DB) *EscrowRepository {
	return &EscrowRepository{db: db}
}

func (r *EscrowRepository) Create(ctx context.Context, tx *sql.Tx, escrow *models.Escrow) error {
	query := `
		INSERT INTO escrows (escrow_id, payer_aid, payee_aid, amount, status, release_condition, timeout, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`
	return tx.QueryRowContext(ctx, query,
		escrow.EscrowID,
		escrow.PayerAID,
		escrow.PayeeAID,
		escrow.Amount,
		escrow.Status,
		escrow.ReleaseCondition,
		escrow.Timeout,
		escrow.CreatedAt,
		escrow.UpdatedAt,
	).Scan(&escrow.ID)
}

func (r *EscrowRepository) GetByID(ctx context.Context, escrowID string) (*models.Escrow, error) {
	query := `
		SELECT id, escrow_id, payer_aid, payee_aid, amount, status, release_condition, timeout, created_at, updated_at
		FROM escrows
		WHERE escrow_id = $1
	`
	var escrow models.Escrow
	err := r.db.QueryRowContext(ctx, query, escrowID).Scan(
		&escrow.ID,
		&escrow.EscrowID,
		&escrow.PayerAID,
		&escrow.PayeeAID,
		&escrow.Amount,
		&escrow.Status,
		&escrow.ReleaseCondition,
		&escrow.Timeout,
		&escrow.CreatedAt,
		&escrow.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &escrow, err
}

func (r *EscrowRepository) UpdateStatus(ctx context.Context, tx *sql.Tx, escrowID string, status string) error {
	query := `
		UPDATE escrows
		SET status = $1, updated_at = $2
		WHERE escrow_id = $3
	`
	_, err := tx.ExecContext(ctx, query, status, time.Now(), escrowID)
	return err
}

func (r *EscrowRepository) GetExpired(ctx context.Context) ([]*models.Escrow, error) {
	query := `
		SELECT id, escrow_id, payer_aid, payee_aid, amount, status, release_condition, timeout, created_at, updated_at
		FROM escrows
		WHERE status = $1 AND timeout < $2
	`
	rows, err := r.db.QueryContext(ctx, query, models.EscrowStatusLocked, time.Now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var escrows []*models.Escrow
	for rows.Next() {
		var escrow models.Escrow
		err := rows.Scan(
			&escrow.ID,
			&escrow.EscrowID,
			&escrow.PayerAID,
			&escrow.PayeeAID,
			&escrow.Amount,
			&escrow.Status,
			&escrow.ReleaseCondition,
			&escrow.Timeout,
			&escrow.CreatedAt,
			&escrow.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		escrows = append(escrows, &escrow)
	}
	return escrows, nil
}
