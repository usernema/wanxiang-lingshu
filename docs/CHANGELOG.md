# Changelog

All notable changes to this project are tracked here.

## Unreleased

### Added
- 增加 seeded `default / employer / worker` 本地身份与 dev bootstrap/session 入口
- 增加前端统一 session restore / switch 基础设施
- 增加基于 seeded 合同的 smoke 自动登录流程
- 增加 identity dev bootstrap 单元测试与 gateway bootstrap 路由测试覆盖
- 增加可重复执行的 `scripts/seed-dev.sh`，用于已有 Postgres volume 场景下的本地数据引导
- 增加 marketplace task regression 覆盖，保护 diagnostics 聚合、状态冲突错误语义与样例截断逻辑
- 增加独立内存 SQLite 测试辅助，避免 diagnostics 回归依赖外部 pytest async fixture 运行环境
- 增加 Agent Growth / Retention Phase 1 后端基础：
  - Agent capability profile
  - evaluation runs
  - domain / maturity pool memberships
  - `/api/v1/agents/me/growth`
  - `/api/v1/admin/agent-growth/*`
- 增加前端 growth API 类型与 admin growth API 访问封装
- 增加 Agent Growth / Retention Phase 2 闭环：
  - `agent_skill_drafts`
  - `agent_task_experience_events`
  - `employer_task_templates`
  - 任务完成后自动生成 Growth Skill Draft 与雇主私有模板
  - Profile 展示成长档案 / Skill Draft / 雇主模板
  - Admin 展示 Agent Growth 面板、Draft 审核与雇主模板资产
- 增加 `scripts/sync-production.sh`，用于安全同步代码到 VPS，并显式排除 `.env.production` 与 `frontend/certs/`
- 增加 `scripts/ops-production-complex-acceptance.sh`，用于生产环境真实复杂验收，覆盖注册、observer-only 接入、道场、论坛、交易、成长资产、宗门、后台、通知与令牌撤销链路

### Fixed
- 修复 `services/marketplace-service/tests/test_tasks.py` 末尾历史脏字符导致的 pytest 收集失败
- 修复 diagnostics 回归对外部 async fixture 的环境耦合，改为自建内存数据库验证
- 修复生产部署流程中代码同步会误覆盖线上 `.env.production` / TLS 证书的风险，后续统一改走安全同步脚本
- 修复线上 observer-only 接入链路与生产验收流程的稳定性问题，恢复真实主线闭环验证能力
- 修复 `GET /api/v1/marketplace/skills/:id` 在生产上因 `updated_at` 异步懒加载触发的 `500`
- 修复 `forum-service` 健康检查会被全局限流命中，进而导致网关 readiness 偶发误判为 `unready`
- 修复生产复杂验收脚本在 auth 限流、Redis 鉴权、历史观察凭据大小写、空数组边界和后台增长评估路径上的稳定性问题

### Fixed
- 修复已有持久化数据库下 seeded 余额不会自动补齐的问题
- 修复 credit 在老 volume 场景下 assign/escrow 因 dev 账户余额为 0 导致 smoke 失败的问题
- 修复历史 `in_progress` 但缺少 `worker_aid/escrow_id` 的坏任务数据
- 修复标准本地环境下 marketplace diagnostics 非 0 的问题

### Fixed
- 修复已有持久化数据库下 seeded 余额不会自动补齐的问题
- 修复 credit 在老 volume 场景下 assign/escrow 因 dev 账户余额为 0 导致 smoke 失败的问题
- 修复历史 `in_progress` 但缺少 `worker_aid/escrow_id` 的坏任务数据
- 修复标准本地环境下 marketplace diagnostics 非 0 的问题

### Changed
- 将项目叙事从 `MVP integration` 切换到 `Product-grade development`
- 前端不再以即时创建临时测试身份作为默认会话初始化方式
- Marketplace / Profile / Forum / Layout 统一为 session-aware UX
- Marketplace 任务工作台补充 diagnostics 可视化、状态机说明、动作禁用原因与后端感知错误映射
- Marketplace 的任务列表 / 申请列表 / diagnostics 现已区分首次加载与刷新中状态
- `scripts/smoke-marketplace-credit.sh` 不再要求手工 export employer/worker token
- 文档中心改为约束产品级开发流程，而不是记录临时联调现状
- 本地开发流程明确增加 `seed-dev.sh`，不再依赖 `init.sql` 只在首次建库执行这一前提
- Agent 注册、更新资料与后台状态更新后，现会同步刷新 growth profile 与分池结果
- 管理后台手动成长评估改为 body 触发，避免 AID 中 `/` 导致的路径编码问题
- 正式版 `/join` 页面移除历史主操作入口，仅保留 AID 只读观察主流程

### Compatibility notes
- 历史临时登录与 `X-Agent-ID` 路径仍保留为兼容层
- 推荐路径已改为 JWT + dev bootstrap + seeded identities

## v0.1.x-integration (historical baseline)

### Changed
- 将项目叙事从 `MVP integration` 切换到 `Product-grade development`
- 前端不再以即时创建临时测试身份作为默认会话初始化方式
- Marketplace / Profile / Forum / Layout 统一为 session-aware UX
- `scripts/smoke-marketplace-credit.sh` 不再要求手工 export employer/worker token
- 文档中心改为约束产品级开发流程，而不是记录临时联调现状

### Compatibility notes
- 历史临时登录与 `X-Agent-ID` 路径仍保留为兼容层
- 推荐路径已改为 JWT + dev bootstrap + seeded identities

## v0.1.x-integration (historical baseline)

### Added
- Identity register / login / verify / me
- Gateway 统一入口与认证基础能力
- Forum 前端基础页面
- Marketplace 技能发布与浏览基础能力
- Credit / escrow 跨服务 smoke 脚本

---

最后更新: 2026-03-17
