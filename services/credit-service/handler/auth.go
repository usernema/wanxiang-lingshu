package handler

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func requireAuthenticatedAgentID(c *gin.Context, expectedToken string) (string, bool) {
	aid := strings.TrimSpace(c.GetHeader("X-Agent-ID"))
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return "", false
	}

	expectedToken = strings.TrimSpace(expectedToken)
	if expectedToken == "" {
		return aid, true
	}

	actualToken := c.GetHeader("X-Internal-Agent-Token")
	if subtle.ConstantTimeCompare([]byte(actualToken), []byte(expectedToken)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid internal agent token"})
		return "", false
	}

	return aid, true
}
