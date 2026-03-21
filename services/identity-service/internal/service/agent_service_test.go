package service

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
	"github.com/a2ahub/identity-service/internal/utils"
	redismock "github.com/go-redis/redismock/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// MockAgentRepository 模拟 Agent 仓库
type MockAgentRepository struct {
	mock.Mock
}

type MockNotificationRepository struct {
	mock.Mock
}

func (m *MockNotificationRepository) Upsert(ctx context.Context, notification *models.Notification) error {
	args := m.Called(ctx, notification)
	return args.Error(0)
}

func (m *MockAgentRepository) Create(ctx context.Context, agent *models.Agent) error {
	args := m.Called(ctx, agent)
	return args.Error(0)
}

func (m *MockAgentRepository) GetByAID(ctx context.Context, aid string) (*models.Agent, error) {
	args := m.Called(ctx, aid)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Agent), args.Error(1)
}

func (m *MockAgentRepository) GetByBindingKeyHash(ctx context.Context, bindingKeyHash string) (*models.Agent, error) {
	args := m.Called(ctx, bindingKeyHash)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Agent), args.Error(1)
}

func (m *MockAgentRepository) GetByOwnerEmail(ctx context.Context, email string) (*models.Agent, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Agent), args.Error(1)
}

func (m *MockAgentRepository) List(ctx context.Context, limit, offset int, status string) ([]*models.Agent, int, error) {
	args := m.Called(ctx, limit, offset, status)
	if args.Get(0) == nil {
		return nil, args.Int(1), args.Error(2)
	}
	return args.Get(0).([]*models.Agent), args.Int(1), args.Error(2)
}

func (m *MockAgentRepository) Update(ctx context.Context, agent *models.Agent) error {
	args := m.Called(ctx, agent)
	return args.Error(0)
}

func (m *MockAgentRepository) BindEmail(ctx context.Context, aid, email string, verifiedAt time.Time) (*models.Agent, error) {
	args := m.Called(ctx, aid, email, verifiedAt)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Agent), args.Error(1)
}

func (m *MockAgentRepository) UpdateProfile(ctx context.Context, aid string, headline, bio, availabilityStatus string, capabilities models.Capabilities) (*models.Agent, error) {
	args := m.Called(ctx, aid, headline, bio, availabilityStatus, capabilities)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Agent), args.Error(1)
}

func (m *MockAgentRepository) UpdateReputation(ctx context.Context, aid string, change int, reason string) error {
	args := m.Called(ctx, aid, change, reason)
	return args.Error(0)
}

func (m *MockAgentRepository) GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error) {
	args := m.Called(ctx, aid, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.ReputationHistory), args.Error(1)
}

func (m *MockAgentRepository) CheckExists(ctx context.Context, aid string) (bool, error) {
	args := m.Called(ctx, aid)
	return args.Bool(0), args.Error(1)
}

func TestEnsureDevBootstrap(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret", Expiration: time.Hour},
		Dev: config.DevConfig{BootstrapEnabled: true},
	}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	for _, role := range []string{"default", "employer", "worker"} {
		profile := devBootstrapProfiles[role]
		mockRepo.On("GetByAID", mock.Anything, profile.AID).Return(nil, fmt.Errorf("agent not found")).Once()
		mockRepo.On("Create", mock.Anything, mock.MatchedBy(func(agent *models.Agent) bool {
			return agent.AID == profile.AID && agent.Status == "active"
		})).Return(nil).Once()
	}

	resp, err := svc.EnsureDevBootstrap(context.Background())
	require.NoError(t, err)
	require.Len(t, resp.Sessions, 3)
	assert.Equal(t, "default", resp.Sessions[0].Role)
	assert.NotEmpty(t, resp.Sessions[0].Token)
	assert.Equal(t, devBootstrapProfiles["employer"].AID, resp.Sessions[1].Aid)
	assert.Equal(t, devBootstrapProfiles["worker"].AID, resp.Sessions[2].Aid)
	mockRepo.AssertExpectations(t)
}

func TestGetDevSessionDisabled(t *testing.T) {
	svc := &agentService{config: &config.Config{Dev: config.DevConfig{BootstrapEnabled: false}}}
	_, err := svc.GetDevSession(context.Background(), "employer")
	require.Error(t, err)
	assert.Equal(t, "dev bootstrap is disabled", err.Error())
}

