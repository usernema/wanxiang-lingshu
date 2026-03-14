package service

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/a2ahub/credit-service/config"
	"github.com/a2ahub/credit-service/models"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type MockAccountRepository struct {
	mock.Mock
}

func (m *MockAccountRepository) Create(ctx context.Context, aid string) error {
	args := m.Called(ctx, aid)
	return args.Error(0)
}

func (m *MockAccountRepository) CreateWithInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error {
	args := m.Called(ctx, aid, initialBalance)
	return args.Error(0)
}

func (m *MockAccountRepository) UpsertInitialBalance(ctx context.Context, aid string, initialBalance decimal.Decimal) error {
	args := m.Called(ctx, aid, initialBalance)
	return args.Error(0)
}

func (m *MockAccountRepository) GetBalance(ctx context.Context, aid string) (*models.Account, error) {
	args := m.Called(ctx, aid)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Account), args.Error(1)
}

func (m *MockAccountRepository) UpdateBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	args := m.Called(ctx, tx, aid, amount)
	return args.Error(0)
}

func (m *MockAccountRepository) FreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	args := m.Called(ctx, tx, aid, amount)
	return args.Error(0)
}

func (m *MockAccountRepository) UnfreezeBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	args := m.Called(ctx, tx, aid, amount)
	return args.Error(0)
}

func (m *MockAccountRepository) ReleaseFrozenBalance(ctx context.Context, tx *sql.Tx, aid string, amount decimal.Decimal) error {
	args := m.Called(ctx, tx, aid, amount)
	return args.Error(0)
}

type MockTransactionRepository struct {
	mock.Mock
}

func (m *MockTransactionRepository) Create(ctx context.Context, tx *sql.Tx, transaction *models.Transaction) error {
	args := m.Called(ctx, tx, transaction)
	return args.Error(0)
}

func (m *MockTransactionRepository) UpdateStatus(ctx context.Context, tx *sql.Tx, transactionID string, status string) error {
	args := m.Called(ctx, tx, transactionID, status)
	return args.Error(0)
}

func (m *MockTransactionRepository) GetByID(ctx context.Context, transactionID string) (*models.Transaction, error) {
	args := m.Called(ctx, transactionID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Transaction), args.Error(1)
}

func (m *MockTransactionRepository) List(ctx context.Context, aid string, limit, offset int) ([]*models.Transaction, error) {
	args := m.Called(ctx, aid, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Transaction), args.Error(1)
}

func (m *MockTransactionRepository) GetDailyTotal(ctx context.Context, aid string) (decimal.Decimal, error) {
	args := m.Called(ctx, aid)
	return args.Get(0).(decimal.Decimal), args.Error(1)
}

type MockLockService struct {
	mock.Mock
}

func (m *MockLockService) Lock(ctx context.Context, key string, ttl time.Duration) error {
	args := m.Called(ctx, key, ttl)
	return args.Error(0)
}

func (m *MockLockService) Unlock(ctx context.Context, key string) error {
	args := m.Called(ctx, key)
	return args.Error(0)
}

type MockRiskService struct {
	mock.Mock
}

func (m *MockRiskService) CheckTransaction(ctx context.Context, aid string, amount decimal.Decimal) error {
	args := m.Called(ctx, aid, amount)
	return args.Error(0)
}

type MockNotificationRepository struct {
	mock.Mock
}

func (m *MockNotificationRepository) Upsert(ctx context.Context, notification *models.Notification) error {
	args := m.Called(ctx, notification)
	return args.Error(0)
}

type MockNotificationPublisher struct {
	mock.Mock
}

func (m *MockNotificationPublisher) SendTransactionNotification(transaction *models.Transaction) {
	m.Called(transaction)
}

func (m *MockNotificationPublisher) SendEscrowNotification(escrow *models.Escrow, action string) {
	m.Called(escrow, action)
}

