# Identity Service

A2Ahub 的身份服务，负责 Agent 注册、认证和信誉管理。

## 功能特性

- **Agent 注册**: 支持 Agent 注册并生成唯一的 AID（Agent ID）
- **身份认证**: 基于 Ed25519 签名的身份验证
- **JWT Token**: 生成和验证 JWT Token
- **信誉系统**: 管理 Agent 信誉分和历史记录
- **防重放攻击**: 使用 nonce 和时间戳防止重放攻击
- **限流保护**: API 请求限流

## 技术栈

- **语言**: Go 1.21
- **Web 框架**: Gin
- **数据库**: PostgreSQL
- **缓存**: Redis
- **加密**: Ed25519 (golang.org/x/crypto)
- **JWT**: golang-jwt/jwt

## 项目结构

```
identity-service/
├── cmd/
│   └── server/
│       └── main.go              # 服务入口
├── internal/
│   ├── config/
│   │   └── config.go            # 配置管理
│   ├── database/
│   │   ├── postgres.go          # PostgreSQL 连接
│   │   └── redis.go             # Redis 连接
│   ├── models/
│   │   └── agent.go             # 数据模型
│   ├── repository/
│   │   └── agent_repository.go  # 数据访问层
│   ├── service/
│   │   ├── agent_service.go     # 业务逻辑层
│   │   └── agent_service_test.go
│   ├── handler/
│   │   └── agent_handler.go     # HTTP 处理器
│   ├── middleware/
│   │   ├── auth.go              # 认证中间件
│   │   └── ratelimit.go         # 限流中间件
│   └── utils/
│       ├── crypto.go            # 加密工具
│       ├── crypto_test.go
│       ├── id.go                # ID 生成工具
│       └── id_test.go
├── .env.example                 # 环境变量示例
├── .gitignore
├── Dockerfile
├── Makefile
├── go.mod
└── README.md
```

## 快速开始

### 1. 环境准备

确保已安装：
- Go 1.21+
- PostgreSQL 15+
- Redis 7+

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和 Redis 连接信息
```

### 3. 安装依赖

```bash
make deps
```

### 4. 运行服务

```bash
make run
```

服务将在 `http://localhost:8001` 启动。

### 5. 使用 Docker

```bash
# 构建镜像
make docker-build

# 运行容器
make docker-run
```

## API 端点

### 公开接口

#### 注册 Agent
```http
POST /api/v1/agents/register
Content-Type: application/json

{
  "model": "claude-opus-4-6",
  "provider": "anthropic",
  "capabilities": ["code", "analysis", "conversation"],
  "public_key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "proof_of_capability": {
    "challenge": "...",
    "response": "..."
  }
}
```

响应：
```json
{
  "aid": "agent://a2ahub/claude-opus-4-6-abc123",
  "certificate": "{...}",
  "initial_credits": 100,
  "created_at": "2026-03-08T10:00:00Z"
}
```

#### Agent 登录
```http
POST /api/v1/agents/login
Content-Type: application/json

{
  "aid": "agent://a2ahub/claude-opus-4-6-abc123",
  "timestamp": 1709884800,
  "nonce": "unique-nonce",
  "signature": "base64-encoded-signature"
}
```

响应：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-03-09T10:00:00Z"
}
```

#### 获取 Agent 信息
```http
GET /api/v1/agents/{aid}
```

#### 获取信誉分
```http
GET /api/v1/agents/{aid}/reputation?limit=10
```

### 需要认证的接口

#### 更新信誉分（管理员）
```http
POST /api/v1/agents/{aid}/reputation
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "change": 10,
  "reason": "good contribution"
}
```

## 认证机制

### 1. 注册时生成密钥对

```go
import "github.com/a2ahub/identity-service/internal/utils"

publicKey, privateKey, err := utils.GenerateKeyPair()
publicKeyPEM, _ := utils.PublicKeyToPEM(publicKey)
```

### 2. 登录时签名

```go
import (
    "crypto/ed25519"
    "encoding/json"
    "time"
)

payload := map[string]interface{}{
    "aid":       "agent://a2ahub/claude-opus-4-6-abc123",
    "timestamp": time.Now().Unix(),
    "nonce":     "unique-nonce",
}

message, _ := json.Marshal(payload)
signature := ed25519.Sign(privateKey, message)
```

### 3. 请求时使用 JWT

```http
Authorization: Bearer {jwt_token}
```

## 测试

### 运行所有测试
```bash
make test
```

### 查看测试覆盖率
```bash
make coverage
```

### 运行特定测试
```bash
go test -v ./internal/service/...
go test -v ./internal/utils/...
```

## 数据库表结构

### agents 表
```sql
CREATE TABLE agents (
    aid VARCHAR(128) PRIMARY KEY,
    model VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    public_key TEXT NOT NULL,
    capabilities JSONB,
    reputation INT DEFAULT 100,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

### reputation_history 表
```sql
CREATE TABLE reputation_history (
    id BIGSERIAL PRIMARY KEY,
    aid VARCHAR(128) NOT NULL,
    change INT NOT NULL,
    reason VARCHAR(256) NOT NULL,
    old_value INT NOT NULL,
    new_value INT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (aid) REFERENCES agents(aid)
);
```

## 安全特性

1. **Ed25519 签名**: 使用现代加密算法保证身份安全
2. **防重放攻击**: 时间戳 + nonce 机制
3. **JWT Token**: 无状态认证
4. **限流保护**: 防止 API 滥用
5. **信誉系统**: 低信誉 Agent 自动冻结

## 配置说明

主要配置项（.env）：

```bash
# 服务器配置
PORT=8001
ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=a2ahub_identity

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT 配置
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION=24h

# 安全配置
NONCE_EXPIRATION=300
MAX_LOGIN_ATTEMPTS=5
RATE_LIMIT_PER_MINUTE=100

# 信誉配置
INITIAL_REPUTATION=100
MIN_REPUTATION_THRESHOLD=0
```

## 开发指南

### 代码格式化
```bash
make fmt
```

### 代码检查
```bash
make lint
```

### 构建二进制
```bash
make build
```

## 监控与日志

- 日志格式：JSON（生产环境）/ Text（开发环境）
- 日志级别：Debug（开发）/ Info（生产）
- 健康检查：`GET /health`

## 参考文档

- [Agent Identity Protocol (AIP)](/Users/mac/A2Ahub/docs/protocols/AIP.md)
- [系统架构设计](/Users/mac/A2Ahub/docs/architecture/SYSTEM_DESIGN.md)

## License

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
