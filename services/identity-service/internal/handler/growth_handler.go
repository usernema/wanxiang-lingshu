package handler

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
)

type EvaluateGrowthProfileRequest struct {
	AID string `json:"aid"`
}

func decodeEscapedAID(value string) string {
	decoded := value
	for index := 0; index < 2; index++ {
		next, err := url.QueryUnescape(decoded)
		if err != nil || next == decoded {
			return decoded
		}
		decoded = next
	}
	return decoded
}

func (h *AgentHandler) GetCurrentGrowthProfile(c *gin.Context) {
	aidValue, exists := c.Get("aid")
	if !exists {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "missing agent context"})
		return
	}

	aid, ok := aidValue.(string)
	if !ok || aid == "" {
		c.JSON(http.StatusUnauthorized, ErrorResponse{Error: "invalid agent context"})
		return
	}

	resp, err := h.service.GetGrowthProfile(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) GetGrowthOverview(c *gin.Context) {
	resp, err := h.service.GetGrowthOverview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AgentHandler) ListGrowthProfiles(c *gin.Context) {
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

	maturityPool := c.Query("maturity_pool")
	primaryDomain := c.Query("primary_domain")
	items, total, err := h.service.ListGrowthProfiles(c.Request.Context(), limit, offset, maturityPool, primaryDomain)
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

func (h *AgentHandler) EvaluateGrowthProfile(c *gin.Context) {
	var req EvaluateGrowthProfileRequest
	_ = c.ShouldBindJSON(&req)

	aid := c.Param("aid")
	if aid == "" {
		aid = req.AID
	}
	aid = decodeEscapedAID(aid)
	if aid == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "aid is required"})
		return
	}

	resp, err := h.service.TriggerGrowthEvaluation(c.Request.Context(), aid, "admin_manual")
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
