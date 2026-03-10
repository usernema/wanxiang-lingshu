package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/a2ahub/credit-service/models"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func (s *CreditService) CreateEscrow(ctx context.Context, payerAID, payeeAID string, amount decimal.Decimal, releaseCondition string, timeoutHours int) (*models.Escrow, error) {
	if err := s.ensureAccountsBeforeCreateEscrow(ctx, payerAID, payeeAID); err != nil {
		return nil, err
	}
	if err := s.validateTransfer(ctx, payerAID, payeeAID, amount); err != nil {
		return nil, err
	}

	lockKey := fmt.Sprintf("escrow:%s", payerAID)
	if err := s.lockService.Lock(ctx, lockKey, 10*time.Second); err != nil {
		return nil, fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.lockService.Unlock(ctx, lockKey)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	escrow := &models.Escrow{
		EscrowID:         fmt.Sprintf("escrow_%s", uuid.New().String()),
		PayerAID:         payerAID,
		PayeeAID:         payeeAID,
		Amount:           amount,
		Status:           models.EscrowStatusLocked,
		ReleaseCondition: releaseCondition,
		Timeout:          time.Now().Add(time.Duration(timeoutHours) * time.Hour),
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if err := s.escrowRepo.Create(ctx, tx, escrow); err != nil {
		return nil, err
	}

	if err := s.accountRepo.FreezeBalance(ctx, tx, payerAID, amount); err != nil {
		return nil, fmt.Errorf("failed to freeze balance: %w", err)
	}

	metadataJSON, _ := json.Marshal(map[string]interface{}{
		"escrow_id":         escrow.EscrowID,
		"release_condition": releaseCondition,
	})
	transaction := &models.Transaction{
		TransactionID: fmt.Sprintf("tx_%s", uuid.New().String()),
		Type:          models.TransactionTypeEscrow,
		FromAID:       payerAID,
		ToAID:         payeeAID,
		Amount:        amount,
		Fee:           decimal.Zero,
		Status:        models.TransactionStatusCompleted,
		Metadata:      string(metadataJSON),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.transactionRepo.Create(ctx, tx, transaction); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	s.notificationQueue.SendEscrowNotification(escrow, "created")

	return escrow, nil
}

func (s *CreditService) ReleaseEscrow(ctx context.Context, escrowID, actorAID string) error {
	escrow, err := s.escrowRepo.GetByID(ctx, escrowID)
	if err != nil {
		return err
	}
	if escrow != nil {
		if ensureErr := s.ensureAccountsBeforeReleaseEscrow(ctx, escrow.PayerAID, escrow.PayeeAID); ensureErr != nil {
			return ensureErr
		}
	}
	if escrow == nil {
		return fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusLocked {
		return fmt.Errorf("escrow is not locked")
	}

	if actorAID != escrow.PayerAID && actorAID != escrow.PayeeAID {
		return fmt.Errorf("unauthorized")
	}

	lockKey := fmt.Sprintf("escrow:%s", escrowID)
	if err := s.lockService.Lock(ctx, lockKey, 10*time.Second); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.lockService.Unlock(ctx, lockKey)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := s.accountRepo.ReleaseFrozenBalance(ctx, tx, escrow.PayerAID, escrow.Amount); err != nil {
		return fmt.Errorf("failed to release frozen balance: %w", err)
	}

	if err := s.accountRepo.UpdateBalance(ctx, tx, escrow.PayeeAID, escrow.Amount); err != nil {
		return fmt.Errorf("failed to credit payee: %w", err)
	}

	if err := s.escrowRepo.UpdateStatus(ctx, tx, escrowID, models.EscrowStatusReleased); err != nil {
		return err
	}

	metadataJSON, _ := json.Marshal(map[string]interface{}{
		"escrow_id": escrowID,
	})
	transaction := &models.Transaction{
		TransactionID: fmt.Sprintf("tx_%s", uuid.New().String()),
		Type:          models.TransactionTypeEscrowRelease,
		FromAID:       escrow.PayerAID,
		ToAID:         escrow.PayeeAID,
		Amount:        escrow.Amount,
		Fee:           decimal.Zero,
		Status:        models.TransactionStatusCompleted,
		Metadata:      string(metadataJSON),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.transactionRepo.Create(ctx, tx, transaction); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	escrow.Status = models.EscrowStatusReleased
	s.notificationQueue.SendEscrowNotification(escrow, "released")

	return nil
}

func (s *CreditService) RefundEscrow(ctx context.Context, escrowID, actorAID string) error {
	escrow, err := s.escrowRepo.GetByID(ctx, escrowID)
	if err != nil {
		return err
	}
	if escrow != nil {
		if ensureErr := s.ensureAccountsBeforeRefundEscrow(ctx, escrow.PayerAID); ensureErr != nil {
			return ensureErr
		}
	}
	if escrow == nil {
		return fmt.Errorf("escrow not found")
	}

	if escrow.Status != models.EscrowStatusLocked {
		return fmt.Errorf("escrow is not locked")
	}

	if actorAID != escrow.PayerAID {
		return fmt.Errorf("only payer can refund")
	}

	lockKey := fmt.Sprintf("escrow:%s", escrowID)
	if err := s.lockService.Lock(ctx, lockKey, 10*time.Second); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer s.lockService.Unlock(ctx, lockKey)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := s.accountRepo.UnfreezeBalance(ctx, tx, escrow.PayerAID, escrow.Amount); err != nil {
		return fmt.Errorf("failed to unfreeze balance: %w", err)
	}

	if err := s.escrowRepo.UpdateStatus(ctx, tx, escrowID, models.EscrowStatusRefunded); err != nil {
		return err
	}

	metadataJSON, _ := json.Marshal(map[string]interface{}{
		"escrow_id": escrowID,
	})
	transaction := &models.Transaction{
		TransactionID: fmt.Sprintf("tx_%s", uuid.New().String()),
		Type:          models.TransactionTypeEscrowRefund,
		FromAID:       escrow.PayerAID,
		ToAID:         escrow.PayerAID,
		Amount:        escrow.Amount,
		Fee:           decimal.Zero,
		Status:        models.TransactionStatusCompleted,
		Metadata:      string(metadataJSON),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.transactionRepo.Create(ctx, tx, transaction); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	escrow.Status = models.EscrowStatusRefunded
	s.notificationQueue.SendEscrowNotification(escrow, "refunded")

	return nil
}

func (s *CreditService) GetTransactions(ctx context.Context, aid string, limit, offset int) ([]*models.Transaction, error) {
	return s.transactionRepo.List(ctx, aid, limit, offset)
}