func TestLoginAcceptsDevBootstrapSignature(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret", Expiration: time.Hour},
		Dev: config.DevConfig{BootstrapEnabled: true},
	}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	profile := devBootstrapProfiles["employer"]
	seededAgent := &models.Agent{
		AID:          profile.AID,
		Model:        profile.Model,
		Provider:     profile.Provider,
		PublicKey:    profile.PublicKey,
		Capabilities: profile.Capabilities,
		Reputation:   profile.Reputation,
		Status:       "active",
	}

	mockRepo.On("GetByAID", mock.Anything, profile.AID).Return(nil, fmt.Errorf("agent not found")).Once()
	mockRepo.On("Create", mock.Anything, mock.MatchedBy(func(agent *models.Agent) bool {
		return agent.AID == profile.AID
	})).Return(nil).Once()
	mockRepo.On("GetByAID", mock.Anything, profile.AID).Return(seededAgent, nil).Once()
	mockRepo.On("GetByAID", mock.Anything, profile.AID).Return(seededAgent, nil)

	resp, err := svc.Login(context.Background(), &LoginRequest{
		AID:       profile.AID,
		Signature: "dev-bootstrap",
		Timestamp: time.Now().Unix(),
		Nonce:     "nonce-dev-bootstrap",
	})
	require.NoError(t, err)
	assert.NotEmpty(t, resp.Token)
	assert.True(t, resp.ExpiresAt.After(time.Now()))
	mockRepo.AssertExpectations(t)
}

// TestRegister 测试注册功能
func TestRegister(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{
		Reputation: config.ReputationConfig{
			InitialReputation: 80,
		},
		Credit: config.CreditConfig{
			InitialCredits: 120,
		},
	}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	// 生成测试密钥对
	publicKey, _, err := utils.GenerateKeyPair()
	assert.NoError(t, err)

	publicKeyPEM, err := utils.PublicKeyToPEM(publicKey)
	assert.NoError(t, err)

	req := &RegisterRequest{
		Model:        "claude-opus-4-6",
		Provider:     "anthropic",
		Capabilities: []string{"code", "analysis"},
		PublicKey:    publicKeyPEM,
	}

	mockRepo.On("Create", mock.Anything, mock.AnythingOfType("*models.Agent")).Return(nil)

	resp, err := svc.Register(context.Background(), req)

	assert.NoError(t, err)
	assert.NotEmpty(t, resp.AID)
	assert.NotEmpty(t, resp.BindingKey)
	assert.Equal(t, 120, resp.InitialCredits)
	assert.Equal(t, 80, resp.Agent.Reputation)
	assert.True(t, utils.ValidateAID(resp.AID))

	mockRepo.AssertExpectations(t)
}

func TestRegisterAllowsEmailOnlyAgents(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{
		Reputation: config.ReputationConfig{
			InitialReputation: 100,
		},
		Credit: config.CreditConfig{
			InitialCredits: 100,
		},
	}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	req := &RegisterRequest{
		Model:        "openclaw-agent",
		Provider:     "openclaw",
		Capabilities: []string{"planning", "forum"},
	}

	mockRepo.On("Create", mock.Anything, mock.MatchedBy(func(agent *models.Agent) bool {
		return agent.PublicKey == "" && agent.BindingKeyHash != ""
	})).Return(nil).Once()

	resp, err := svc.Register(context.Background(), req)

	assert.NoError(t, err)
	assert.NotEmpty(t, resp.AID)
	assert.NotEmpty(t, resp.BindingKey)
	mockRepo.AssertExpectations(t)
}

func TestRequestEmailRegistrationCode(t *testing.T) {
	redisClient, redisMock := redismock.NewClientMock()
	mockRepo := new(MockAgentRepository)
	agent := &models.Agent{
		AID:    "agent://a2ahub/openclaw-1",
		Status: "active",
	}

	cfg := &config.Config{
		Server: config.ServerConfig{Env: "development"},
		Email: config.EmailConfig{
			CodeExpiration:       600,
			AllowInlineCodeInDev: true,
		},
	}

	svc := &agentService{
		repo:   mockRepo,
		redis:  &database.RedisClient{Client: redisClient},
		config: cfg,
	}

	bindingKey := "bind_test_registration_key"
	email := "owner@example.com"
	redisKey := emailCodeKey(emailCodePurposeRegister, agent.AID, email)

	mockRepo.On("GetByBindingKeyHash", mock.Anything, hashBindingKey(bindingKey)).Return(agent, nil).Once()
	mockRepo.On("GetByOwnerEmail", mock.Anything, email).Return(nil, fmt.Errorf("agent not found")).Once()
	redisMock.Regexp().ExpectSet(redisKey, `^\d{6}$`, 600*time.Second).SetVal("OK")

	resp, err := svc.RequestEmailRegistrationCode(context.Background(), &EmailRegistrationCodeRequest{
		Email:      email,
		BindingKey: bindingKey,
	})

	require.NoError(t, err)
	assert.Equal(t, email, resp.Email)
	assert.Equal(t, agent.AID, resp.AID)
	assert.Equal(t, "inline", resp.Delivery)
	assert.Len(t, resp.VerificationCode, 6)
	require.NoError(t, redisMock.ExpectationsWereMet())
	mockRepo.AssertExpectations(t)
}

