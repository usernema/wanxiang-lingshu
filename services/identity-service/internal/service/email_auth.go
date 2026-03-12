package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/sirupsen/logrus"
)

const (
	emailCodePurposeRegister = "register"
	emailCodePurposeLogin    = "login"
)

func generateBindingKey() (string, string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}

	plain := fmt.Sprintf("bind_%s", hex.EncodeToString(bytes))
	return plain, hashBindingKey(plain), nil
}

func hashBindingKey(bindingKey string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(bindingKey)))
	return hex.EncodeToString(sum[:])
}

func normalizeEmail(email string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(email))
	parsed, err := mail.ParseAddress(trimmed)
	if err != nil {
		return "", fmt.Errorf("invalid email address")
	}
	return strings.ToLower(parsed.Address), nil
}

func generateEmailCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func emailCodeKey(purpose, aid, email string) string {
	return fmt.Sprintf("email_auth:%s:%s:%s", purpose, aid, email)
}

func (s *agentService) isEmailDeliveryConfigured() bool {
	return strings.TrimSpace(s.config.Email.SMTPHost) != "" && strings.TrimSpace(s.config.Email.From) != ""
}

func (s *agentService) sendVerificationEmail(email, aid, code, purpose string, expiresAt time.Time) (string, string, error) {
	if !s.isEmailDeliveryConfigured() {
		if s.config.Server.Env != "production" && s.config.Email.AllowInlineCodeInDev {
			logrus.WithFields(logrus.Fields{
				"aid":     aid,
				"email":   email,
				"purpose": purpose,
				"code":    code,
			}).Warn("SMTP not configured; returning inline verification code in non-production mode")
			return "inline", code, nil
		}

		return "", "", fmt.Errorf("email delivery is not configured")
	}

	subject := "A2Ahub 邮箱验证码"
	purposeText := "登录"
	if purpose == emailCodePurposeRegister {
		purposeText = "注册绑定"
	}

	body := fmt.Sprintf("你的 A2Ahub%s验证码是 %s。\n\n绑定 Agent: %s\n过期时间: %s\n\n如果这不是你的操作，请忽略这封邮件。", purposeText, code, aid, expiresAt.Format(time.RFC3339))
	message := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		s.config.Email.From,
		email,
		subject,
		body,
	)

	addr := fmt.Sprintf("%s:%s", s.config.Email.SMTPHost, s.config.Email.SMTPPort)
	var auth smtp.Auth
	if strings.TrimSpace(s.config.Email.SMTPUser) != "" {
		auth = smtp.PlainAuth("", s.config.Email.SMTPUser, s.config.Email.SMTPPassword, s.config.Email.SMTPHost)
	}

	if err := smtp.SendMail(addr, auth, s.config.Email.From, []string{email}, []byte(message)); err != nil {
		return "", "", fmt.Errorf("failed to send verification email: %w", err)
	}

	return "smtp", "", nil
}

func (s *agentService) dispatchEmailCode(ctx context.Context, purpose string, agent *models.Agent, email string) (*EmailCodeDispatchResponse, error) {
	code, err := generateEmailCode()
	if err != nil {
		return nil, fmt.Errorf("failed to generate email verification code: %w", err)
	}

	expiresAt := time.Now().Add(time.Duration(s.config.Email.CodeExpiration) * time.Second)
	key := emailCodeKey(purpose, agent.AID, email)
	if err := s.redis.Client.Set(ctx, key, code, time.Duration(s.config.Email.CodeExpiration)*time.Second).Err(); err != nil {
		return nil, fmt.Errorf("failed to store email verification code: %w", err)
	}

	delivery, inlineCode, err := s.sendVerificationEmail(email, agent.AID, code, purpose, expiresAt)
	if err != nil {
		_ = s.redis.Client.Del(ctx, key).Err()
		return nil, err
	}

	return &EmailCodeDispatchResponse{
		Email:            email,
		AID:              agent.AID,
		ExpiresAt:        expiresAt,
		Delivery:         delivery,
		VerificationCode: inlineCode,
	}, nil
}

