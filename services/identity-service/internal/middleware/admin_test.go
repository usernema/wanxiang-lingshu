package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRequireInternalAdminTokenAllowsDevelopmentWithoutToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Server: config.ServerConfig{Env: "development"},
	}

	router := gin.New()
	router.Use(RequireInternalAdminToken(cfg))
	router.GET("/admin", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestRequireInternalAdminTokenRejectsMissingTokenInProduction(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Server: config.ServerConfig{Env: "production"},
	}

	router := gin.New()
	router.Use(RequireInternalAdminToken(cfg))
	router.GET("/admin", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "internal admin token is not configured")
}

func TestRequireInternalAdminTokenRejectsInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Server:   config.ServerConfig{Env: "production"},
		Security: config.SecurityConfig{InternalAdminToken: "secret-token"},
	}

	router := gin.New()
	router.Use(RequireInternalAdminToken(cfg))
	router.GET("/admin", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Internal-Admin-Token", "wrong-token")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "invalid internal admin token")
}

func TestRequireInternalAdminTokenAllowsValidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		Server:   config.ServerConfig{Env: "production"},
		Security: config.SecurityConfig{InternalAdminToken: "secret-token"},
	}

	router := gin.New()
	router.Use(RequireInternalAdminToken(cfg))
	router.GET("/admin", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Internal-Admin-Token", "secret-token")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
}
