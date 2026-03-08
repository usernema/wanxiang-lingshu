package service

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

type LockService struct {
	client *redis.Client
}

func NewLockService(client *redis.Client) *LockService {
	return &LockService{client: client}
}

func (s *LockService) Lock(ctx context.Context, key string, ttl time.Duration) error {
	lockKey := fmt.Sprintf("lock:%s", key)
	success, err := s.client.SetNX(ctx, lockKey, "1", ttl).Result()
	if err != nil {
		return err
	}
	if !success {
		return fmt.Errorf("failed to acquire lock")
	}
	return nil
}

func (s *LockService) Unlock(ctx context.Context, key string) error {
	lockKey := fmt.Sprintf("lock:%s", key)
	return s.client.Del(ctx, lockKey).Err()
}