func TestCompleteEmailRegistration(t *testing.T) {
	redisClient, redisMock := redismock.NewClientMock()
	mockRepo := new(MockAgentRepository)
	agent := &models.Agent{
		AID:        "agent://a2ahub/openclaw-2",
		Model:      "openclaw",
		Provider:   "openclaw",
		Status:     "active",
		Reputation: 100,
	}
	boundAgent := &models.Agent{
		AID:        agent.AID,
		Model:      agent.Model,
		Provider:   agent.Provider,
		Status:     "active",
		Reputation: 100,
		OwnerEmail: "owner@example.com",
	}
	updatedAgent := &models.Agent{
		AID:                agent.AID,
		Model:              agent.Model,
		Provider:           agent.Provider,
		Status:             "active",
		Reputation:         100,
		OwnerEmail:         "owner@example.com",
		Headline:           "OpenClaw 自动流转代理",
		Bio:                "由 openclaw/openclaw 驱动，已接入 A2Ahub。默认按 mission 自动完成训练场诊断、真实流转与经验沉淀。",
		AvailabilityStatus: "available",
		Capabilities:       models.Capabilities{"automation", "planning", "execution"},
	}
	growthRepo := &fakeGrowthRepository{
		profile: &models.AgentGrowthProfile{
			AID:                agent.AID,
			Model:              agent.Model,
			Provider:           agent.Provider,
			Status:             "active",
			Reputation:         100,
			OwnerEmail:         "owner@example.com",
			AvailabilityStatus: "available",
			CreatedAt:          time.Now().Add(-time.Hour),
			UpdatedAt:          time.Now().Add(-time.Hour),
			LastEvaluatedAt:    time.Now().Add(-time.Hour),
		},
		stats: &models.AgentGrowthStats{},
	}

	cfg := &config.Config{
		JWT: config.JWTConfig{
			Secret:     "test-secret",
			Expiration: time.Hour,
		},
		Reputation: config.ReputationConfig{
			MinReputationThreshold: 0,
		},
	}

	svc := &agentService{
		repo:       mockRepo,
		growthRepo: growthRepo,
		redis:      &database.RedisClient{Client: redisClient},
		config:     cfg,
	}

	bindingKey := "bind_test_complete_key"
	email := "owner@example.com"
	code := "123456"
	redisKey := emailCodeKey(emailCodePurposeRegister, agent.AID, email)

	mockRepo.On("GetByBindingKeyHash", mock.Anything, hashBindingKey(bindingKey)).Return(agent, nil).Once()
	mockRepo.On("GetByOwnerEmail", mock.Anything, email).Return(nil, fmt.Errorf("agent not found")).Once()
	mockRepo.On("BindEmail", mock.Anything, agent.AID, email, mock.AnythingOfType("time.Time")).Return(boundAgent, nil).Once()
	mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(boundAgent, nil).Once()
	mockRepo.On(
		"UpdateProfile",
		mock.Anything,
		agent.AID,
		"OpenClaw 自动流转代理",
		"由 openclaw/openclaw 驱动，已接入 A2Ahub。默认按 mission 自动完成训练场诊断、真实流转与经验沉淀。",
		"available",
		models.Capabilities{"automation", "planning", "execution"},
	).Return(updatedAgent, nil).Once()
	mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(updatedAgent, nil)
	redisMock.ExpectGet(redisKey).SetVal(code)
	redisMock.ExpectDel(redisKey).SetVal(1)

	resp, err := svc.CompleteEmailRegistration(context.Background(), &CompleteEmailRegistrationRequest{
		Email:      email,
		BindingKey: bindingKey,
		Code:       code,
	})

	require.NoError(t, err)
	assert.NotEmpty(t, resp.Token)
	assert.Equal(t, boundAgent.AID, resp.Agent.AID)
	assert.Equal(t, "OpenClaw 自动流转代理", resp.Agent.Headline)
	require.NotNil(t, resp.Mission)
	assert.Equal(t, "start_market_loop", resp.Mission.NextAction.Key)
	assert.Nil(t, findMissionStep(resp.Mission.Steps, "complete_profile"))
	assert.Equal(t, 2, growthRepo.upsertCount)
	require.NoError(t, redisMock.ExpectationsWereMet())
	mockRepo.AssertExpectations(t)
}

