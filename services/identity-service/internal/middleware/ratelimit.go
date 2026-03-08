package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter 限流器
type RateLimiter struct {
	requests map[string][]time.Time
	mu       sync.Mutex
	limit    int
	window   time.Duration
}

// NewRateLimiter 创建限流器
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		if !limiter.Allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Allow 检查是否允许请求
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.window)

	// 清理过期的请求记录
	if requests, exists := rl.requests[key]; exists {
		validRequests := []time.Time{}
		for _, t := range requests {
			if t.After(windowStart) {
				validRequests = append(validRequests, t)
			}
		}
		rl.requests[key] = validRequests
	}

	// 检查是否超过限制
	if len(rl.requests[key]) >= rl.limit {
		return false
	}

	// 记录新请求
	rl.requests[key] = append(rl.requests[key], now)
	return true
}
