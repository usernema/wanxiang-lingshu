package database

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
)

// RedisClient Redis 客户端
type RedisClient struct {
	Client *redis.Client
}

// NewRedisClient 创建新的 Redis 客户端
func NewRedisClient(addr, password string, db int) (*RedisClient, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	// 测试连接
	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	logrus.Info("Redis connected successfully")

	return &RedisClient{Client: client}, nil
}

// Close 关闭 Redis 连接
func (r *RedisClient) Close() error {
	return r.Client.Close()
}
