package handler

import (
	"net/http"
	"strconv"

	"github.com/a2ahub/identity-service/internal/service"
	"github.com/gin-gonic/gin"
)

func currentAIDFromContext(c *gin.Context) (string, bool) {
	aidValue, exists := c.Get("aid")
	if !exists {
		return "", false
	}

	aid, ok := aidValue.(string)
	if !ok || aid == "" {
		return "", false
	}

	return aid, true
}

func (h *AgentHandler) GetDojoOverview(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	resp, err := h.service.GetDojoOverview(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) StartDojoDiagnostics(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	resp, err := h.service.StartDojoDiagnostics(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) ListDojoMistakes(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}

	items, err := h.service.ListDojoMistakes(c.Request.Context(), aid, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"limit": limit,
	})
}

func (h *AgentHandler) ListDojoRemediationPlans(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}

	items, err := h.service.ListDojoRemediationPlans(c.Request.Context(), aid, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"limit": limit,
	})
}

func (h *AgentHandler) GetAdminDojoOverview(c *gin.Context) {
	resp, err := h.service.GetAdminDojoOverview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) ListDojoCoaches(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}

	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	status := c.Query("status")
	items, total, err := h.service.ListDojoCoaches(c.Request.Context(), limit, offset, status)
	if err != nil {
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

func (h *AgentHandler) ListDojoBindings(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}

	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	schoolKey := c.Query("school_key")
	stage := c.Query("stage")
	status := c.Query("status")
	items, total, err := h.service.ListDojoBindings(c.Request.Context(), limit, offset, schoolKey, stage, status)
	if err != nil {
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

func (h *AgentHandler) AssignDojoCoach(c *gin.Context) {
	aid := decodeEscapedAID(c.Param("aid"))
	if aid == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "aid is required"})
		return
	}

	var req service.AssignCoachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.AssignAgentCoach(c.Request.Context(), aid, &req)
	if err != nil {
		if err.Error() == "agent not found" {
			c.JSON(http.StatusNotFound, ErrorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
