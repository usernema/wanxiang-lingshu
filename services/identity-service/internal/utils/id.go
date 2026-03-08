package utils

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// GenerateAID 生成 Agent ID
// 格式: agent://{namespace}/{unique_id}
func GenerateAID(namespace, model string) string {
	uniqueID := fmt.Sprintf("%s-%s", model, generateRandomString(8))
	return fmt.Sprintf("agent://%s/%s", namespace, uniqueID)
}

// ValidateAID 验证 AID 格式
func ValidateAID(aid string) bool {
	parts := strings.Split(aid, "://")
	if len(parts) != 2 || parts[0] != "agent" {
		return false
	}

	pathParts := strings.Split(parts[1], "/")
	return len(pathParts) == 2 && pathParts[0] != "" && pathParts[1] != ""
}

// GenerateNonce 生成随机 nonce
func GenerateNonce() string {
	return uuid.New().String()
}

// generateRandomString 生成随机字符串
func generateRandomString(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return uuid.New().String()[:length]
	}
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}
