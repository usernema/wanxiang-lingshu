package handler

import (
	"net/http"
	"strconv"

	"github.com/a2ahub/identity-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// AgentHandler Agent 处理器
type AgentHandler struct {
	service service.AgentService
}

type VerifyAuthRequest struct {
	AID       string `json:"aid" binding:"required"`
	Signature string `json:"signature" binding:"required"`
	Timestamp string `json:"timestamp" binding:"required"`
	Nonce     string `json:"nonce" binding:"required"`
}

type DevSessionRequest struct {
	Role string `json:"role" binding:"required"`
}

type LoginChallengeRequest struct {
	AID string `json:"aid" binding:"required"`
}

type LogoutRequest struct {
	Token string `json:"token"`
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if len(header) > len(prefix) && header[:len(prefix)] == prefix {
		return header[len(prefix):]
	}
	return ""
}

// NewAgentHandler 创建 Agent 处理器
func NewAgentHandler(service service.AgentService) *AgentHandler {
	return &AgentHandler{service: service}
}

// Register 注册 Agent
// @Summary 注册 Agent
// @Description 注册新的 Agent 并生成身份证书
// @Tags agents
// @Accept json
// @Produce json
// @Param request body service.RegisterRequest true "注册请求"
// @Success 201 {object} service.RegisterResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/agents/register [post]
func (h *AgentHandler) Register(c *gin.Context) {
	var req service.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.Register(c.Request.Context(), &req)
	if err != nil {
		logrus.WithError(err).Error("Failed to register agent")
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *AgentHandler) IssueLoginChallenge(c *gin.Context) {
	var req LoginChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.IssueLoginChallenge(c.Request.Context(), req.AID)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Login Agent 登录
// @Summary Agent 登录
// @Description Agent 使用签名登录并获取 JWT Token
// @Tags agents
// @Accept json
// @Produce json
// @Param request body service.LoginRequest true "登录请求"
// @Success 200 {object} service.LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/agents/login [post]
func (h *AgentHandler) Login(c *gin.Context) {
	var req service.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.Login(c.Request.Context(), &req)
	if err != nil {
		logrus.WithError(err).Error("Failed to login")
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) Verify(c *gin.Context) {
	var req VerifyAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
			"code":    "INVALID_REQUEST",
		})
		return
	}

	agent, err := h.service.VerifyAuth(c.Request.Context(), req.AID, req.Signature, req.Timestamp, req.Nonce)
	if err != nil {
		status := http.StatusUnauthorized
		if err.Error() == "agent is not active" || err.Error() == "reputation too low, account frozen" {
			status = http.StatusForbidden
		}

		c.JSON(status, gin.H{
			"success": false,
			"error":   err.Error(),
			"code":    "VERIFY_AUTH_FAILED",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    agent,
	})
}

// GetAgent 获取 Agent 信息
// @Summary 获取 Agent 信息
// @Description 根据 AID 获取 Agent 详细信息
// @Tags agents
// @Produce json
// @Param aid path string true "Agent ID"
// @Success 200 {object} models.Agent
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/agents/{aid} [get]
func (h *AgentHandler) GetAgent(c *gin.Context) {
	aid := c.Param("aid")

	agent, err := h.service.GetAgent(c.Request.Context(), aid)
	if err != nil {
		logrus.WithError(err).WithField("aid", aid).Error("Failed to get agent")
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "agent not found"})
		return
	}

	c.JSON(http.StatusOK, agent)
}

// ListAgents 获取 Agent 列表
func (h *AgentHandler) ListAgents(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	status := c.Query("status")
	items, total, err := h.service.ListAgents(c.Request.Context(), limit, offset, status)
	if err != nil {
		logrus.WithError(err).Error("Failed to list agents")
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GetReputation 获取信誉分
// @Summary 获取信誉分
// @Description 获取 Agent 的当前信誉分和历史记录
// @Tags agents
// @Produce json
// @Param aid path string true "Agent ID"
// @Param limit query int false "历史记录数量限制" default(10)
// @Success 200 {object} ReputationResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/agents/{aid}/reputation [get]
func (h *AgentHandler) GetReputation(c *gin.Context) {
	aid := c.Param("aid")
	limitStr := c.DefaultQuery("limit", "10")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 10
	}

	agent, err := h.service.GetAgent(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "agent not found"})
		return
	}

	history, err := h.service.GetReputationHistory(c.Request.Context(), aid, limit)
	if err != nil {
		logrus.WithError(err).Error("Failed to get reputation history")
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, ReputationResponse{
		AID:        agent.AID,
		Reputation: agent.Reputation,
		History:    history,
	})
}

// UpdateReputation 更新信誉分（管理员接口）
// @Summary 更新信誉分
// @Description 更新 Agent 的信誉分（需要管理员权限）
// @Tags agents
// @Accept json
// @Produce json
// @Param aid path string true "Agent ID"
// @Param request body UpdateReputationRequest true "更新请求"
// @Success 200 {object} SuccessResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/agents/{aid}/reputation [post]
func (h *AgentHandler) UpdateReputation(c *gin.Context) {
	aid := c.Param("aid")

	var req UpdateReputationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	err := h.service.UpdateReputation(c.Request.Context(), aid, req.Change, req.Reason)
	if err != nil {
		logrus.WithError(err).Error("Failed to update reputation")
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, SuccessResponse{Message: "reputation updated successfully"})
}

func (h *AgentHandler) Refresh(c *gin.Context) {
	aidValue, exists := c.Get("aid")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	aid, ok := aidValue.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "invalid agent context"})
		return
	}

	resp, err := h.service.Refresh(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) Logout(c *gin.Context) {
	token := bearerToken(c.GetHeader("Authorization"))
	if token == "" {
		var req LogoutRequest
		if err := c.ShouldBindJSON(&req); err == nil {
			token = req.Token
		}
	}

	if err := h.service.Logout(c.Request.Context(), token); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, SuccessResponse{Message: "logged out successfully"})
}

func (h *AgentHandler) UpdateProfile(c *gin.Context) {
	aidValue, exists := c.Get("aid")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	aid, ok := aidValue.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "invalid agent context"})
		return
	}

	var req service.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	agent, err := h.service.UpdateProfile(c.Request.Context(), aid, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, agent)
}

func (h *AgentHandler) GetCurrentAgent(c *gin.Context) {
	aidValue, exists := c.Get("aid")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	aid, ok := aidValue.(string)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "invalid agent context"})
		return
	}

	agent, err := h.service.GetAgent(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "agent not found"})
		return
	}

	c.JSON(http.StatusOK, agent)
}

func (h *AgentHandler) DevBootstrap(c *gin.Context) {
	resp, err := h.service.EnsureDevBootstrap(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusForbidden, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) DevSession(c *gin.Context) {
	var req DevSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.GetDevSession(c.Request.Context(), req.Role)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "dev bootstrap is disabled" {
			status = http.StatusForbidden
		}
		c.JSON(status, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ErrorResponse 错误响应
type ErrorResponse struct {
	Error string `json:"error"`
}

// SuccessResponse 成功响应
type SuccessResponse struct {
	Message string `json:"message"`
}

// ReputationResponse 信誉响应
type ReputationResponse struct {
	AID        string      `json:"aid"`
	Reputation int         `json:"reputation"`
	History    interface{} `json:"history"`
}

// UpdateReputationRequest 更新信誉请求
type UpdateReputationRequest struct {
	Change int    `json:"change" binding:"required"`
	Reason string `json:"reason" binding:"required"`
}
