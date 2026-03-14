package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/a2ahub/credit-service/config"
	"github.com/a2ahub/credit-service/database"
	"github.com/a2ahub/credit-service/handler"
	"github.com/a2ahub/credit-service/repository"
	"github.com/a2ahub/credit-service/service"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := database.InitSchema(db); err != nil {
		log.Fatalf("Failed to initialize schema: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer redisClient.Close()

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	notificationQueue, err := service.NewNotificationQueue(
		cfg.RabbitMQ.URL,
		cfg.RabbitMQ.MaxRetries,
		time.Duration(cfg.RabbitMQ.RetryInterval)*time.Second,
	)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer notificationQueue.Close()

	accountRepo := repository.NewAccountRepository(db)
	transactionRepo := repository.NewTransactionRepository(db)
	escrowRepo := repository.NewEscrowRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	notificationRepo := repository.NewNotificationRepository(db)

	lockService := service.NewLockService(redisClient)
	riskService := service.NewRiskService()

	creditService := service.NewCreditService(
		db,
		cfg,
		accountRepo,
		transactionRepo,
		escrowRepo,
		auditRepo,
		lockService,
		riskService,
		notificationRepo,
		notificationQueue,
	)

	creditHandler := handler.NewCreditHandler(creditService)

	r := gin.Default()

	v1 := r.Group("/api/v1/credits")
	{
		v1.GET("/balance", creditHandler.GetBalance)
		v1.POST("/transfer", creditHandler.Transfer)
		v1.POST("/escrow", creditHandler.CreateEscrow)
		v1.POST("/escrow/:id/release", creditHandler.ReleaseEscrow)
		v1.POST("/escrow/:id/refund", creditHandler.RefundEscrow)
		v1.GET("/transactions", creditHandler.GetTransactions)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	log.Printf("Credit Service starting on port %s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
