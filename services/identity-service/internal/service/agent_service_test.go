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
			InitialReputation: 100,
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
	assert.Equal(t, 100, resp.InitialCredits)
	assert.True(t, utils.ValidateAID(resp.AID))

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

func TestUpdateAgentStatus(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	cfg := &config.Config{}

	svc := &agentService{
		repo:   mockRepo,
		config: cfg,
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

	agent, err := svc.UpdateAgentStatus(context.Background(), aid, "suspended")

	assert.NoError(t, err)
	assert.Equal(t, "suspended", agent.Status)
	mockRepo.AssertExpectations(t)
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
