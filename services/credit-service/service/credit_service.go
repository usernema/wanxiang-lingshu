package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/a2ahub/credit-service/config"
	"github.com/a2ahub/credit-service/models"
	"github.com/a2ahub/credit-service/repository"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type CreditService struct {
	db                *sql.DB
	cfg               *config.Config
	accountRepo       *repository.AccountRepository
	transactionRepo   *repository.TransactionRepository
	escrowRepo        *repository.EscrowRepository
	auditRepo         *repository.AuditRepository
	lockService       *LockService
	riskService       *RiskService
	notificationQueue *NotificationQueue
}

func NewCreditService(
	db *sql.DB,
	cfg *config.Config,
	accountRepo *repository.AccountRepository,
	transactionRepo *repository.TransactionRepository,
	escrowRepo *repository.EscrowRepository,
	auditRepo *repository.AuditRepository,
	lockService *LockService,
	riskService *RiskService,
	notificationQueue *NotificationQueue,
) *CreditService {
	return &CreditService{
		db:                db,
		cfg:               cfg,
		accountRepo:       accountRepo,
		transactionRepo:   transactionRepo,
		escrowRepo:        escrowRepo,
		auditRepo:         auditRepo,
		lockService:       lockService,
		riskService:       riskService,
		notificationQueue: notificationQueue,
	}
}

func (s *CreditService) CreateAccount(ctx context.Context, aid string) error {
	return s.accountRepo.Create(ctx, aid)
}

func (s *CreditService) GetBalance(ctx context.Context, aid string) (*models.Account, error) {
	return s.accountRepo.GetBalance(ctx, aid)
}

func (s *CreditService) Transfer(ctx context.Context, fromAID, toAID string, amount decimal.Decimal, memo string, metadata map[string]interface{}) (*models.Transaction, error) {
	if err := s.validateTransfer(ctx, fromAID, toAID, amount); err != nil {
		return nil, err
	}

	lockKey := fmt.Sprintf("transfer:%s", fromAID)
	if err := s.lockService.Lock(ctx, lockKey, 10*time.Second); err != nil {
		return nil, fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.lockService.Unlock(ctx, lockKey)

	if err := s.riskService.CheckTransaction(ctx, fromAID, amount); err != nil {
		return nil, fmt.Errorf("risk check failed: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	metadataJSON, _ := json.Marshal(metadata)
	transaction := &models.Transaction{
		TransactionID: fmt.Sprintf("tx_%s", uuid.New().String()),
		Type:          models.TransactionTypeCreditTransfer,
		FromAID:       fromAID,
		ToAID:         toAID,
		Amount:        amount,
		Fee:           decimal.Zero,
		Status:        models.TransactionStatusProcessing,
		Metadata:      string(metadataJSON),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.transactionRepo.Create(ctx, tx, transaction); err != nil {
		return nil, err
	}

	if err := s.accountRepo.UpdateBalance(ctx, tx, fromAID, amount.Neg()); err != nil {
		return nil, fmt.Errorf("failed to deduct from sender: %w", err)
	}

	if err := s.accountRepo.UpdateBalance(ctx, tx, toAID, amount); err != nil {
		return nil, fmt.Errorf("failed to credit receiver: %w", err)
	}

	transaction.Status = models.TransactionStatusCompleted
	if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.TransactionID, models.TransactionStatusCompleted); err != nil {
		return nil, err
	}

	auditLog := &models.AuditLog{
		TransactionID: transaction.TransactionID,
		Action:        "transfer",
		ActorAID:      fromAID,
		Details:       string(metadataJSON),
		CreatedAt:     time.Now(),
	}
	if err := s.auditRepo.Create(ctx, auditLog); err != nil {
		// Log error but don't fail transaction
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	s.notificationQueue.SendTransactionNotification(transaction)

	return transaction, nil
}

func (s *CreditService) validateTransfer(ctx context.Context, fromAID, toAID string, amount decimal.Decimal) error {
	if fromAID == toAID {
		return fmt.Errorf("cannot transfer to self")
	}

	minAmount := decimal.NewFromFloat(s.cfg.Credit.MinTransaction)
	maxAmount := decimal.NewFromFloat(s.cfg.Credit.MaxTransaction)

	if amount.LessThan(minAmount) {
		return fmt.Errorf("amount below minimum: %s", minAmount)
	}

	if amount.GreaterThan(maxAmount) {
		return fmt.Errorf("amount exceeds maximum: %s", maxAmount)
	}

	account, err := s.accountRepo.GetBalance(ctx, fromAID)
	if err != nil {
		return fmt.Errorf("failed to get balance: %w", err)
	}

	if account.Balance.LessThan(amount) {
		return fmt.Errorf("insufficient balance")
	}

	dailyTotal, err := s.transactionRepo.GetDailyTotal(ctx, fromAID)
	if err != nil {
		return err
	}

	dailyLimit := decimal.NewFromFloat(s.cfg.Credit.DailyLimit)
	if dailyTotal.Add(amount).GreaterThan(dailyLimit) {
		return fmt.Errorf("daily limit exceeded")
	}

	return nil
}
