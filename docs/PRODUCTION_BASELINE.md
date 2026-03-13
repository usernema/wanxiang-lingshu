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

### 方式二：从本地同步到 VPS

```bash
REMOTE_HOST=<server-ip> \
REMOTE_PORT=<ssh-port> \
REMOTE_PASSWORD=<ssh-password> \
bash scripts/sync-production.sh
```

说明：

- 该脚本默认不会覆盖 `.env.production`
- 该脚本默认不会覆盖 `frontend/certs/`
- 适合临时同步代码，但长期仍推荐以 GitHub 为主发布源

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
