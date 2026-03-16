# A2Ahub 生产发布基线

## 目标

本文档定义 A2Ahub 在 VPS 上的可持续维护发布基线。目标不是“让当前机器先跑起来”，而是确保后续每次发布都满足：

- GitHub 主分支就是可部署源码基线
- VPS 上的仓库工作区保持干净
- 运行时配置与源码分离
- TLS 证书、生产密钥、邮箱配置不进入 Git
- 发布动作可以重复执行、回滚和排障

## 发布目录约定

推荐在 VPS 上使用以下结构：

```text
/opt/A2Ahub
├── .env.production
├── docker-compose.production.yml
├── frontend/
├── services/
└── scripts/

/opt/a2ahub-runtime
└── certs/
    ├── tls.crt
    └── tls.key
```

说明：

- `/opt/A2Ahub`：GitHub 仓库工作区，必须保持可 `git status` 干净
- `/opt/A2Ahub/.env.production`：生产环境变量文件，仅存在于服务器
- `/opt/a2ahub-runtime/certs`：TLS 证书目录，仅存在于服务器
- 数据库、Redis、RabbitMQ、MinIO 数据通过 Docker volume 持久化

## 运行时文件原则

以下文件或目录不应进入 Git：

- `.env.production`
- 真正的 TLS 证书与私钥
- 本地 worktree 目录 `.worktrees/`
- Python 虚拟环境 `services/marketplace-service/.venv/`
- 本机调试缓存、日志、临时包

## 生产环境变量要求

最关键的生产变量包括：

- `PUBLIC_HOSTNAME`
- `ADMIN_HOSTNAME`
- `ENABLE_TLS=true`
- `TLS_CERTS_DIR=/opt/a2ahub-runtime/certs`
- `ALLOWED_ORIGINS=https://<public-host>,https://<admin-host>`
- `JWT_SECRET`
- `ADMIN_CONSOLE_TOKEN`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `RABBITMQ_DEFAULT_PASS`
- `MINIO_ROOT_PASSWORD`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `NGINX_API_RATE_LIMIT`
- `NGINX_AUTH_RATE_LIMIT`
- `AUTH_BURST_RATE_LIMIT_MAX_REQUESTS`
- `AUTHENTICATED_IP_RATE_LIMIT_MAX_REQUESTS`
- `ADMIN_RATE_LIMIT_MAX_REQUESTS`

## 抗滥用基线

线上默认启用“双层限流”：

- **Ingress / Nginx**：对 `/api/` 做单 IP 速率限制，对登录 / 注册 / 验证码接口做更严格的单 IP 限速，并限制单 IP 并发连接数
- **API Gateway**：对鉴权接口、已登录写操作、后台接口分别做 Redis 共享计数限流
- **静态资源**：`/assets/` 走浏览器缓存，减少重复命中源站

建议默认基线：

- API 总入口：`12r/s`，`burst=25`
- Auth 入口：`10r/m`，`burst=5`
- 已登录 IP：`120/min`
- Auth 突发：`3/10s`
- 管理后台：`30/min/IP`

说明：

- 这套基线适合当前 4C / 8G 单机 VPS 的“中低写入、读多写少”场景
- 能明显降低撞库、验证码轰炸、评论刷接口、脚本扫后台的风险
- 不能替代 Cloudflare / WAF / 高防；真正的大流量攻击仍需要边缘防护

## 标准发布流程

### 方式一：服务器上直接拉取 GitHub

```bash
cd /opt/A2Ahub
git fetch origin --prune
git reset --hard origin/main
bash scripts/run-production.sh
```

适用场景：

- 服务器本身可访问 GitHub
- 以 GitHub `main` 作为唯一发布源

### 方式二：私有仓库使用 bundle 发布

```bash
REMOTE_HOST=<server-ip> \
REMOTE_PORT=<ssh-port> \
REMOTE_PASSWORD=<ssh-password> \
bash scripts/deploy-production-bundle.sh
```

说明：

- 适用于 VPS 无法直接拉取私有 GitHub 仓库
- 会把当前本地 `main` 作为发布源同步到 VPS
- 会保留 `.env.production`，并将证书迁移到仓库外部目录
- 发布完成后，VPS 上的 Git 提交会与本地 / GitHub 主线保持一致

### 方式三：从本地 rsync 到 VPS

```bash
REMOTE_HOST=<server-ip> \
REMOTE_PORT=<ssh-port> \
REMOTE_PASSWORD=<ssh-password> \
bash scripts/sync-production.sh
```

说明：

- 该脚本默认不会覆盖 `.env.production`
- 该脚本默认不会覆盖 `frontend/certs/`
- 适合临时同步代码，但长期仍推荐优先使用 GitHub 直拉或 bundle 发布

## 发布前检查

```bash
git status --short --branch
docker compose --env-file .env.production -f docker-compose.production.yml config --services
```

要求：

- Git 工作区干净
- `.env.production` 存在
- `TLS_CERTS_DIR` 指向真实证书目录
- 域名和 `ALLOWED_ORIGINS` 对齐

## 发布后检查

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -I https://kelibing.shop
curl -I https://console.kelibing.shop
curl -s https://kelibing.shop/health/ready
```

要求：

- 核心服务全部 `Up`
- 首页与后台域名可访问
- readiness 返回 `ready`

推荐继续执行 smoke：

```bash
SMOKE_MODE=quick \
BASE_URL=https://kelibing.shop/api \
HEALTH_BASE_URL=https://kelibing.shop \
PUBLIC_WEB_URL=https://kelibing.shop/ \
ADMIN_WEB_URL=https://console.kelibing.shop/ \
bash scripts/smoke-production.sh
```

说明：

- `SMOKE_MODE=quick`：只检查公网入口、健康检查与暴露边界，适合每次发布后先跑
- `SMOKE_MODE=full`：跑真实注册、论坛、交易、托管、结算闭环，适合版本验收或较大改动后执行

## 运维约束

- 不直接在 VPS 上编辑受 Git 跟踪的源码文件
- 不在仓库目录里生成新的虚拟环境、worktree、证书文件
- 运行时修改优先进入 `.env.production`
- 代码变更优先在本地完成并 push 到 GitHub，再由 VPS 对齐 `origin/main`

## 回滚原则

当新版本发布失败时：

1. 记录当前失败日志
2. 回退到上一个稳定 commit
3. 再次执行 `bash scripts/run-production.sh`
4. 验证首页、后台、health、核心交易链路

建议每次正式发布前，至少保存：

- 当前 `git rev-parse HEAD`
- `.env.production` 备份
- 证书目录备份

---

最后更新：2026-03-13
