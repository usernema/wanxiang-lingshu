package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
	"github.com/a2ahub/identity-service/internal/repository"
	"github.com/a2ahub/identity-service/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

// AgentService Agent 服务接口
type AgentService interface {
	Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error)
	IssueLoginChallenge(ctx context.Context, aid string) (*LoginChallengeResponse, error)
	Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error)
	RequestEmailRegistrationCode(ctx context.Context, req *EmailRegistrationCodeRequest) (*EmailCodeDispatchResponse, error)
	CompleteEmailRegistration(ctx context.Context, req *CompleteEmailRegistrationRequest) (*LoginResponse, error)
	RequestEmailLoginCode(ctx context.Context, req *EmailLoginCodeRequest) (*EmailCodeDispatchResponse, error)
	CompleteEmailLogin(ctx context.Context, req *CompleteEmailLoginRequest) (*LoginResponse, error)
	Refresh(ctx context.Context, aid string) (*LoginResponse, error)
	Logout(ctx context.Context, token string) error
	GetAgent(ctx context.Context, aid string) (*models.Agent, error)
	ListAgents(ctx context.Context, limit, offset int, status string) ([]*models.Agent, int, error)
	UpdateAgentStatus(ctx context.Context, aid, status string) (*models.Agent, error)
	UpdateProfile(ctx context.Context, aid string, req *UpdateProfileRequest) (*models.Agent, error)
	UpdateReputation(ctx context.Context, aid string, change int, reason string) error
	GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error)
	VerifyAuth(ctx context.Context, aid, signature, timestamp, nonce string) (*models.Agent, error)
	EnsureDevBootstrap(ctx context.Context) (*DevBootstrapResponse, error)
	GetDevSession(ctx context.Context, role string) (*DevSessionResponse, error)
	GetGrowthProfile(ctx context.Context, aid string) (*models.AgentGrowthProfileResponse, error)
	ListGrowthProfiles(ctx context.Context, limit, offset int, maturityPool, primaryDomain string) ([]*models.AgentGrowthProfile, int, error)
	GetGrowthOverview(ctx context.Context) (*models.AgentGrowthOverview, error)
	TriggerGrowthEvaluation(ctx context.Context, aid, triggerType string) (*models.AgentGrowthProfileResponse, error)
}

// agentService Agent 服务实现
type agentService struct {
	repo       repository.AgentRepository
	growthRepo repository.GrowthRepository
	redis      *database.RedisClient
	config     *config.Config
}

// NewAgentService 创建 Agent 服务
func NewAgentService(repo repository.AgentRepository, growthRepo repository.GrowthRepository, redis *database.RedisClient, cfg *config.Config) AgentService {
	return &agentService{
		repo:       repo,
		growthRepo: growthRepo,
		redis:      redis,
		config:     cfg,
	}
}

// RegisterRequest 注册请求
type RegisterRequest struct {
	Model             string                    `json:"model" binding:"required"`
	Provider          string                    `json:"provider" binding:"required"`
	Capabilities      []string                  `json:"capabilities" binding:"required"`
	PublicKey         string                    `json:"public_key"`
	ProofOfCapability *models.ProofOfCapability `json:"proof_of_capability"`
}

// RegisterResponse 注册响应
type RegisterResponse struct {
	AID            string        `json:"aid"`
	BindingKey     string        `json:"binding_key"`
	Certificate    string        `json:"certificate"`
	InitialCredits int           `json:"initial_credits"`
	CreatedAt      time.Time     `json:"created_at"`
	Agent          *models.Agent `json:"agent"`
}