func (s *agentService) validateEmailCode(ctx context.Context, purpose, aid, email, code string) error {
	key := emailCodeKey(purpose, aid, email)
	storedCode, err := s.redis.Client.Get(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("verification code not found or expired")
	}
	if strings.TrimSpace(code) != strings.TrimSpace(storedCode) {
		return fmt.Errorf("invalid verification code")
	}
	if err := s.redis.Client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("failed to consume verification code")
	}
	return nil
}

func (s *agentService) loginResponseForAgent(agent *models.Agent) (*LoginResponse, error) {
	if agent.Status != "active" {
		return nil, fmt.Errorf("agent is not active")
	}
	if agent.Reputation < s.config.Reputation.MinReputationThreshold {
		return nil, fmt.Errorf("reputation too low, account frozen")
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

func (s *agentService) RequestEmailRegistrationCode(ctx context.Context, req *EmailRegistrationCodeRequest) (*EmailCodeDispatchResponse, error) {
	email, err := normalizeEmail(req.Email)
	if err != nil {
		return nil, err
	}

	agent, err := s.repo.GetByBindingKeyHash(ctx, hashBindingKey(req.BindingKey))
	if err != nil {
		return nil, fmt.Errorf("invalid binding key")
	}

	if agent.OwnerEmail != "" && agent.OwnerEmail != email {
		return nil, fmt.Errorf("binding key has already been claimed")
	}
	if existingAgent, err := s.repo.GetByOwnerEmail(ctx, email); err == nil && existingAgent.AID != agent.AID {
		return nil, fmt.Errorf("email is already bound to another agent")
	} else if err != nil && err.Error() != "agent not found" {
		return nil, fmt.Errorf("failed to check email binding: %w", err)
	}

	return s.dispatchEmailCode(ctx, emailCodePurposeRegister, agent, email)
}

func (s *agentService) CompleteEmailRegistration(ctx context.Context, req *CompleteEmailRegistrationRequest) (*LoginResponse, error) {
	email, err := normalizeEmail(req.Email)
	if err != nil {
		return nil, err
	}

	agent, err := s.repo.GetByBindingKeyHash(ctx, hashBindingKey(req.BindingKey))
	if err != nil {
		return nil, fmt.Errorf("invalid binding key")
	}

	if agent.OwnerEmail != "" && agent.OwnerEmail != email {
		return nil, fmt.Errorf("binding key has already been claimed")
	}
	if existingAgent, err := s.repo.GetByOwnerEmail(ctx, email); err == nil && existingAgent.AID != agent.AID {
		return nil, fmt.Errorf("email is already bound to another agent")
	} else if err != nil && err.Error() != "agent not found" {
		return nil, fmt.Errorf("failed to check email binding: %w", err)
	}

	if err := s.validateEmailCode(ctx, emailCodePurposeRegister, agent.AID, email, req.Code); err != nil {
		return nil, err
	}

	verifiedAgent, err := s.repo.BindEmail(ctx, agent.AID, email, time.Now())
	if err != nil {
		return nil, err
	}

	return s.loginResponseForAgent(verifiedAgent)
}

func (s *agentService) RequestEmailLoginCode(ctx context.Context, req *EmailLoginCodeRequest) (*EmailCodeDispatchResponse, error) {
	email, err := normalizeEmail(req.Email)
	if err != nil {
		return nil, err
	}

	agent, err := s.repo.GetByOwnerEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("no agent is bound to this email")
	}

	return s.dispatchEmailCode(ctx, emailCodePurposeLogin, agent, email)
}

func (s *agentService) CompleteEmailLogin(ctx context.Context, req *CompleteEmailLoginRequest) (*LoginResponse, error) {
	email, err := normalizeEmail(req.Email)
	if err != nil {
		return nil, err
	}

	agent, err := s.repo.GetByOwnerEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("no agent is bound to this email")
	}

	if err := s.validateEmailCode(ctx, emailCodePurposeLogin, agent.AID, email, req.Code); err != nil {
		return nil, err
	}

	return s.loginResponseForAgent(agent)
}
