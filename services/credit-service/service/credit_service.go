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

 type AccountRepository interface {
	Create(ctx context.Context, aid string) error
	CreateWithInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error
	UpsertInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error
	GetBalance(ctx context.Context, aid string) (*models.Account, error)
	UpdateBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error
	FreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error
	UnfreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error
	ReleaseFrozenBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error
 }

var devSeededCredits = map[string]decimal.Decimal{
	"agent://a2ahub/dev-default":  decimal.NewFromInt(250),
	"agent://a2ahub/dev-employer": decimal.NewFromInt(1000),
	"agent://a2ahub/dev-worker":   decimal.NewFromInt(300),
}

func (s *CreditService) initialCreditsForAID(aid string) decimal.Decimal {
	if amount, ok := devSeededCredits[aid]; ok {
		return amount
	}
	return decimal.NewFromFloat(s.cfg.Credit.DefaultCredits)
}

func (s *CreditService) EnsureSeededAccount(ctx context.Context, aid string) error {
	return s.accountRepo.UpsertInitialBalance(ctx, aid, s.initialCreditsForAID(aid))
}

func (s *CreditService) EnsureSeededAccounts(ctx context.Context, aids ...string) error {
	for _, aid := range aids {
		if aid == "" {
			continue
		}
		if err := s.EnsureSeededAccount(ctx, aid); err != nil {
			return err
		}
	}
	return nil
}

func (s *CreditService) EnsureAllDevSeededAccounts(ctx context.Context) error {
	for aid := range devSeededCredits {
		if err := s.EnsureSeededAccount(ctx, aid); err != nil {
			return err
		}
	}
	return nil
}

func isDevSeededAID(aid string) bool {
	_, ok := devSeededCredits[aid]
	return ok
}

func (s *CreditService) ensureAccountsForTransfer(ctx context.Context, aids ...string) error {
	for _, aid := range aids {
		if aid == "" {
			continue
		}
		if isDevSeededAID(aid) {
			if err := s.EnsureSeededAccount(ctx, aid); err != nil {
				return err
			}
			continue
		}
		if err := s.accountRepo.CreateWithInitialBalance(ctx, aid, s.initialCreditsForAID(aid)); err != nil {
			return err
		}
	}
	return nil
}

func (s *CreditService) ensureAccountsForEscrow(ctx context.Context, aids ...string) error {
	return s.ensureAccountsForTransfer(ctx, aids...)
}

func (s *CreditService) ensureAccountForBalance(ctx context.Context, aid string) error {
	if aid == "" {
		return nil
	}
	if isDevSeededAID(aid) {
		return s.EnsureSeededAccount(ctx, aid)
	}
	return s.accountRepo.CreateWithInitialBalance(ctx, aid, s.initialCreditsForAID(aid))
}

func (s *CreditService) ensureAccountForGetBalance(ctx context.Context, aid string) error {
	return s.ensureAccountForBalance(ctx, aid)
}

func (s *CreditService) ensureAccountForCreate(ctx context.Context, aid string) error {
	return s.ensureAccountForBalance(ctx, aid)
}

func (s *CreditService) ensureAccountsBeforeRelease(ctx context.Context, payerAID, payeeAID string) error {
	return s.ensureAccountsForTransfer(ctx, payerAID, payeeAID)
}

func (s *CreditService) ensureAccountsBeforeRefund(ctx context.Context, payerAID string) error {
	return s.ensureAccountsForTransfer(ctx, payerAID)
}

func (s *CreditService) ensureAccountsBeforeValidation(ctx context.Context, fromAID, toAID string) error {
	return s.ensureAccountsForTransfer(ctx, fromAID, toAID)
}

func (s *CreditService) ensureAccountsBeforeEscrow(ctx context.Context, payerAID, payeeAID string) error {
	return s.ensureAccountsForEscrow(ctx, payerAID, payeeAID)
}

func (s *CreditService) ensureAccountsBeforeBalanceLookup(ctx context.Context, aid string) error {
	return s.ensureAccountForGetBalance(ctx, aid)
}

func (s *CreditService) ensureAccountsBeforeCreate(ctx context.Context, aid string) error {
	return s.ensureAccountForCreate(ctx, aid)
}

