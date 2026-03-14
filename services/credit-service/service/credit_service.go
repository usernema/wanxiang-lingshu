package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
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

var reservedAccountCredits = map[string]decimal.Decimal{
	"agent://a2ahub/system":            decimal.NewFromInt(1000000),
	"agent://a2ahub/platform-treasury": decimal.Zero,
}

func (s *CreditService) initialCreditsForAID(aid string) decimal.Decimal {
	if amount, ok := reservedAccountCredits[aid]; ok {
		return amount
	}
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

type NotificationRepository interface {
	Upsert(ctx context.Context, notification *models.Notification) error
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
	_ AccountRepository     = (*repository.AccountRepository)(nil)
	_ TransactionRepository = (*repository.TransactionRepository)(nil)
	_ EscrowRepository      = (*repository.EscrowRepository)(nil)
	_ AuditRepository       = (*repository.AuditRepository)(nil)
	_ LockManager           = (*LockService)(nil)
	_ RiskChecker           = (*RiskService)(nil)
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
	notificationRepo  NotificationRepository
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
	notificationRepo NotificationRepository,
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
		notificationRepo:  notificationRepo,
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

	s.emitTransactionNotifications(ctx, transaction)

	return transaction, nil
}

func (s *CreditService) emitTransactionNotifications(ctx context.Context, transaction *models.Transaction) {
	if transaction == nil {
		return
	}

	if s.notificationQueue != nil {
		s.notificationQueue.SendTransactionNotification(transaction)
	}

	if s.notificationRepo == nil {
		return
	}

	for _, notification := range buildTransactionNotifications(transaction) {
		if err := s.notificationRepo.Upsert(ctx, notification); err != nil {
			log.Printf("Failed to persist transaction notification %s: %v", notification.NotificationID, err)
		}
	}
}

func (s *CreditService) emitEscrowNotifications(ctx context.Context, escrow *models.Escrow, action string) {
	if escrow == nil {
		return
	}

	if s.notificationQueue != nil {
		s.notificationQueue.SendEscrowNotification(escrow, action)
	}

	if s.notificationRepo == nil {
		return
	}

	for _, notification := range buildEscrowNotifications(escrow, action) {
		if err := s.notificationRepo.Upsert(ctx, notification); err != nil {
			log.Printf("Failed to persist escrow notification %s: %v", notification.NotificationID, err)
		}
	}
}

func buildTransactionNotifications(transaction *models.Transaction) []*models.Notification {
	if transaction == nil {
		return nil
	}

	notifications := make([]*models.Notification, 0, 2)
	amount := transaction.Amount.String()
	baseMetadata := cloneMetadata(parseMetadataJSON(transaction.Metadata))
	link := resolveNotificationLink(baseMetadata, "/wallet?focus=notifications")

	if shouldDeliverUserNotification(transaction.FromAID) {
		notifications = append(notifications, &models.Notification{
			NotificationID: fmt.Sprintf("notif_%s_sender", transaction.TransactionID),
			RecipientAID:   transaction.FromAID,
			Type:           "credit_out",
			Title:          "积分转出成功",
			Content:        fmt.Sprintf("你已向 %s 转出 %s 积分。", transaction.ToAID, amount),
			Link:           link,
			IsRead:         false,
			Metadata:       mustJSON(mergeMetadata(baseMetadata, map[string]interface{}{"transaction_id": transaction.TransactionID, "direction": "outgoing", "type": transaction.Type})),
			CreatedAt:      transaction.UpdatedAt,
		})
	}

	if shouldDeliverUserNotification(transaction.ToAID) && transaction.ToAID != transaction.FromAID {
		notifications = append(notifications, &models.Notification{
			NotificationID: fmt.Sprintf("notif_%s_receiver", transaction.TransactionID),
			RecipientAID:   transaction.ToAID,
			Type:           "credit_in",
			Title:          "收到积分",
			Content:        fmt.Sprintf("你收到了来自 %s 的 %s 积分。", transaction.FromAID, amount),
			Link:           link,
			IsRead:         false,
			Metadata:       mustJSON(mergeMetadata(baseMetadata, map[string]interface{}{"transaction_id": transaction.TransactionID, "direction": "incoming", "type": transaction.Type})),
			CreatedAt:      transaction.UpdatedAt,
		})
	}

	return notifications
}

func buildEscrowNotifications(escrow *models.Escrow, action string) []*models.Notification {
	if escrow == nil {
		return nil
	}

	notifications := make([]*models.Notification, 0, 2)
	amount := escrow.Amount.String()
	createdAt := escrow.UpdatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	baseMetadata := cloneMetadata(parseMetadataJSON(escrow.Metadata))
	link := resolveNotificationLink(baseMetadata, "/wallet?focus=notifications")

	if shouldDeliverUserNotification(escrow.PayerAID) {
		notifications = append(notifications, &models.Notification{
			NotificationID: fmt.Sprintf("notif_%s_%s_payer", escrow.EscrowID, action),
			RecipientAID:   escrow.PayerAID,
			Type:           notificationTypeForEscrowAction(action),
			Title:          escrowPayerTitle(action),
			Content:        escrowPayerContent(action, escrow.PayeeAID, amount),
			Link:           link,
			IsRead:         false,
			Metadata:       mustJSON(mergeMetadata(baseMetadata, map[string]interface{}{"escrow_id": escrow.EscrowID, "action": action, "role": "payer"})),
			CreatedAt:      createdAt,
		})
	}

	if shouldDeliverUserNotification(escrow.PayeeAID) && action != "refunded" {
		notifications = append(notifications, &models.Notification{
			NotificationID: fmt.Sprintf("notif_%s_%s_payee", escrow.EscrowID, action),
			RecipientAID:   escrow.PayeeAID,
			Type:           notificationTypeForEscrowAction(action),
			Title:          escrowPayeeTitle(action),
			Content:        escrowPayeeContent(action, escrow.PayerAID, amount),
			Link:           link,
			IsRead:         false,
			Metadata:       mustJSON(mergeMetadata(baseMetadata, map[string]interface{}{"escrow_id": escrow.EscrowID, "action": action, "role": "payee"})),
			CreatedAt:      createdAt,
		})
	}

	return notifications
}

func shouldDeliverUserNotification(aid string) bool {
	if aid == "" {
		return false
	}
	_, reserved := reservedAccountCredits[aid]
	return !reserved
}

func notificationTypeForEscrowAction(action string) string {
	switch action {
	case "released":
		return "escrow_released"
	case "refunded":
		return "escrow_refunded"
	default:
		return "escrow_created"
	}
}

func escrowPayerTitle(action string) string {
	switch action {
	case "released":
		return "托管已放款"
	case "refunded":
		return "托管已退款"
	default:
		return "托管已创建"
	}
}

func escrowPayeeTitle(action string) string {
	switch action {
	case "released":
		return "托管已释放"
	default:
		return "收到托管通知"
	}
}

func escrowPayerContent(action, counterpartyAID, amount string) string {
	switch action {
	case "released":
		return fmt.Sprintf("你为 %s 锁定的 %s 积分托管已完成放款。", counterpartyAID, amount)
	case "refunded":
		return fmt.Sprintf("该笔托管中的 %s 积分已退回你的钱包。", amount)
	default:
		return fmt.Sprintf("你已为 %s 创建 %s 积分托管，资金暂时处于冻结状态。", counterpartyAID, amount)
	}
}

func escrowPayeeContent(action, counterpartyAID, amount string) string {
	switch action {
	case "released":
		return fmt.Sprintf("来自 %s 的 %s 积分托管已释放到你的钱包。", counterpartyAID, amount)
	default:
		return fmt.Sprintf("%s 已为你创建 %s 积分托管，等待后续验收放款。", counterpartyAID, amount)
	}
}

func mustJSON(value map[string]interface{}) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(body)
}

func parseMetadataJSON(raw string) map[string]interface{} {
	if raw == "" {
		return map[string]interface{}{}
	}

	var value map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return map[string]interface{}{}
	}
	return value
}

func cloneMetadata(metadata map[string]interface{}) map[string]interface{} {
	cloned := make(map[string]interface{}, len(metadata))
	for key, value := range metadata {
		cloned[key] = value
	}
	return cloned
}

func mergeMetadata(base map[string]interface{}, extra map[string]interface{}) map[string]interface{} {
	merged := cloneMetadata(base)
	for key, value := range extra {
		merged[key] = value
	}
	return merged
}

func resolveNotificationLink(metadata map[string]interface{}, fallback string) string {
	if metadata == nil {
		return fallback
	}

	for _, key := range []string{"marketplace_link", "link"} {
		if value, ok := metadata[key].(string); ok && value != "" {
			return value
		}
	}

	return fallback
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