func TestRequestEmailLoginCode(t *testing.T) {
	redisClient, redisMock := redismock.NewClientMock()
	mockRepo := new(MockAgentRepository)
	agent := &models.Agent{
		AID:        "agent://a2ahub/openclaw-3",
		Status:     "active",
		Reputation: 100,
		OwnerEmail: "owner@example.com",
	}

	cfg := &config.Config{
		Server: config.ServerConfig{Env: "development"},
		Email: config.EmailConfig{
			CodeExpiration:       600,
			AllowInlineCodeInDev: true,
		},
	}

	svc := &agentService{
		repo:   mockRepo,
		redis:  &database.RedisClient{Client: redisClient},
		config: cfg,
	}

	email := "owner@example.com"
	redisKey := emailCodeKey(emailCodePurposeLogin, agent.AID, email)

	mockRepo.On("GetByOwnerEmail", mock.Anything, email).Return(agent, nil).Once()
	redisMock.Regexp().ExpectSet(redisKey, `^\d{6}$`, 600*time.Second).SetVal("OK")

	resp, err := svc.RequestEmailLoginCode(context.Background(), &EmailLoginCodeRequest{
		Email: email,
	})

	require.NoError(t, err)
	assert.Equal(t, email, resp.Email)
	assert.Equal(t, agent.AID, resp.AID)
	assert.Equal(t, "inline", resp.Delivery)
	assert.Len(t, resp.VerificationCode, 6)
	require.NoError(t, redisMock.ExpectationsWereMet())
	mockRepo.AssertExpectations(t)
}

func TestCompleteEmailLogin(t *testing.T) {
	redisClient, redisMock := redismock.NewClientMock()
	mockRepo := new(MockAgentRepository)
	agent := &models.Agent{
		AID:        "agent://a2ahub/openclaw-4",
		Status:     "active",
		Reputation: 100,
		OwnerEmail: "owner@example.com",
	}

	cfg := &config.Config{
		JWT: config.JWTConfig{
			Secret:     "test-secret",
			Expiration: time.Hour,
		},
		Reputation: config.ReputationConfig{
			MinReputationThreshold: 0,
		},
	}

	svc := &agentService{
		repo:   mockRepo,
		redis:  &database.RedisClient{Client: redisClient},
		config: cfg,
	}

	email := "owner@example.com"
	code := "654321"
	redisKey := emailCodeKey(emailCodePurposeLogin, agent.AID, email)

	mockRepo.On("GetByOwnerEmail", mock.Anything, email).Return(agent, nil).Once()
	mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(agent, nil)
	redisMock.ExpectGet(redisKey).SetVal(code)
	redisMock.ExpectDel(redisKey).SetVal(1)

	resp, err := svc.CompleteEmailLogin(context.Background(), &CompleteEmailLoginRequest{
		Email: email,
		Code:  code,
	})

	require.NoError(t, err)
	assert.NotEmpty(t, resp.Token)
	assert.Equal(t, agent.AID, resp.Agent.AID)
	require.NoError(t, redisMock.ExpectationsWereMet())
	mockRepo.AssertExpectations(t)
}

// TestUpdateReputation 测试更新信誉分
func TestUpdateReputation(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	aid := "agent://a2ahub/test-agent"
	change := 10
	reason := "good contribution"

	mockRepo.On("UpdateReputation", mock.Anything, aid, change, reason).Return(nil)

	err := svc.UpdateReputation(context.Background(), aid, change, reason)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
}

