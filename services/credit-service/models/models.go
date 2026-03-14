package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type Account struct {
	AID           string          `json:"aid" db:"aid"`
	Balance       decimal.Decimal `json:"balance" db:"balance"`
	FrozenBalance decimal.Decimal `json:"frozen_balance" db:"frozen_balance"`
	TotalEarned   decimal.Decimal `json:"total_earned" db:"total_earned"`
	TotalSpent    decimal.Decimal `json:"total_spent" db:"total_spent"`
	UpdatedAt     time.Time       `json:"updated_at" db:"updated_at"`
}

type Transaction struct {
	ID            int64           `json:"id" db:"id"`
	TransactionID string          `json:"transaction_id" db:"transaction_id"`
	Type          string          `json:"type" db:"type"`
	FromAID       string          `json:"from_aid" db:"from_aid"`
	ToAID         string          `json:"to_aid" db:"to_aid"`
	Amount        decimal.Decimal `json:"amount" db:"amount"`
	Fee           decimal.Decimal `json:"fee" db:"fee"`
	Status        string          `json:"status" db:"status"`
	Metadata      string          `json:"metadata,omitempty" db:"metadata"`
	CreatedAt     time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at" db:"updated_at"`
}

type Escrow struct {
	ID               int64           `json:"id" db:"id"`
	EscrowID         string          `json:"escrow_id" db:"escrow_id"`
	PayerAID         string          `json:"payer_aid" db:"payer_aid"`
	PayeeAID         string          `json:"payee_aid" db:"payee_aid"`
	Amount           decimal.Decimal `json:"amount" db:"amount"`
	Status           string          `json:"status" db:"status"`
	ReleaseCondition string          `json:"release_condition" db:"release_condition"`
	Timeout          time.Time       `json:"timeout" db:"timeout"`
	CreatedAt        time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at" db:"updated_at"`
}

type AuditLog struct {
	ID            int64     `json:"id" db:"id"`
	TransactionID string    `json:"transaction_id" db:"transaction_id"`
	Action        string    `json:"action" db:"action"`
	ActorAID      string    `json:"actor_aid" db:"actor_aid"`
	Details       string    `json:"details" db:"details"`
	IPAddress     string    `json:"ip_address" db:"ip_address"`
	UserAgent     string    `json:"user_agent" db:"user_agent"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

type Notification struct {
	ID             int64     `json:"id" db:"id"`
	NotificationID string    `json:"notification_id" db:"notification_id"`
	RecipientAID   string    `json:"recipient_aid" db:"recipient_aid"`
	Type           string    `json:"type" db:"type"`
	Title          string    `json:"title" db:"title"`
	Content        string    `json:"content" db:"content"`
	Link           string    `json:"link" db:"link"`
	IsRead         bool      `json:"is_read" db:"is_read"`
	Metadata       string    `json:"metadata" db:"metadata"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

const (
	TransactionTypeCreditTransfer = "credit_transfer"
	TransactionTypeSkillPurchase  = "skill_purchase"
	TransactionTypeTaskPayment    = "task_payment"
	TransactionTypeEscrow         = "escrow"
	TransactionTypeEscrowRelease  = "escrow_release"
	TransactionTypeEscrowRefund   = "escrow_refund"
)

const (
	TransactionStatusPending    = "pending"
	TransactionStatusProcessing = "processing"
	TransactionStatusCompleted  = "completed"
	TransactionStatusFailed     = "failed"
	TransactionStatusCancelled  = "cancelled"
	TransactionStatusRefunded   = "refunded"
)

const (
	EscrowStatusLocked   = "locked"
	EscrowStatusReleased = "released"
	EscrowStatusRefunded = "refunded"
	EscrowStatusExpired  = "expired"
)
