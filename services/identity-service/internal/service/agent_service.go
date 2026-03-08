package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
	"github.com/a2ahub/identity-service/internal/repository"
	"github.com/a2ahub/identity-service/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"github.com/sirupsen/logrus"
)

// AgentService Agent 服务接口
type AgentService interface {
	Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error)
	Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error)
	GetAgent(ctx context.Context, aid string) (*models.Agent, error)
	UpdateReputation(ctx context.Context, aid string, change int, reason string) error
	GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error)
	VerifyAuth(ctx context.Context, aid, signature, timestamp, nonce string) error
}

// agentService Agent 服务实现
type agentService struct {
	repo   repository.AgentRepository
	redis  *database.RedisClient
	config *config.Config
}

// NewAgentService 创建 Agent 服务
func NewAgentService(repo repository.AgentRepository, redis *database.RedisClient, cfg *config.Config) AgentService {
	return &agentService{
		repo:   repo,
		redis:  redis,
		config: cfg,
	}
}

// RegisterRequest 注册请求
type RegisterRequest struct {
	Model             string                     `json:"model" binding:"required"`
	Provider          string                     `json:"provider" binding:"required"`
	Capabilities      []string                   `json:"capabilities" binding:"required"`
	PublicKey         string                     `json:"public_key" binding:"required"`
	ProofOfCapability *models.ProofOfCapability  `json:"proof_of_capability"`
}

// RegisterResponse 注册响应
type RegisterResponse struct {
	AID            string    `json:"aid"`
	Certificate    string    `json:"certificate"`
	InitialCredits int       `json:"initial_credits"`
	CreatedAt      time.Time `json:"created_at"`
}

// Register 注册 Agent
func (s *agentService) Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error) {
	// 验证公钥格式
	_, err := utils.ParsePublicKeyFromPEM(req.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("invalid public key format: %w", err)
	}

	// 验证能力证明（简化版本，实际应该有更复杂的验证逻辑）
	if req.ProofOfCapability != nil {
		if !s.verifyProofOfCapability(req.ProofOfCapability) {
			return nil, fmt.Errorf("proof of capability verification failed")
		}
	}

	// 生成 AID
	aid := utils.GenerateAID("a2ahub", req.Model)

	// 创建 Agent
	now := time.Now()
	agent := &models.Agent{
		AID:          aid,
		Model:        req.Model,
		Provider:     req.Provider,
		PublicKey:    req.PublicKey,
		Capabilities: req.Capabilities,
		Reputation:   s.config.Reputation.InitialReputation,
		Status:       "active",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.repo.Create(ctx, agent); err != nil {
		return nil, fmt.Errorf("failed to create agent: %w", err)
	}

	// 生成身份证书
	certificate, err := s.generateCertificate(agent)
	if err != nil {
		return nil, fmt.Errorf("failed to generate certificate: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"aid":      aid,
		"model":    req.Model,
		"provider": req.Provider,
	}).Info("Agent registered successfully")

	return &RegisterResponse{
		AID:            aid,
		Certificate:    certificate,
		InitialCredits: s.config.Reputation.InitialReputation,
		CreatedAt:      now,
	}, nil
}

// LoginRequest 登录请求
type LoginRequest struct {
	AID       string `json:"aid" binding:"required"`
	Timestamp int64  `json:"timestamp" binding:"required"`
	Nonce     string `json:"nonce" binding:"required"`
	Signature string `json:"signature" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Login Agent 登录
func (s *agentService) Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
	// 验证 AID 格式
	if !utils.ValidateAID(req.AID) {
		return nil, fmt.Errorf("invalid AID format")
	}

	// 获取 Agent
	agent, err := s.repo.GetByAID(ctx, req.AID)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	// 检查状态
	if agent.Status != "active" {
		return nil, fmt.Errorf("agent is not active")
	}

	// 检查信誉分
	if agent.Reputation < s.config.Reputation.MinReputationThreshold {
		return nil, fmt.Errorf("reputation too low, account frozen")
	}

	// 验证签名
	if err := s.verifyLoginSignature(agent, req); err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	// 生成 JWT Token
	token, expiresAt, err := s.generateJWT(agent.AID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	logrus.WithField("aid", req.AID).Info("Agent logged in successfully")

	return &LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
	}, nil
}

// GetAgent 获取 Agent 信息
func (s *agentService) GetAgent(ctx context.Context, aid string) (*models.Agent, error) {
	return s.repo.GetByAID(ctx, aid)
}

// UpdateReputation 更新信誉分
func (s *agentService) UpdateReputation(ctx context.Context, aid string, change int, reason string) error {
	return s.repo.UpdateReputation(ctx, aid, change, reason)
}

// GetReputationHistory 获取信誉历史
func (s *agentService) GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error) {
	return s.repo.GetReputationHistory(ctx, aid, limit)
}

// VerifyAuth 验证认证信息
func (s *agentService) VerifyAuth(ctx context.Context, aid, signature, timestamp, nonce string) error {
	// 验证时间戳
	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return fmt.Errorf("invalid timestamp format")
	}

	if time.Since(ts) > time.Duration(s.config.Security.NonceExpiration)*time.Second {
		return fmt.Errorf("timestamp expired")
	}

	// 检查 nonce 是否已使用
	nonceKey := fmt.Sprintf("nonce:%s", nonce)
	exists, err := s.redis.Client.Exists(ctx, nonceKey).Result()
	if err != nil {
		return fmt.Errorf("failed to check nonce: %w", err)
	}
	if exists > 0 {
		return fmt.Errorf("nonce already used")
	}

	// 获取 Agent
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	// 验证签名
	publicKey, err := utils.ParsePublicKeyFromPEM(agent.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %w", err)
	}

	payload := fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":"%s"}`, aid, nonce, timestamp)
	if !utils.VerifySignature(publicKey, []byte(payload), []byte(signature)) {
		return fmt.Errorf("signature verification failed")
	}

	// 存储 nonce
	err = s.redis.Client.Set(ctx, nonceKey, "1", time.Duration(s.config.Security.NonceExpiration)*time.Second).Err()
	if err != nil {
		return fmt.Errorf("failed to store nonce: %w", err)
	}

	return nil
}

