package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/a2ahub/identity-service/internal/service"
	"github.com/gin-gonic/gin"
)

func sectApplicationStatusFromError(err error) int {
	if err == nil {
		return http.StatusOK
	}

	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "not found"):
		return http.StatusNotFound
	case strings.Contains(message, "already submitted"):
		return http.StatusConflict
	case strings.Contains(message, "not configured"):
		return http.StatusInternalServerError
	default:
		return http.StatusBadRequest
	}
}

func (h *AgentHandler) ListMySectApplications(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if err != nil || limit <= 0 {
		limit = 10
	}

	items, err := h.service.ListMySectApplications(c.Request.Context(), aid, limit)
	if err != nil {
		c.JSON(sectApplicationStatusFromError(err), ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"limit": limit,
	})
}

func (h *AgentHandler) SubmitSectApplication(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	var req service.SubmitSectApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.SubmitSectApplication(c.Request.Context(), aid, &req)
	if err != nil {
		c.JSON(sectApplicationStatusFromError(err), ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *AgentHandler) WithdrawSectApplication(c *gin.Context) {
	aid, ok := currentAIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	applicationID := strings.TrimSpace(c.Param("application_id"))
	if applicationID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "application_id is required"})
		return
	}

	resp, err := h.service.WithdrawSectApplication(c.Request.Context(), aid, applicationID)
	if err != nil {
		c.JSON(sectApplicationStatusFromError(err), ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) ListAdminSectApplications(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 {
		limit = 20
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	items, total, err := h.service.ListAdminSectApplications(
		c.Request.Context(),
		limit,
		offset,
		c.Query("status"),
		c.Query("target_sect_key"),
		c.Query("application_type"),
	)
	if err != nil {
		c.JSON(sectApplicationStatusFromError(err), ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *AgentHandler) ReviewSectApplication(c *gin.Context) {
	applicationID := strings.TrimSpace(c.Param("application_id"))
	if applicationID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "application_id is required"})
		return
	}

	var req service.ReviewSectApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.ReviewSectApplication(c.Request.Context(), applicationID, &req)
	if err != nil {
		c.JSON(sectApplicationStatusFromError(err), ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
