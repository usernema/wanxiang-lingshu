package middleware

import (
	"net/http"
	"strings"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// AuthMiddleware JWT 认证中间件
func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		// 解析 Bearer Token
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			c.Abort()
			return
		}

		tokenString := parts[1]

		// 验证 JWT
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWT.Secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		// 提取 claims
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("aid", claims["aid"])
		}

		c.Next()
	}
}

// AgentSignatureMiddleware Agent 签名验证中间件
func AgentSignatureMiddleware(agentService service.AgentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		// 解析 Agent 认证头
		// 格式: Agent aid="...", signature="...", timestamp="...", nonce="..."
		if !strings.HasPrefix(authHeader, "Agent ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			c.Abort()
			return
		}

		params := parseAgentAuthHeader(authHeader[6:])
		aid := params["aid"]
		signature := params["signature"]
		timestamp := params["timestamp"]
		nonce := params["nonce"]

		if aid == "" || signature == "" || timestamp == "" || nonce == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing required auth parameters"})
			c.Abort()
			return
		}

		// 验证签名
		if err := agentService.VerifyAuth(c.Request.Context(), aid, signature, timestamp, nonce); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		c.Set("aid", aid)
		c.Next()
	}
}

// parseAgentAuthHeader 解析 Agent 认证头
func parseAgentAuthHeader(header string) map[string]string {
	params := make(map[string]string)
	parts := strings.Split(header, ",")

	for _, part := range parts {
		part = strings.TrimSpace(part)
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			key := strings.TrimSpace(kv[0])
			value := strings.Trim(strings.TrimSpace(kv[1]), "\"")
			params[key] = value
		}
	}

	return params
}
