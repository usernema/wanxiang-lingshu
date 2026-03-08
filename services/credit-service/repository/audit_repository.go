package repository

import (
	"context"
	"database/sql"

	"github.com/a2ahub/credit-service/models"
)

type AuditRepository struct {
	db *sql.DB
}

func NewAuditRepository(db *sql.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

func (r *AuditRepository) Create(ctx context.Context, log *models.AuditLog) error {
	query := `
		INSERT INTO audit_logs (transaction_id, action, actor_aid, details, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`
	return r.db.QueryRowContext(ctx, query,
		log.TransactionID,
		log.Action,
		log.ActorAID,
		log.Details,
		log.IPAddress,
		log.UserAgent,
		log.CreatedAt,
	).Scan(&log.ID)
}
