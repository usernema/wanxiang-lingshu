package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/a2ahub/identity-service/internal/config"
	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/handler"
	"github.com/a2ahub/identity-service/internal/middleware"
	"github.com/a2ahub/identity-service/internal/repository"
	"github.com/a2ahub/identity-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

func main() {
	// 加载配置
	cfg, err := config.Load()
	if err != nil {
		logrus.Fatalf("Failed to load config: %v", err)
	}

	// 设置日志
	setupLogger(cfg.Server.Env)

	// 连接数据库
	db, err := database.NewPostgresDB(cfg.Database.GetDSN())
	if err != nil {
		logrus.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// 初始化数据库表结构
	if err := db.InitSchema(); err != nil {
		logrus.Fatalf("Failed to initialize schema: %v", err)
	}

	// 连接 Redis
	redis, err := database.NewRedisClient(cfg.Redis.GetRedisAddr(), cfg.Redis.Password, cfg.Redis.DB)
	if err != nil {
		logrus.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redis.Close()

	// 初始化仓库
	agentRepo := repository.NewAgentRepository(db)
	growthRepo := repository.NewGrowthRepository(db)
	dojoRepo := repository.NewDojoRepository(db)
	notificationRepo := repository.NewNotificationRepository(db)

	// 初始化服务
	agentService := service.NewAgentService(agentRepo, growthRepo, dojoRepo, notificationRepo, redis, cfg)

	// 初始化处理器
	agentHandler := handler.NewAgentHandler(agentService)

	// 设置路由
	router := setupRouter(cfg, redis, agentHandler, agentService)

	// 启动服务器
	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: router,
	}

	// 优雅关闭
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Failed to start server: %v", err)
		}
	}()

	logrus.Infof("Identity Service started on port %s", cfg.Server.Port)

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logrus.Fatalf("Server forced to shutdown: %v", err)
	}

	logrus.Info("Server exited")
}

// setupLogger 设置日志
func setupLogger(env string) {
	logrus.SetFormatter(&logrus.JSONFormatter{})
	logrus.SetOutput(os.Stdout)

	if env == "development" {
		logrus.SetLevel(logrus.DebugLevel)
		logrus.SetFormatter(&logrus.TextFormatter{
			FullTimestamp: true,
		})
	} else {
		logrus.SetLevel(logrus.InfoLevel)
	}
}

// setupRouter 设置路由
func setupRouter(cfg *config.Config, redisClient *database.RedisClient, agentHandler *handler.AgentHandler, agentService service.AgentService) *gin.Engine {
	if cfg.Server.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// 全局中间件
	rateLimiter := middleware.NewRateLimiter(cfg.Security.RateLimitPerMinute, time.Minute)
	router.Use(middleware.RateLimitMiddleware(rateLimiter))

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API v1
	v1 := router.Group("/api/v1")
	{
		admin := v1.Group("/admin")
		{
			admin.GET("/agents", agentHandler.ListAgents)
			admin.PATCH("/agents/status", agentHandler.UpdateAgentStatus)
			admin.PATCH("/agents/:aid/status", agentHandler.UpdateAgentStatus)
			admin.GET("/agent-growth/overview", agentHandler.GetGrowthOverview)
			admin.GET("/agent-growth/agents", agentHandler.ListGrowthProfiles)
			admin.POST("/agent-growth/evaluate", agentHandler.EvaluateGrowthProfile)
			admin.POST("/agent-growth/agents/:aid/evaluate", agentHandler.EvaluateGrowthProfile)
			admin.GET("/dojo/overview", agentHandler.GetAdminDojoOverview)
			admin.GET("/dojo/coaches", agentHandler.ListDojoCoaches)
			admin.GET("/dojo/bindings", agentHandler.ListDojoBindings)
			admin.POST("/dojo/agents/:aid/assign-coach", agentHandler.AssignDojoCoach)
		}

		agents := v1.Group("/agents")
		{
			// 公开接口
			agents.POST("/register", agentHandler.Register)
			agents.POST("/email/register/request-code", agentHandler.RequestEmailRegistrationCode)
			agents.POST("/email/register/complete", agentHandler.CompleteEmailRegistration)
			agents.POST("/email/login/request-code", agentHandler.RequestEmailLoginCode)
			agents.POST("/email/login/complete", agentHandler.CompleteEmailLogin)
			agents.POST("/challenge", agentHandler.IssueLoginChallenge)
			agents.POST("/login", agentHandler.Login)
			agents.POST("/verify", agentHandler.Verify)
			if cfg.Dev.BootstrapEnabled {
				agents.POST("/dev/bootstrap", agentHandler.DevBootstrap)
				agents.POST("/dev/session", agentHandler.DevSession)
			}
			agents.GET("/:aid", agentHandler.GetAgent)
			agents.GET("/:aid/reputation", agentHandler.GetReputation)

			// 需要认证的接口
			authenticated := agents.Group("")
			authenticated.Use(middleware.AuthMiddleware(cfg, redisClient))
			{
				authenticated.GET("/me", agentHandler.GetCurrentAgent)
				authenticated.GET("/me/growth", agentHandler.GetCurrentGrowthProfile)
				authenticated.POST("/refresh", agentHandler.Refresh)
				authenticated.POST("/logout", agentHandler.Logout)
				authenticated.PUT("/me/profile", agentHandler.UpdateProfile)
				authenticated.POST("/:aid/reputation", agentHandler.UpdateReputation)
			}
		}

		dojo := v1.Group("/dojo")
		dojo.Use(middleware.AuthMiddleware(cfg, redisClient))
		{
			dojo.GET("/me/overview", agentHandler.GetDojoOverview)
			dojo.GET("/me/diagnostic", agentHandler.GetCurrentDojoDiagnostic)
			dojo.POST("/diagnostics/start", agentHandler.StartDojoDiagnostics)
			dojo.POST("/diagnostics/submit", agentHandler.SubmitDojoDiagnostics)
			dojo.GET("/me/mistakes", agentHandler.ListDojoMistakes)
			dojo.GET("/me/remediation-plans", agentHandler.ListDojoRemediationPlans)
		}
	}

	return router
}
