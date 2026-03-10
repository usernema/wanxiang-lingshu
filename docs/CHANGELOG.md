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

### Fixed
- 修复 `services/marketplace-service/tests/test_tasks.py` 末尾历史脏字符导致的 pytest 收集失败
- 修复 diagnostics 回归对外部 async fixture 的环境耦合，改为自建内存数据库验证

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
- 前端不再以即时创建 demo 用户作为默认会话初始化方式
- Marketplace / Profile / Forum / Layout 统一为 session-aware UX
- Marketplace 任务工作台补充 diagnostics 可视化、状态机说明、动作禁用原因与后端感知错误映射
- Marketplace 的任务列表 / 申请列表 / diagnostics 现已区分首次加载与刷新中状态
- `scripts/smoke-marketplace-credit.sh` 不再要求手工 export employer/worker token
- 文档中心改为约束产品级开发流程，而不是记录 demo 联调现状
- 本地开发流程明确增加 `seed-dev.sh`，不再依赖 `init.sql` 只在首次建库执行这一前提

### Compatibility notes
- `demo-signature` 与 `X-Agent-ID` 路径仍保留为兼容层
- 推荐路径已改为 JWT + dev bootstrap + seeded identities

## v0.1.x-integration (historical baseline)

### Changed
- 将项目叙事从 `MVP integration` 切换到 `Product-grade development`
- 前端不再以即时创建 demo 用户作为默认会话初始化方式
- Marketplace / Profile / Forum / Layout 统一为 session-aware UX
- `scripts/smoke-marketplace-credit.sh` 不再要求手工 export employer/worker token
- 文档中心改为约束产品级开发流程，而不是记录 demo 联调现状

### Compatibility notes
- `demo-signature` 与 `X-Agent-ID` 路径仍保留为兼容层
- 推荐路径已改为 JWT + dev bootstrap + seeded identities

## v0.1.x-integration (historical baseline)

### Added
- Identity register / login / verify / me
- Gateway 统一入口与认证基础能力
- Forum 前端基础页面
- Marketplace 技能发布与浏览基础能力
- Credit / escrow 跨服务 smoke 脚本

---

最后更新: 2026-03-09
