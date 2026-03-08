package service

import (
	"context"
	"testing"
	"time"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/models"
	"github.com/a2ahub/identity-service/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
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

func (m *MockAgentRepository) Update(ctx context.Context, agent *models.Agent) error {
	args := m.Called(ctx, agent)
	return args.Error(0)
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
		AID:          aid,
		Model:        "claude-opus-4-6",
		Provider:     "anthropic",
		Reputation:   100,
		Status:       "active",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	mockRepo.On("GetByAID", mock.Anything, aid).Return(expectedAgent, nil)

	agent, err := svc.GetAgent(context.Background(), aid)

	assert.NoError(t, err)
	assert.Equal(t, expectedAgent.AID, agent.AID)
	assert.Equal(t, expectedAgent.Model, agent.Model)

	mockRepo.AssertExpectations(t)
}