func TestValidateTransfer(t *testing.T) {
	cfg := &config.Config{
		Credit: config.CreditConfig{
			MinTransaction: 1.0,
			MaxTransaction: 1000000.0,
			DailyLimit:     10000.0,
		},
	}

	mockAccountRepo := new(MockAccountRepository)
	mockTransactionRepo := new(MockTransactionRepository)

	service := &CreditService{
		cfg:             cfg,
		accountRepo:     mockAccountRepo,
		transactionRepo: mockTransactionRepo,
	}

	ctx := context.Background()

	t.Run("Self transfer should fail", func(t *testing.T) {
		err := service.validateTransfer(ctx, "agent1", "agent1", decimal.NewFromInt(100))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot transfer to self")
	})

	t.Run("Amount below minimum should fail", func(t *testing.T) {
		err := service.validateTransfer(ctx, "agent1", "agent2", decimal.NewFromFloat(0.5))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "below minimum")
	})

	t.Run("Amount above maximum should fail", func(t *testing.T) {
		err := service.validateTransfer(ctx, "agent1", "agent2", decimal.NewFromInt(2000000))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "exceeds maximum")
	})

	t.Run("Insufficient balance should fail", func(t *testing.T) {
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent1", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent2", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("GetBalance", ctx, "agent1").Return(&models.Account{
			AID:     "agent1",
			Balance: decimal.NewFromInt(50),
		}, nil)
		mockTransactionRepo.On("GetDailyTotal", ctx, "agent1").Return(decimal.Zero, nil)

		err := service.validateTransfer(ctx, "agent1", "agent2", decimal.NewFromInt(100))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "insufficient balance")
	})

	t.Run("Daily limit exceeded should fail", func(t *testing.T) {
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent3", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent2", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("GetBalance", ctx, "agent3").Return(&models.Account{
			AID:     "agent3",
			Balance: decimal.NewFromInt(20000),
		}, nil)
		mockTransactionRepo.On("GetDailyTotal", ctx, "agent3").Return(decimal.NewFromInt(9900), nil)

		err := service.validateTransfer(ctx, "agent3", "agent2", decimal.NewFromInt(200))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "daily limit exceeded")
	})

	t.Run("Valid transfer should pass", func(t *testing.T) {
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent4", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("CreateWithInitialBalance", ctx, "agent2", decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil).Once()
		mockAccountRepo.On("GetBalance", ctx, "agent4").Return(&models.Account{
			AID:     "agent4",
			Balance: decimal.NewFromInt(1000),
		}, nil)
		mockTransactionRepo.On("GetDailyTotal", ctx, "agent4").Return(decimal.NewFromInt(500), nil)

		err := service.validateTransfer(ctx, "agent4", "agent2", decimal.NewFromInt(100))
		assert.NoError(t, err)
	})
}

func TestCreateAccount(t *testing.T) {
	mockAccountRepo := new(MockAccountRepository)
	cfg := &config.Config{
		Credit: config.CreditConfig{
			DefaultCredits: 100.0,
		},
	}
	service := &CreditService{
		cfg:         cfg,
		accountRepo: mockAccountRepo,
	}

	ctx := context.Background()
	aid := "agent1"

	mockAccountRepo.On("CreateWithInitialBalance", ctx, aid, decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil)

	err := service.CreateAccount(ctx, aid)
	assert.NoError(t, err)
	mockAccountRepo.AssertExpectations(t)
}

func TestCreateAccountUsesReservedInitialBalance(t *testing.T) {
	mockAccountRepo := new(MockAccountRepository)
	cfg := &config.Config{
		Credit: config.CreditConfig{
			DefaultCredits: 100.0,
		},
	}
	service := &CreditService{
		cfg:         cfg,
		accountRepo: mockAccountRepo,
	}

	ctx := context.Background()
	aid := "agent://a2ahub/platform-treasury"

	mockAccountRepo.On("CreateWithInitialBalance", ctx, aid, decimal.Zero).Return(nil)

	err := service.CreateAccount(ctx, aid)
	assert.NoError(t, err)
	mockAccountRepo.AssertExpectations(t)
}

func TestGetBalance(t *testing.T) {
	mockAccountRepo := new(MockAccountRepository)
	cfg := &config.Config{
		Credit: config.CreditConfig{
			DefaultCredits: 100.0,
		},
	}
	service := &CreditService{
		cfg:         cfg,
		accountRepo: mockAccountRepo,
	}

	ctx := context.Background()
	aid := "agent1"

	expectedAccount := &models.Account{
		AID:           aid,
		Balance:       decimal.NewFromInt(1000),
		FrozenBalance: decimal.NewFromInt(100),
		TotalEarned:   decimal.NewFromInt(5000),
		TotalSpent:    decimal.NewFromInt(4000),
	}

	mockAccountRepo.On("CreateWithInitialBalance", ctx, aid, decimal.NewFromFloat(cfg.Credit.DefaultCredits)).Return(nil)
	mockAccountRepo.On("GetBalance", ctx, aid).Return(expectedAccount, nil)

	account, err := service.GetBalance(ctx, aid)
	assert.NoError(t, err)
	assert.Equal(t, expectedAccount, account)
	mockAccountRepo.AssertExpectations(t)
}

