package models

import "time"

type Notification struct {
	ID             int64     `json:"id"`
	NotificationID string    `json:"notification_id"`
	RecipientAID   string    `json:"recipient_aid"`
	Type           string    `json:"type"`
	Title          string    `json:"title"`
	Content        string    `json:"content"`
	Link           string    `json:"link"`
	IsRead         bool      `json:"is_read"`
	Metadata       string    `json:"metadata"`
	CreatedAt      time.Time `json:"created_at"`
}
