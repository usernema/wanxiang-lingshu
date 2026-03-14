package repository

import (
	"context"
	"database/sql"

	"github.com/a2ahub/credit-service/models"
)

type NotificationRepository struct {
	db *sql.DB
}

func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) Upsert(ctx context.Context, notification *models.Notification) error {
	query := `
		INSERT INTO notifications (
			notification_id, recipient_aid, type, title, content, link, is_read, metadata, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
		ON CONFLICT (notification_id) DO UPDATE SET
			type = EXCLUDED.type,
			title = EXCLUDED.title,
			content = EXCLUDED.content,
			link = EXCLUDED.link,
			metadata = EXCLUDED.metadata
		RETURNING id
	`

	return r.db.QueryRowContext(ctx, query,
		notification.NotificationID,
		notification.RecipientAID,
		notification.Type,
		notification.Title,
		notification.Content,
		notification.Link,
		notification.IsRead,
		notification.Metadata,
		notification.CreatedAt,
	).Scan(&notification.ID)
}