func (s *CreditService) ensureAccountsBeforeReleaseEscrow(ctx context.Context, payerAID, payeeAID string) error {
	return s.ensureAccountsBeforeRelease(ctx, payerAID, payeeAID)
}

func (s *CreditService) ensureAccountsBeforeRefundEscrow(ctx context.Context, payerAID string) error {
	return s.ensureAccountsBeforeRefund(ctx, payerAID)
}

func (s *CreditService) ensureAccountsBeforeTransferValidation(ctx context.Context, fromAID, toAID string) error {
	return s.ensureAccountsBeforeValidation(ctx, fromAID, toAID)
}

func (s *CreditService) ensureAccountsBeforeCreateEscrow(ctx context.Context, payerAID, payeeAID string) error {
	return s.ensureAccountsBeforeEscrow(ctx, payerAID, payeeAID)
}

func (s *CreditService) ensureAccountsBeforeGetBalance(ctx context.Context, aid string) error {
	return s.ensureAccountsBeforeBalanceLookup(ctx, aid)
}

func (s *CreditService) ensureAccountsBeforeCreateAccount(ctx context.Context, aid string) error {
	return s.ensureAccountsBeforeCreate(ctx, aid)
}

 type TransactionRepository interface {
	Create(ctx context.Context, tx *sql.Tx, transaction *models.Transaction) error
	UpdateStatus(ctx context.Context, tx *sql.Tx, transactionID string, status string) error
	GetByID(ctx context.Context, transactionID string) (*models.Transaction, error)
	List(ctx context.Context, aid string, limit, offset int) ([]*models.Transaction, error)
	GetDailyTotal(ctx context.Context, aid string) (decimal.Decimal, error)
 }

 type EscrowRepository interface {
	Create(ctx context.Context, tx *sql.Tx, escrow *models.Escrow) error
	UpdateStatus(ctx context.Context, tx *sql.Tx, escrowID string, status string) error
	GetByID(ctx context.Context, escrowID string) (*models.Escrow, error)
	GetExpired(ctx context.Context) ([]*models.Escrow, error)
 }

 type AuditRepository interface {
	Create(ctx context.Context, auditLog *models.AuditLog) error
 }

 type LockManager interface {
	Lock(ctx context.Context, key string, ttl time.Duration) error
	Unlock(ctx context.Context, key string) error
 }

 type RiskChecker interface {
	CheckTransaction(ctx context.Context, aid string, amount decimal.Decimal) error
 }

 type NotificationPublisher interface {
	SendTransactionNotification(transaction *models.Transaction)
	SendEscrowNotification(escrow *models.Escrow, action string)
 }

var (
	_ AccountRepository = (*repository.AccountRepository)(nil)
	_ TransactionRepository = (*repository.TransactionRepository)(nil)
	_ EscrowRepository = (*repository.EscrowRepository)(nil)
	_ AuditRepository = (*repository.AuditRepository)(nil)
	_ LockManager = (*LockService)(nil)
	_ RiskChecker = (*RiskService)(nil)
	_ NotificationPublisher = (*NotificationQueue)(nil)
)


type CreditService struct {
	db                *sql.DB
	cfg               *config.Config
	accountRepo       AccountRepository
	transactionRepo   TransactionRepository
	escrowRepo        EscrowRepository
	auditRepo         AuditRepository
	lockService       LockManager
	riskService       RiskChecker
	notificationQueue NotificationPublisher
}

func NewCreditService(
	db *sql.DB,
	cfg *config.Config,
	accountRepo AccountRepository,
	transactionRepo TransactionRepository,
	escrowRepo EscrowRepository,
	auditRepo AuditRepository,
	lockService LockManager,
	riskService RiskChecker,
	notificationQueue NotificationPublisher,
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
	return s.ensureAccountsBeforeCreateAccount(ctx, aid)
}

func (s *CreditService) GetBalance(ctx context.Context, aid string) (*models.Account, error) {
	if err := s.ensureAccountsBeforeGetBalance(ctx, aid); err != nil {
		return nil, err
	}
	return s.accountRepo.GetBalance(ctx, aid)
}

func (s *CreditService) Transfer(ctx context.Context, fromAID, toAID string, amount decimal.Decimal, memo string, metadata map[string]interface{}) (*models.Transaction, error) {
	if err := s.ensureAccountsBeforeTransferValidation(ctx, fromAID, toAID); err != nil {
		return nil, err
	}
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