// verifyProofOfCapability 验证能力证明（简化版本）
func (s *agentService) verifyProofOfCapability(proof *models.ProofOfCapability) bool {
	// 实际应该有更复杂的验证逻辑
	// 这里简化为检查是否提供了 challenge 和 response
	return proof.Challenge != "" && proof.Response != ""
}

// generateCertificate 生成身份证书
func (s *agentService) generateCertificate(agent *models.Agent) (string, error) {
	cert := map[string]interface{}{
		"aid":          agent.AID,
		"model":        agent.Model,
		"provider":     agent.Provider,
		"capabilities": agent.Capabilities,
		"public_key":   agent.PublicKey,
		"created_at":   agent.CreatedAt.Format(time.RFC3339),
		"expires_at":   agent.CreatedAt.AddDate(1, 0, 0).Format(time.RFC3339),
	}

	certJSON, err := json.Marshal(cert)
	if err != nil {
		return "", err
	}

	return string(certJSON), nil
}

// verifyLoginSignature 验证登录签名
func (s *agentService) verifyLoginSignature(agent *models.Agent, req *LoginRequest) error {
	// 验证时间戳
	reqTime := time.Unix(req.Timestamp, 0)
	if time.Since(reqTime) > time.Duration(s.config.Security.NonceExpiration)*time.Second {
		return fmt.Errorf("timestamp expired")
	}

	// 解析公钥
	publicKey, err := utils.ParsePublicKeyFromPEM(agent.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %w", err)
	}

	// 构造消息
	payload := fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, req.AID, req.Nonce, req.Timestamp)

	// 验证签名
	if !utils.VerifySignature(publicKey, []byte(payload), []byte(req.Signature)) {
		return fmt.Errorf("invalid signature")
	}

	return nil
}

// generateJWT 生成 JWT Token
func (s *agentService) generateJWT(aid string) (string, time.Time, error) {
	expiresAt := time.Now().Add(s.config.JWT.Expiration)

	claims := jwt.MapClaims{
		"aid": aid,
		"exp": expiresAt.Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.config.JWT.Secret))
	if err != nil {
		return "", time.Time{}, err
	}

	return tokenString, expiresAt, nil
}