// Register 注册 Agent
func (s *agentService) Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error) {
	// 验证公钥格式
	if s.isLikelyPEM(req.PublicKey) {
		_, err := utils.ParsePublicKeyFromPEM(req.PublicKey)
		if err != nil {
			return nil, fmt.Errorf("invalid public key format: %w", err)
		}
	}

	// 验证能力证明（简化版本，实际应该有更复杂的验证逻辑）
	if req.ProofOfCapability != nil {
		if !s.verifyProofOfCapability(req.ProofOfCapability) {
			return nil, fmt.Errorf("proof of capability verification failed")
		}
	}

	// 生成 AID
	aid := utils.GenerateAID("a2ahub", req.Model)
	bindingKey, bindingKeyHash, err := generateBindingKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate binding key: %w", err)
	}

	// 创建 Agent
	now := time.Now()
	status := "pending"
	membershipLevel := "registered"
	trustLevel := "new"
	if s.config.Security.AutoActivateNewAgents {
		status = "active"
		membershipLevel = "member"
		trustLevel = "active"
	}

	agent := &models.Agent{
		AID:                aid,
		Model:              req.Model,
		Provider:           req.Provider,
		PublicKey:          req.PublicKey,
		Capabilities:       req.Capabilities,
		Reputation:         s.config.Reputation.InitialReputation,
		Status:             status,
		MembershipLevel:    membershipLevel,
		TrustLevel:         trustLevel,
		AvailabilityStatus: "available",
		BindingKeyHash:     bindingKeyHash,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if err := s.repo.Create(ctx, agent); err != nil {
		return nil, fmt.Errorf("failed to create agent: %w", err)
	}
	s.syncGrowthProfileBestEffort(ctx, aid, "agent_registered")

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
		BindingKey:     bindingKey,
		Certificate:    certificate,
		InitialCredits: s.config.Credit.InitialCredits,
		CreatedAt:      now,
		Agent:          agent,
	}, nil
}

// LoginRequest 登录请求
type LoginChallengeResponse struct {
	AID       string    `json:"aid"`
	Nonce     string    `json:"nonce"`
	Timestamp int64     `json:"timestamp"`
	ExpiresAt time.Time `json:"expires_at"`
	Message   string    `json:"message"`
}

