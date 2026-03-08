package handler

import (
	"net/http"
	"strconv"

	"github.com/a2ahub/credit-service/service"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type CreditHandler struct {
	creditService *service.CreditService
}

func NewCreditHandler(creditService *service.CreditService) *CreditHandler {
	return &CreditHandler{creditService: creditService}
}

func (h *CreditHandler) GetBalance(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	account, err := h.creditService.GetBalance(c.Request.Context(), aid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"aid":            account.AID,
		"balance":        account.Balance,
		"frozen_balance": account.FrozenBalance,
		"total_earned":   account.TotalEarned,
		"total_spent":    account.TotalSpent,
	})
}

type TransferRequest struct {
	To     string  `json:"to" binding:"required"`
	Amount float64 `json:"amount" binding:"required,gt=0"`
	Memo   string  `json:"memo"`
}

func (h *CreditHandler) Transfer(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	var req TransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	amount := decimal.NewFromFloat(req.Amount)
	metadata := map[string]interface{}{
		"memo": req.Memo,
	}

	transaction, err := h.creditService.Transfer(c.Request.Context(), aid, req.To, amount, req.Memo, metadata)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transaction_id": transaction.TransactionID,
		"status":         transaction.Status,
		"from":           transaction.FromAID,
		"to":             transaction.ToAID,
		"amount":         transaction.Amount,
		"timestamp":      transaction.CreatedAt,
	})
}

type EscrowRequest struct {
	Payee            string  `json:"payee" binding:"required"`
	Amount           float64 `json:"amount" binding:"required,gt=0"`
	ReleaseCondition string  `json:"release_condition"`
	TimeoutHours     int     `json:"timeout_hours" binding:"required,gt=0"`
}

func (h *CreditHandler) CreateEscrow(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	var req EscrowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	amount := decimal.NewFromFloat(req.Amount)
	escrow, err := h.creditService.CreateEscrow(c.Request.Context(), aid, req.Payee, amount, req.ReleaseCondition, req.TimeoutHours)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"escrow_id":         escrow.EscrowID,
		"status":            escrow.Status,
		"amount":            escrow.Amount,
		"release_condition": escrow.ReleaseCondition,
		"timeout":           escrow.Timeout,
	})
}

func (h *CreditHandler) ReleaseEscrow(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	escrowID := c.Param("id")
	if escrowID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing escrow ID"})
		return
	}

	err := h.creditService.ReleaseEscrow(c.Request.Context(), escrowID, aid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "escrow released successfully",
	})
}

func (h *CreditHandler) RefundEscrow(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	escrowID := c.Param("id")
	if escrowID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing escrow ID"})
		return
	}

	err := h.creditService.RefundEscrow(c.Request.Context(), escrowID, aid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "escrow refunded successfully",
	})
}

func (h *CreditHandler) GetTransactions(c *gin.Context) {
	aid := c.GetHeader("X-Agent-ID")
	if aid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing agent ID"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	transactions, err := h.creditService.GetTransactions(c.Request.Context(), aid, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"limit":        limit,
		"offset":       offset,
	})
}