// TestGetAgent 测试获取 Agent
func TestGetAgent(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	aid := "agent://a2ahub/test-agent"
	expectedAgent := &models.Agent{
		AID:        aid,
		Model:      "claude-opus-4-6",
		Provider:   "anthropic",
		Reputation: 100,
		Status:     "active",
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	mockRepo.On("GetByAID", mock.Anything, aid).Return(expectedAgent, nil)

	agent, err := svc.GetAgent(context.Background(), aid)

	assert.NoError(t, err)
	assert.Equal(t, expectedAgent.AID, agent.AID)
	assert.Equal(t, expectedAgent.Model, agent.Model)

	mockRepo.AssertExpectations(t)
}

func TestListAgentsReturnsTotalCount(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
	}

	items := []*models.Agent{
		{
			AID:        "agent://a2ahub/test-agent",
			Model:      "gpt-5",
			Provider:   "openai",
			Reputation: 120,
			Status:     "active",
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		},
	}

	mockRepo.On("List", mock.Anything, 1, 0, "").Return(items, 42, nil).Once()

	gotItems, total, err := svc.ListAgents(context.Background(), 1, 0, "")

	require.NoError(t, err)
	require.Len(t, gotItems, 1)
	assert.Equal(t, 42, total)
	assert.Equal(t, "agent://a2ahub/test-agent", gotItems[0].AID)
	mockRepo.AssertExpectations(t)
}

func TestUpdateAgentStatus(t *testing.T) {
	redisClient, redisMock := redismock.NewClientMock()
	mockRepo := new(MockAgentRepository)
	mockNotificationRepo := new(MockNotificationRepository)
	cfg := &config.Config{
		JWT: config.JWTConfig{Expiration: time.Hour},
	}

	svc := &agentService{
		repo:             mockRepo,
		notificationRepo: mockNotificationRepo,
		redis:            &database.RedisClient{Client: redisClient},
		config:           cfg,
	}

	aid := "agent://a2ahub/test-agent"
	existingAgent := &models.Agent{
		AID:        aid,
		Model:      "gpt-5",
		Provider:   "openai",
		Reputation: 100,
		Status:     "active",
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	updatedAgent := *existingAgent
	updatedAgent.Status = "suspended"

	mockRepo.On("GetByAID", mock.Anything, aid).Return(existingAgent, nil).Once()
	mockRepo.On("Update", mock.Anything, mock.MatchedBy(func(agent *models.Agent) bool {
		return agent.AID == aid && agent.Status == "suspended"
	})).Return(nil).Once()
	mockRepo.On("GetByAID", mock.Anything, aid).Return(&updatedAgent, nil).Once()
	mockNotificationRepo.On("Upsert", mock.Anything, mock.MatchedBy(func(notification *models.Notification) bool {
		return notification.RecipientAID == aid &&
			notification.Type == "agent_status_changed" &&
			notification.Title == "账号已被暂停" &&
			notification.Link == "/profile"
	})).Return(nil).Once()
	redisMock.ExpectTxPipeline()
	redisMock.Regexp().ExpectSet(agentMinIssuedAtKey(aid), `^\d+$`, time.Hour).SetVal("OK")
	redisMock.ExpectDel(gatewayAgentCacheKey(aid)).SetVal(1)
	redisMock.ExpectTxPipelineExec()

	agent, err := svc.UpdateAgentStatus(context.Background(), aid, "suspended")

	assert.NoError(t, err)
	assert.Equal(t, "suspended", agent.Status)
	require.NoError(t, redisMock.ExpectationsWereMet())
	mockRepo.AssertExpectations(t)
	mockNotificationRepo.AssertExpectations(t)
}

func TestUpdateAgentStatusRejectsProtectedSystemAgent(t *testing.T) {
	svc := &agentService{config: &config.Config{}}

	agent, err := svc.UpdateAgentStatus(context.Background(), "agent://a2ahub/system", "suspended")

	assert.Nil(t, agent)
	assert.EqualError(t, err, "system agent is protected")
}

func TestVerifyAuth(t *testing.T) {
	publicKey, privateKey, err := utils.GenerateKeyPair()
	require.NoError(t, err)

	publicKeyPEM, err := utils.PublicKeyToPEM(publicKey)
	require.NoError(t, err)

	agent := &models.Agent{
		AID:        "agent://a2ahub/test-123",
		PublicKey:  publicKeyPEM,
		Reputation: 100,
		Status:     "active",
	}

	cfg := &config.Config{
		Security:   config.SecurityConfig{NonceExpiration: 300},
		Reputation: config.ReputationConfig{MinReputationThreshold: 0},
	}

	ctx := context.Background()

	t.Run("accepts valid signature and returns agent", func(t *testing.T) {
		redisClient, redisMock := redismock.NewClientMock()
		mockRepo := new(MockAgentRepository)
		mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(agent, nil).Once()

		svc := &agentService{
			repo:   mockRepo,
			redis:  &database.RedisClient{Client: redisClient},
			config: cfg,
		}

		timestamp := time.Now().Unix()
		nonce := "nonce-valid"
		payload := fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, agent.AID, nonce, timestamp)
		signature := ed25519.Sign(privateKey, []byte(payload))

		nonceKey := fmt.Sprintf("nonce:%s:%s", agent.AID, nonce)
		redisMock.ExpectExists(nonceKey).SetVal(0)
		redisMock.ExpectSet(nonceKey, "1", 300*time.Second).SetVal("OK")

		result, err := svc.VerifyAuth(ctx, agent.AID, string(signature), fmt.Sprintf("%d", timestamp), nonce)
		require.NoError(t, err)
		assert.Equal(t, agent.AID, result.AID)
		require.NoError(t, redisMock.ExpectationsWereMet())
		mockRepo.AssertExpectations(t)
	})

	t.Run("rejects expired timestamp", func(t *testing.T) {
		redisClient, _ := redismock.NewClientMock()
		svc := &agentService{
			repo:   new(MockAgentRepository),
			redis:  &database.RedisClient{Client: redisClient},
			config: cfg,
		}

		_, err := svc.VerifyAuth(ctx, agent.AID, "sig", fmt.Sprintf("%d", time.Now().Add(-10*time.Minute).Unix()), "nonce-expired")
		require.Error(t, err)
		assert.Equal(t, "timestamp expired", err.Error())
	})

	t.Run("rejects reused nonce", func(t *testing.T) {
		redisClient, redisMock := redismock.NewClientMock()
		svc := &agentService{
			repo:   new(MockAgentRepository),
			redis:  &database.RedisClient{Client: redisClient},
			config: cfg,
		}

		nonceKey := fmt.Sprintf("nonce:%s:%s", agent.AID, "nonce-reused")
		redisMock.ExpectExists(nonceKey).SetVal(1)

		_, err := svc.VerifyAuth(ctx, agent.AID, "sig", fmt.Sprintf("%d", time.Now().Unix()), "nonce-reused")
		require.Error(t, err)
		assert.Equal(t, "nonce already used", err.Error())
		require.NoError(t, redisMock.ExpectationsWereMet())
	})

	t.Run("rejects invalid signature", func(t *testing.T) {
		redisClient, redisMock := redismock.NewClientMock()
		mockRepo := new(MockAgentRepository)
		mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(agent, nil).Once()

		svc := &agentService{
			repo:   mockRepo,
			redis:  &database.RedisClient{Client: redisClient},
			config: cfg,
		}

		nonce := "nonce-invalid-signature"
		nonceKey := fmt.Sprintf("nonce:%s:%s", agent.AID, nonce)
		redisMock.ExpectExists(nonceKey).SetVal(0)

		_, err := svc.VerifyAuth(ctx, agent.AID, "not-a-real-signature", fmt.Sprintf("%d", time.Now().Unix()), nonce)
		require.Error(t, err)
		assert.Equal(t, "signature verification failed", err.Error())
		require.NoError(t, redisMock.ExpectationsWereMet())
		mockRepo.AssertExpectations(t)
	})
}

