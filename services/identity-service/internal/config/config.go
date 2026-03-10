package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config 应用配置
type Config struct {
	Server     ServerConfig
	Database   DatabaseConfig
	Redis      RedisConfig
	JWT        JWTConfig
	Security   SecurityConfig
	Reputation ReputationConfig
	Dev        DevConfig
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port string
	Env  string
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// RedisConfig Redis 配置
type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

// JWTConfig JWT 配置
type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

// SecurityConfig 安全配置
type SecurityConfig struct {
	NonceExpiration      int
	MaxLoginAttempts     int
	RateLimitPerMinute   int
	TrialAutoActivate    bool
	ChallengeExpiration  int
}

// ReputationConfig 信誉配置
type ReputationConfig struct {
	InitialReputation      int
	MinReputationThreshold int
}

// DevConfig 本地开发 bootstrap 配置
type DevConfig struct {
	BootstrapEnabled bool
}

// Load 加载配置
func Load() (*Config, error) {
	redisDB, err := strconv.Atoi(getEnv("REDIS_DB", "0"))
	if err != nil {
		return nil, fmt.Errorf("invalid REDIS_DB: %w", err)
	}

	jwtExpiration, err := time.ParseDuration(getEnv("JWT_EXPIRATION", "24h"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_EXPIRATION: %w", err)
	}

	nonceExpiration, err := strconv.Atoi(getEnv("NONCE_EXPIRATION", "300"))
	if err != nil {
		return nil, fmt.Errorf("invalid NONCE_EXPIRATION: %w", err)
	}

	maxLoginAttempts, err := strconv.Atoi(getEnv("MAX_LOGIN_ATTEMPTS", "5"))
	if err != nil {
		return nil, fmt.Errorf("invalid MAX_LOGIN_ATTEMPTS: %w", err)
	}

	rateLimitPerMinute, err := strconv.Atoi(getEnv("RATE_LIMIT_PER_MINUTE", "100"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_PER_MINUTE: %w", err)
	}

	challengeExpiration, err := strconv.Atoi(getEnv("CHALLENGE_EXPIRATION", "300"))
	if err != nil {
		return nil, fmt.Errorf("invalid CHALLENGE_EXPIRATION: %w", err)
	}

	initialReputation, err := strconv.Atoi(getEnv("INITIAL_REPUTATION", "100"))
	if err != nil {
		return nil, fmt.Errorf("invalid INITIAL_REPUTATION: %w", err)
	}

	minReputationThreshold, err := strconv.Atoi(getEnv("MIN_REPUTATION_THRESHOLD", "0"))
	if err != nil {
		return nil, fmt.Errorf("invalid MIN_REPUTATION_THRESHOLD: %w", err)
	}

	return &Config{
		Server: ServerConfig{
			Port: getEnv("PORT", "8001"),
			Env:  getEnv("ENV", "development"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			DBName:   getEnv("DB_NAME", "a2ahub_identity"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       redisDB,
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
			Expiration: jwtExpiration,
		},
		Security: SecurityConfig{
			NonceExpiration:     nonceExpiration,
			MaxLoginAttempts:    maxLoginAttempts,
			RateLimitPerMinute:  rateLimitPerMinute,
			TrialAutoActivate:   getEnv("TRIAL_AUTO_ACTIVATE", "false") == "true",
			ChallengeExpiration: challengeExpiration,
		},
		Reputation: ReputationConfig{
			InitialReputation:      initialReputation,
			MinReputationThreshold: minReputationThreshold,
		},
		Dev: DevConfig{
			BootstrapEnabled: getEnv("DEV_BOOTSTRAP_ENABLED", "true") == "true",
		},
	}, nil
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// GetDSN 获取数据库连接字符串
func (c *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode,
	)
}

// GetRedisAddr 获取 Redis 地址
func (c *RedisConfig) GetRedisAddr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}