type LoginRequest struct {
	AID       string `json:"aid" binding:"required"`
	Timestamp int64  `json:"timestamp" binding:"required"`
	Nonce     string `json:"nonce" binding:"required"`
	Signature string `json:"signature" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token     string        `json:"token"`
	ExpiresAt time.Time     `json:"expires_at"`
	Agent     *models.Agent `json:"agent"`
}

type EmailRegistrationCodeRequest struct {
	Email      string `json:"email" binding:"required"`
	BindingKey string `json:"binding_key" binding:"required"`
}

type CompleteEmailRegistrationRequest struct {
	Email      string `json:"email" binding:"required"`
	BindingKey string `json:"binding_key" binding:"required"`
	Code       string `json:"code" binding:"required"`
}

type EmailLoginCodeRequest struct {
	Email string `json:"email" binding:"required"`
}

type CompleteEmailLoginRequest struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

type EmailCodeDispatchResponse struct {
	Email            string    `json:"email"`
	AID              string    `json:"aid"`
	ExpiresAt        time.Time `json:"expires_at"`
	Delivery         string    `json:"delivery"`
	VerificationCode string    `json:"verification_code,omitempty"`
}

type UpdateProfileRequest struct {
	Headline           string   `json:"headline"`
	Bio                string   `json:"bio"`
	AvailabilityStatus string   `json:"availability_status"`
	Capabilities       []string `json:"capabilities"`
}

var allowedAdminAgentStatuses = map[string]struct{}{
	"active":    {},
	"suspended": {},
	"banned":    {},
}

const (
	revokedTokenKeyPrefix     = "auth:revoked_token:"
	agentMinIssuedAtKeyPrefix = "auth:agent:min_iat:"
	gatewayAgentCachePrefix   = "agent:"
)

type DevBootstrapSession struct {
	Role      string        `json:"role"`
	Aid       string        `json:"aid"`
	Token     string        `json:"token"`
	ExpiresAt time.Time     `json:"expires_at"`
	Agent     *models.Agent `json:"agent"`
}

type DevBootstrapResponse struct {
	Sessions []DevBootstrapSession `json:"sessions"`
}

type DevSessionResponse struct {
	Role      string        `json:"role"`
	Aid       string        `json:"aid"`
	Token     string        `json:"token"`
	ExpiresAt time.Time     `json:"expires_at"`
	Agent     *models.Agent `json:"agent"`
}

var devBootstrapProfiles = map[string]struct {
	AID          string
	Model        string
	Provider     string
	Capabilities []string
	PublicKey    string
	Reputation   int
}{
	"default": {
		AID:          "agent://a2ahub/dev-default",
		Model:        "dev-default",
		Provider:     "a2ahub",
		Capabilities: []string{"code", "analysis", "planning"},
		PublicKey:    "dev-public-key-default",
		Reputation:   120,
	},
	"employer": {
		AID:          "agent://a2ahub/dev-employer",
		Model:        "dev-employer",
		Provider:     "a2ahub",
		Capabilities: []string{"publish_tasks", "review_workers", "manage_bounties"},
		PublicKey:    "dev-public-key-employer",
		Reputation:   150,
	},
	"worker": {
		AID:          "agent://a2ahub/dev-worker",
		Model:        "dev-worker",
		Provider:     "a2ahub",
		Capabilities: []string{"execute_tasks", "collaboration", "delivery"},
		PublicKey:    "dev-public-key-worker",
		Reputation:   130,
	},
}

var devBootstrapRoleOrder = []string{"default", "employer", "worker"}

func (s *agentService) ensureDevBootstrapEnabled() error {
	if s.config == nil || !s.config.Dev.BootstrapEnabled {
		return fmt.Errorf("dev bootstrap is disabled")
	}
	return nil
}

func (s *agentService) ensureDevAgent(ctx context.Context, role string) (*models.Agent, error) {
	profile, ok := devBootstrapProfiles[role]
	if !ok {
		return nil, fmt.Errorf("unknown dev role: %s", role)
	}

	agent, err := s.repo.GetByAID(ctx, profile.AID)
	if err == nil {
		return agent, nil
	}

	now := time.Now()
	agent = &models.Agent{
		AID:                profile.AID,
		Model:              profile.Model,
		Provider:           profile.Provider,
		PublicKey:          profile.PublicKey,
		Capabilities:       profile.Capabilities,
		Reputation:         profile.Reputation,
		Status:             "active",
		MembershipLevel:    "trusted_seller",
		TrustLevel:         "internal",
		AvailabilityStatus: "available",
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if err := s.repo.Create(ctx, agent); err != nil {
		return nil, fmt.Errorf("failed to seed dev agent %s: %w", role, err)
	}

	return agent, nil
}

func (s *agentService) buildDevSession(ctx context.Context, role string) (*DevSessionResponse, error) {
	agent, err := s.ensureDevAgent(ctx, role)
	if err != nil {
		return nil, err
	}

	token, expiresAt, err := s.generateJWT(agent.AID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate dev token: %w", err)
	}

	return &DevSessionResponse{
		Role:      role,
		Aid:       agent.AID,
		Token:     token,
		ExpiresAt: expiresAt,
		Agent:     s.sanitizeAgent(agent),
	}, nil
}

func (s *agentService) EnsureDevBootstrap(ctx context.Context) (*DevBootstrapResponse, error) {
	if err := s.ensureDevBootstrapEnabled(); err != nil {
		return nil, err
	}

	sessions := make([]DevBootstrapSession, 0, len(devBootstrapRoleOrder))
	for _, role := range devBootstrapRoleOrder {
		session, err := s.buildDevSession(ctx, role)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, DevBootstrapSession{
			Role:      session.Role,
			Aid:       session.Aid,
			Token:     session.Token,
			ExpiresAt: session.ExpiresAt,
			Agent:     session.Agent,
		})
	}

	return &DevBootstrapResponse{Sessions: sessions}, nil
}

func (s *agentService) GetDevSession(ctx context.Context, role string) (*DevSessionResponse, error) {
	if err := s.ensureDevBootstrapEnabled(); err != nil {
		return nil, err
	}

	return s.buildDevSession(ctx, role)
}

func (s *agentService) isDevBootstrapSignature(req *LoginRequest) bool {
	for _, profile := range devBootstrapProfiles {
		if req.AID == profile.AID && req.Signature == "dev-bootstrap" {
			return true
		}
	}
	return false
}

func (s *agentService) ensureDevAgentForLogin(ctx context.Context, aid string) error {
	for role, profile := range devBootstrapProfiles {
		if profile.AID != aid {
			continue
		}
		_, err := s.ensureDevAgent(ctx, role)
		return err
	}
	return nil
}

func (s *agentService) isLikelyPEM(value string) bool {
	return strings.Contains(value, "BEGIN PUBLIC KEY")
}

func (s *agentService) IssueLoginChallenge(ctx context.Context, aid string) (*LoginChallengeResponse, error) {
	if !utils.ValidateAID(aid) {
		return nil, fmt.Errorf("invalid AID format")
	}

	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	nonce := fmt.Sprintf("login-%d", time.Now().UnixNano())
	timestamp := time.Now().Unix()
	expiresAt := time.Now().Add(time.Duration(s.config.Security.ChallengeExpiration) * time.Second)
	challengeKey := fmt.Sprintf("login_challenge:%s:%s", aid, nonce)
	payload := fmt.Sprintf("%d", timestamp)
	if err := s.redis.Client.Set(ctx, challengeKey, payload, time.Duration(s.config.Security.ChallengeExpiration)*time.Second).Err(); err != nil {
		return nil, fmt.Errorf("failed to store login challenge: %w", err)
	}

	return &LoginChallengeResponse{
		AID:       agent.AID,
		Nonce:     nonce,
		Timestamp: timestamp,
		ExpiresAt: expiresAt,
		Message:   fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, aid, nonce, timestamp),
	}, nil
}

// Login Agent 登录
func (s *agentService) Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
	if !utils.ValidateAID(req.AID) {
		return nil, fmt.Errorf("invalid AID format")
	}

	if s.isDevBootstrapSignature(req) {
		if err := s.ensureDevBootstrapEnabled(); err != nil {
			return nil, err
		}
		if err := s.ensureDevAgentForLogin(ctx, req.AID); err != nil {
			return nil, err
		}
	}

	agent, err := s.repo.GetByAID(ctx, req.AID)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	if agent.Status != "active" {
		return nil, fmt.Errorf("agent is not active")
	}

	if agent.Reputation < s.config.Reputation.MinReputationThreshold {
		return nil, fmt.Errorf("reputation too low, account frozen")
	}

	if req.Signature == "dev-bootstrap" {
		if !s.isDevBootstrapSignature(req) {
			return nil, fmt.Errorf("invalid dev bootstrap login")
		}
	} else {
		if err := s.validateLoginChallenge(ctx, req); err != nil {
			return nil, fmt.Errorf("invalid login challenge: %w", err)
		}
		if err := s.verifyLoginSignature(agent, req); err != nil {
			return nil, fmt.Errorf("signature verification failed: %w", err)
		}
		if err := s.consumeLoginChallenge(ctx, req); err != nil {
			return nil, fmt.Errorf("failed to consume login challenge: %w", err)
		}
	}

	token, expiresAt, err := s.generateJWT(agent.AID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"aid":              agent.AID,
		"membership_level": agent.MembershipLevel,
		"trust_level":      agent.TrustLevel,
	}).Info("Agent logged in successfully")

	return &LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		Agent:     s.sanitizeAgent(agent),
	}, nil
}

func (s *agentService) Refresh(ctx context.Context, aid string) (*LoginResponse, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}
	if agent.Status != "active" {
		return nil, fmt.Errorf("agent is not active")
	}

	token, expiresAt, err := s.generateJWT(agent.AID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		Agent:     s.sanitizeAgent(agent),
	}, nil
}

func (s *agentService) Logout(ctx context.Context, token string) error {
	if token == "" {
		return fmt.Errorf("missing token")
	}
	return s.revokeToken(ctx, token)
}

// GetAgent 获取 Agent 信息
func (s *agentService) GetAgent(ctx context.Context, aid string) (*models.Agent, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}
	return s.sanitizeAgent(agent), nil
}

// ListAgents 获取 Agent 列表
func (s *agentService) ListAgents(ctx context.Context, limit, offset int, status string) ([]*models.Agent, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	items, total, err := s.repo.List(ctx, limit, offset, status)
	if err != nil {
		return nil, 0, err
	}

	sanitized := make([]*models.Agent, 0, len(items))
	for _, item := range items {
		sanitized = append(sanitized, s.sanitizeAgent(item))
	}
	return sanitized, total, nil
}

func (s *agentService) UpdateAgentStatus(ctx context.Context, aid, status string) (*models.Agent, error) {
	if _, ok := allowedAdminAgentStatuses[status]; !ok {
		return nil, fmt.Errorf("invalid agent status")
	}

	if aid == "agent://a2ahub/system" {
		return nil, fmt.Errorf("system agent is protected")
	}

	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}

	agent.Status = status
	if err := s.repo.Update(ctx, agent); err != nil {
		return nil, err
	}

	updatedAgent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}
	if status == "active" {
		s.clearGatewayAgentCacheBestEffort(ctx, aid)
	} else {
		s.revokeAgentSessionsBestEffort(ctx, aid, time.Now().Unix()+1)
	}
	s.syncGrowthProfileBestEffort(ctx, aid, "agent_status_updated")

	return s.sanitizeAgent(updatedAgent), nil
}

func (s *agentService) UpdateProfile(ctx context.Context, aid string, req *UpdateProfileRequest) (*models.Agent, error) {
	availabilityStatus := req.AvailabilityStatus
	if availabilityStatus == "" {
		availabilityStatus = "available"
	}

	agent, err := s.repo.UpdateProfile(ctx, aid, req.Headline, req.Bio, availabilityStatus, models.Capabilities(req.Capabilities))
	if err != nil {
		return nil, err
	}
	s.syncGrowthProfileBestEffort(ctx, aid, "agent_profile_updated")
	return s.sanitizeAgent(agent), nil
}

func (s *agentService) sanitizeAgent(agent *models.Agent) *models.Agent {
	if agent == nil {
		return nil
	}
	clone := *agent
	clone.PublicKey = ""
	return &clone
}

// UpdateReputation 更新信誉分
func (s *agentService) UpdateReputation(ctx context.Context, aid string, change int, reason string) error {
	return s.repo.UpdateReputation(ctx, aid, change, reason)
}

func (s *agentService) extractAIDFromToken(tokenString string) (string, error) {
	token, err := s.parseToken(tokenString)
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid token claims")
	}

	aid, ok := claims["aid"].(string)
	if !ok || aid == "" {
		return "", fmt.Errorf("missing token aid")
	}

	return aid, nil
}

// GetReputationHistory 获取信誉历史
func (s *agentService) GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error) {
	return s.repo.GetReputationHistory(ctx, aid, limit)
}

// VerifyAuth 验证认证信息
func (s *agentService) VerifyAuth(ctx context.Context, aid, signature, timestamp, nonce string) (*models.Agent, error) {
	parsedTimestamp, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid timestamp format")
	}

	reqTime := time.Unix(parsedTimestamp, 0)
	if time.Since(reqTime) > time.Duration(s.config.Security.NonceExpiration)*time.Second {
		return nil, fmt.Errorf("timestamp expired")
	}
	if reqTime.Sub(time.Now()) > time.Duration(s.config.Security.NonceExpiration)*time.Second {
		return nil, fmt.Errorf("timestamp expired")
	}

	nonceKey := fmt.Sprintf("nonce:%s:%s", aid, nonce)
	exists, err := s.redis.Client.Exists(ctx, nonceKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to check nonce: %w", err)
	}
	if exists > 0 {
		return nil, fmt.Errorf("nonce already used")
	}

	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %w", err)
	}

	if agent.Status != "active" {
		return nil, fmt.Errorf("agent is not active")
	}

	if agent.Reputation < s.config.Reputation.MinReputationThreshold {
		return nil, fmt.Errorf("reputation too low, account frozen")
	}

	publicKey, err := utils.ParsePublicKeyFromPEM(agent.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("invalid public key: %w", err)
	}

	decodedSignature, err := decodeSignature(signature)
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding: %w", err)
	}

	payload := fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, aid, nonce, parsedTimestamp)
	if !utils.VerifySignature(publicKey, []byte(payload), decodedSignature) {
		return nil, fmt.Errorf("signature verification failed")
	}

	err = s.redis.Client.Set(ctx, nonceKey, "1", time.Duration(s.config.Security.NonceExpiration)*time.Second).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to store nonce: %w", err)
	}

	return agent, nil
}

func (s *agentService) validateLoginChallenge(ctx context.Context, req *LoginRequest) error {
	challengeKey := fmt.Sprintf("login_challenge:%s:%s", req.AID, req.Nonce)
	storedTimestamp, err := s.redis.Client.Get(ctx, challengeKey).Result()
	if err != nil {
		return fmt.Errorf("challenge not found or expired")
	}
	if storedTimestamp != fmt.Sprintf("%d", req.Timestamp) {
		return fmt.Errorf("challenge timestamp mismatch")
	}
	return nil
}

func (s *agentService) consumeLoginChallenge(ctx context.Context, req *LoginRequest) error {
	challengeKey := fmt.Sprintf("login_challenge:%s:%s", req.AID, req.Nonce)
	return s.redis.Client.Del(ctx, challengeKey).Err()
}

func decodeSignature(signature string) ([]byte, error) {
	if signature == "" {
		return nil, fmt.Errorf("empty signature")
	}

	trimmed := strings.TrimSpace(signature)
	if trimmed != "" {
		if decoded, err := base64.StdEncoding.DecodeString(trimmed); err == nil {
			return decoded, nil
		}
		if decoded, err := base64.RawStdEncoding.DecodeString(trimmed); err == nil {
			return decoded, nil
		}
		if decoded, err := base64.URLEncoding.DecodeString(trimmed); err == nil {
			return decoded, nil
		}
		if decoded, err := base64.RawURLEncoding.DecodeString(trimmed); err == nil {
			return decoded, nil
		}
	}

	return []byte(signature), nil
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

	decodedSignature, err := decodeSignature(req.Signature)
	if err != nil {
		return fmt.Errorf("invalid signature encoding: %w", err)
	}

	// 构造消息
	payload := fmt.Sprintf(`{"aid":"%s","nonce":"%s","timestamp":%d}`, req.AID, req.Nonce, req.Timestamp)

	// 验证签名
	if !utils.VerifySignature(publicKey, []byte(payload), decodedSignature) {
		return fmt.Errorf("invalid signature")
	}

	return nil
}

func (s *agentService) parseToken(tokenString string) (*jwt.Token, error) {
	return jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(s.config.JWT.Secret), nil
	})
}

// generateJWT 生成 JWT Token
func (s *agentService) generateJWT(aid string) (string, time.Time, error) {
	issuedAt := time.Now()
	expiresAt := issuedAt.Add(s.config.JWT.Expiration)

	claims := jwt.MapClaims{
		"aid": aid,
		"exp": expiresAt.Unix(),
		"iat": issuedAt.Unix(),
		"jti": uuid.NewString(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.config.JWT.Secret))
	if err != nil {
		return "", time.Time{}, err
	}

	return tokenString, expiresAt, nil
}

func revokedTokenKey(jti string) string {
	return revokedTokenKeyPrefix + strings.TrimSpace(jti)
}

func agentMinIssuedAtKey(aid string) string {
	return agentMinIssuedAtKeyPrefix + strings.TrimSpace(aid)
}

func gatewayAgentCacheKey(aid string) string {
	return gatewayAgentCachePrefix + strings.TrimSpace(aid)
}

func claimString(claims jwt.MapClaims, key string) string {
	value, ok := claims[key]
	if !ok {
		return ""
	}
	stringValue, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(stringValue)
}

func claimUnix(claims jwt.MapClaims, key string) int64 {
	value, ok := claims[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case float64:
		return int64(typed)
	case int64:
		return typed
	case int:
		return int64(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return parsed
	default:
		return 0
	}
}

func (s *agentService) parseTokenClaims(tokenString string) (jwt.MapClaims, error) {
	token, err := s.parseToken(tokenString)
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

func (s *agentService) revokeToken(ctx context.Context, tokenString string) error {
	if s.redis == nil || s.redis.Client == nil {
		return nil
	}

	claims, err := s.parseTokenClaims(tokenString)
	if err != nil {
		return err
	}

	aid := claimString(claims, "aid")
	expUnix := claimUnix(claims, "exp")
	issuedAtUnix := claimUnix(claims, "iat")
	jti := claimString(claims, "jti")
	if aid == "" || expUnix == 0 {
		return fmt.Errorf("invalid token claims")
	}

	now := time.Now()
	expiresAt := time.Unix(expUnix, 0)
	if !expiresAt.After(now) {
		s.clearGatewayAgentCacheBestEffort(ctx, aid)
		return nil
	}

	tokenTTL := time.Until(expiresAt)
	sessionTTL := s.config.JWT.Expiration
	if sessionTTL <= 0 {
		sessionTTL = tokenTTL
	}

	pipeline := s.redis.Client.TxPipeline()
	if jti != "" {
		pipeline.Set(ctx, revokedTokenKey(jti), "1", tokenTTL)
	}
	if issuedAtUnix > 0 {
		pipeline.Set(ctx, agentMinIssuedAtKey(aid), strconv.FormatInt(issuedAtUnix+1, 10), sessionTTL)
	}
	pipeline.Del(ctx, gatewayAgentCacheKey(aid))
	if _, err := pipeline.Exec(ctx); err != nil {
		return fmt.Errorf("failed to revoke token: %w", err)
	}
	return nil
}

func (s *agentService) clearGatewayAgentCacheBestEffort(ctx context.Context, aid string) {
	if s.redis == nil || s.redis.Client == nil || strings.TrimSpace(aid) == "" {
		return
	}
	_ = s.redis.Client.Del(ctx, gatewayAgentCacheKey(aid)).Err()
}

func (s *agentService) revokeAgentSessionsBestEffort(ctx context.Context, aid string, minIssuedAt int64) {
	if s.redis == nil || s.redis.Client == nil || strings.TrimSpace(aid) == "" || minIssuedAt <= 0 {
		return
	}
	sessionTTL := s.config.JWT.Expiration
	if sessionTTL <= 0 {
		sessionTTL = 24 * time.Hour
	}
	pipeline := s.redis.Client.TxPipeline()
	pipeline.Set(ctx, agentMinIssuedAtKey(aid), strconv.FormatInt(minIssuedAt, 10), sessionTTL)
	pipeline.Del(ctx, gatewayAgentCacheKey(aid))
	_, _ = pipeline.Exec(ctx)
}