func TestVerifyLoginSignature(t *testing.T) {
	publicKey, privateKey, err := utils.GenerateKeyPair()
	require.NoError(t, err)

	publicKeyPEM, err := utils.PublicKeyToPEM(publicKey)
	require.NoError(t, err)

	agent := &models.Agent{
		AID:       "agent://a2ahub/test-123",
		PublicKey: publicKeyPEM,
	}

	svc := &agentService{config: &config.Config{Security: config.SecurityConfig{NonceExpiration: 300}}}

	payloadFor := func(req *LoginRequest) string {
		return fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, req.AID, req.Nonce, req.Timestamp)
	}

	t.Run("accepts raw signature bytes encoded as string", func(t *testing.T) {
		req := &LoginRequest{
			AID:       agent.AID,
			Timestamp: time.Now().Unix(),
			Nonce:     "login-nonce-raw",
		}
		req.Signature = string(ed25519.Sign(privateKey, []byte(payloadFor(req))))
		require.NoError(t, svc.verifyLoginSignature(agent, req))
	})

	t.Run("accepts base64 signature", func(t *testing.T) {
		req := &LoginRequest{
			AID:       agent.AID,
			Timestamp: time.Now().Unix(),
			Nonce:     "login-nonce-b64",
		}
		signature := ed25519.Sign(privateKey, []byte(payloadFor(req)))
		req.Signature = base64.StdEncoding.EncodeToString(signature)
		require.NoError(t, svc.verifyLoginSignature(agent, req))
	})
}
