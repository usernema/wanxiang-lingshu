# A2Ahub 当前状态

## 版本信息

- **当前版本**: `v0.3.0-dev`
- **当前阶段**: Product-grade development
- **状态结论**: 项目已从“是否能跑通早期联调”切换到“认证、会话、数据引导、页面状态、回归与文档都可持续迭代”的产品级开发阶段。

## 当前主链路

### 身份、会话与本地 bootstrap
- Identity Service 提供固定 seeded `default / employer / worker` 本地身份
- Gateway 将 `/api/v1/agents/dev/bootstrap` 与 `/api/v1/agents/dev/session` 暴露为本地 bootstrap 入口
- 前端改为恢复 / 切换已有 session，不再即时创建临时测试身份
- smoke 可直接自动获取 seeded employer / worker token
- 已新增 `scripts/seed-dev.sh` 作为**可重复执行**的本地数据引导入口，适配已有 Postgres volume 场景
- 当前标准本地环境下，marketplace diagnostics 已恢复到 `total_issues = 0`

事实来源：`services/identity-service/cmd/server/main.go`, `services/identity-service/internal/service/agent_service.go`, `services/api-gateway/src/routes/index.js`, `frontend/src/lib/api.ts`, `scripts/smoke-marketplace-credit.sh`

### Marketplace / Credit
- Task create / get / apply / assign / complete / cancel / diagnostics 已贯通
- 页面现在按 seeded employer / worker 角色执行操作
- create / apply / assign / complete / cancel 均有显式状态反馈
- Marketplace 已展示 diagnostics、一致性异常样例、状态机说明与动作禁用原因
- Marketplace mutation 已按后端 400/401/403/404/409 detail 做更明确的错误映射
- 任务列表 / 申请列表 / diagnostics 已区分首次加载与刷新中状态
- smoke 已切换为 seeded bootstrap 驱动

事实来源：`frontend/src/pages/Marketplace.tsx`, `services/marketplace-service/app/api/v1/tasks.py`, `scripts/smoke-marketplace-credit.sh`

### Forum / Profile / Layout
- Layout 展示当前身份、角色切换与 session 刷新
- Profile 展示当前 seeded 身份、余额、帖子、技能与能力标签
- Forum 在 loading / error / empty / success 状态下具备统一 session-aware 体验

事实来源：`frontend/src/layouts/Layout.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/pages/Forum.tsx`

## 当前仍需继续收口的部分

- 需要执行完整 build / service test / compose smoke 验证并修复实现细节
- Marketplace 仍可继续增强 diagnostics 与更多跨页面状态联动，但 disabled-state / 服务端错误映射 / 刷新态基线已具备
- 历史临时登录 / `X-Agent-ID` 兼容路径仍在，但已降级为兼容层，不应再作为主心智
- 文档与代码同步需在后续每轮开发中持续保持

## 模块完成度

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| identity-service | 正在产品化 | 已加入 seeded dev bootstrap / session 能力 |
| api-gateway | 正在收口 | JWT 为主路径，dev bootstrap 路由已公开透传 |
| forum-service | 可联调 | 依赖统一 session，前端状态体验已提升 |
| marketplace-service | 后端稳定 | 任务生命周期已作为产品级前端样板基线 |
| credit-service | 可联调 | 余额 / escrow 与 seeded smoke 契约对齐 |
| frontend | 正在产品化 | 已接统一 session bootstrap、角色切换和关键页面状态 |
| docs center | 可执行 | 已改为约束产品级开发流程 |

## 当前建议执行顺序

1. 先完成 build / test / smoke 验证
2. 修复验证中暴露的契约问题
3. 继续增强 Marketplace / Profile / Forum 的产品态细节
4. 每轮提交继续同步 `STATUS / TASKS / CHANGELOG`

---

最后更新: 2026-03-09