func TestGetBalanceUsesReservedInitialBalance(t *testing.T) {
	mockAccountRepo := new(MockAccountRepository)
	cfg := &config.Config{
		Credit: config.CreditConfig{
			DefaultCredits: 100.0,
		},
	}
	service := &CreditService{
		cfg:         cfg,
		accountRepo: mockAccountRepo,
	}

	ctx := context.Background()
	aid := "agent://a2ahub/platform-treasury"

	expectedAccount := &models.Account{
		AID:           aid,
		Balance:       decimal.Zero,
		FrozenBalance: decimal.Zero,
		TotalEarned:   decimal.Zero,
		TotalSpent:    decimal.Zero,
	}

	mockAccountRepo.On("CreateWithInitialBalance", ctx, aid, decimal.Zero).Return(nil)
	mockAccountRepo.On("GetBalance", ctx, aid).Return(expectedAccount, nil)

	account, err := service.GetBalance(ctx, aid)
	assert.NoError(t, err)
	assert.Equal(t, expectedAccount, account)
	mockAccountRepo.AssertExpectations(t)
}

func TestEmitTransactionNotificationsPersistsSenderAndReceiver(t *testing.T) {
	mockNotificationRepo := new(MockNotificationRepository)
	mockNotificationPublisher := new(MockNotificationPublisher)
	service := &CreditService{
		notificationRepo:  mockNotificationRepo,
		notificationQueue: mockNotificationPublisher,
	}

	transaction := &models.Transaction{
		TransactionID: "tx_123",
		Type:          models.TransactionTypeCreditTransfer,
		FromAID:       "agent://a2ahub/employer-1",
		ToAID:         "agent://a2ahub/worker-1",
		Amount:        decimal.NewFromInt(8),
		Status:        models.TransactionStatusCompleted,
		UpdatedAt:     time.Now(),
	}

	mockNotificationPublisher.On("SendTransactionNotification", transaction).Once()
	mockNotificationRepo.On("Upsert", mock.Anything, mock.MatchedBy(func(notification *models.Notification) bool {
		return notification.NotificationID == "notif_tx_123_sender" &&
			notification.RecipientAID == transaction.FromAID &&
			notification.Type == "credit_out"
	})).Return(nil).Once()
	mockNotificationRepo.On("Upsert", mock.Anything, mock.MatchedBy(func(notification *models.Notification) bool {
		return notification.NotificationID == "notif_tx_123_receiver" &&
			notification.RecipientAID == transaction.ToAID &&
			notification.Type == "credit_in"
	})).Return(nil).Once()

	service.emitTransactionNotifications(context.Background(), transaction)

	mockNotificationPublisher.AssertExpectations(t)
	mockNotificationRepo.AssertExpectations(t)
}

func TestEmitEscrowNotificationsSkipsReservedPayeeOnRefund(t *testing.T) {
	mockNotificationRepo := new(MockNotificationRepository)
	mockNotificationPublisher := new(MockNotificationPublisher)
	service := &CreditService{
		notificationRepo:  mockNotificationRepo,
		notificationQueue: mockNotificationPublisher,
	}

	escrow := &models.Escrow{
		EscrowID: "escrow_123",
		PayerAID: "agent://a2ahub/employer-1",
		PayeeAID: "agent://a2ahub/platform-treasury",
		Amount:   decimal.NewFromInt(12),
		UpdatedAt: time.Now(),
	}

	mockNotificationPublisher.On("SendEscrowNotification", escrow, "refunded").Once()
	mockNotificationRepo.On("Upsert", mock.Anything, mock.MatchedBy(func(notification *models.Notification) bool {
		return notification.NotificationID == "notif_escrow_123_refunded_payer" &&
			notification.RecipientAID == escrow.PayerAID &&
			notification.Type == "escrow_refunded"
	})).Return(nil).Once()

	service.emitEscrowNotifications(context.Background(), escrow, "refunded")

	mockNotificationPublisher.AssertExpectations(t)
	mockNotificationRepo.AssertExpectations(t)
}
