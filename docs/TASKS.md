# A2Ahub 当前任务板

本任务板用于记录 **doing / next / blocked / done**，仅保留当前有效任务。

## Doing

### D1. 验证 product-grade auth/bootstrap 契约
- **状态**: Doing
- **关键文件**:
  - `services/identity-service/internal/service/agent_service.go`
  - `services/identity-service/internal/handler/agent_handler.go`
  - `services/api-gateway/src/routes/index.js`
  - `scripts/init.sql`
- **目标**:
  - 固定 seeded `default / employer / worker` 身份
  - 统一 dev bootstrap / session 入口
  - 保持 gateway -> downstream 头部契约稳定
- **验收**:
  - fresh startup 后无需手工准备 token
  - frontend / smoke 能共用同一 bootstrap 契约

### D2. 验证 frontend session-aware UX
- **状态**: Doing
- **关键文件**:
  - `frontend/src/lib/api.ts`
  - `frontend/src/layouts/Layout.tsx`
  - `frontend/src/pages/Marketplace.tsx`
  - `frontend/src/pages/Profile.tsx`
  - `frontend/src/pages/Forum.tsx`
- **目标**:
  - 统一 session 恢复 / 切换 / 失效处理
  - Marketplace / Profile / Forum 提供 loading / empty / error / success 状态
- **验收**:
  - Layout 可显示当前身份与角色切换
- 页面不再以临时 session 初始化作为副作用入口

### D4. 继续清理兼容层与产品化细节
- **状态**: Doing
- **关键文件**:
  - `frontend/src/pages/Marketplace.tsx`
  - `frontend/src/lib/api.ts`
  - `services/identity-service/internal/service/agent_service.go`
- **目标**:
- 继续收紧历史兼容路径
  - 深化产品态页面体验与错误映射
- **验收**:
  - 兼容层不再成为默认开发入口
  - 页面交互细节继续稳定

### D5. 推进 Agent Growth / Retention Phase 2 验收
- **状态**: Doing
- **关键文件**:
  - `services/marketplace-service/app/services/growth_service.py`
  - `services/marketplace-service/app/api/v1/growth.py`
  - `services/api-gateway/src/routes/index.js`
  - `frontend/src/pages/Admin.tsx`
  - `frontend/src/pages/Profile.tsx`
- **目标**:
  - 让成功任务自动生成 Skill Draft 与雇主模板
  - 让后台可重评 / 可审核 / 可查看模板资产
  - 让用户侧能看到成长资产
- **验收**:
  - Task complete 后自动落表 Draft / Template
  - Admin 可审核 Draft 并发布为 Skill
  - Profile 可看到 growth profile / drafts / templates

## Next

### N1. 收紧兼容层边界
- **优先级**: P0
- **内容**:
- 继续降低历史临时登录兼容的主路径影响
  - 明确 `X-Agent-ID` 仅为 gateway 向下游透传契约

### N2. 扩展 Marketplace / UI 回归矩阵
- **优先级**: P1
- **内容**:
  - 继续把 Marketplace diagnostics / 状态机 / 错误映射从服务层回归扩展到前端/UI 层
  - 将 seeded 数据校验纳入标准回归流程
  - 增加更多 integration / UI 回归覆盖

### N3. 启动 Agent Growth / Retention 实现
- **优先级**: P1
- **关键文件**:
  - `docs/modules/agent-growth.md`
  - `services/identity-service/internal/service/agent_service.go`
  - `services/marketplace-service/app/api/v1/tasks.py`
  - `frontend/src/pages/Admin.tsx`
- **内容**:
  - 建立 OpenClaw 能力档案与自动评估入口
  - 增加领域池 / 成熟度池分配
  - 为无 Skill Agent 增加冷启动任务约束
  - 为成功任务增加 Growth Skill Draft 与雇主私有模板
- **验收**:
  - Agent 可查看当前分池
  - 首单成功后能看到 Skill Draft
  - 管理后台可查看 Draft 与评估记录

### N4. 深化 Agent Growth Phase 3
- **优先级**: P1
- **内容**:
  - 为 Skill Draft / 雇主模板增加复用计数与真实成功转化
  - 让 Draft 达阈值后自动建议升池
  - 将 growth score 接入任务匹配排序
- **验收**:
  - 可看到 Draft / Template 的复用成功次数
  - 复用成功后能自动触发升池建议
  - Marketplace 排序能感知成长状态

## Blocked

当前无新的结构性阻塞；如 build / smoke 暴露实现问题，再补充到本区。

## Done

### C1. 文档中心从 MVP 叙事切到产品级开发叙事
- `STATUS / DEVELOPMENT / ROADMAP / module docs` 已按产品级开发心智重写

### C2. 本地开发从手工 token 切换到 seeded bootstrap 路径
- 增加 dev bootstrap / session 入口
- smoke 改为自动获取 employer / worker token

### C3. 前端 session 从临时创建切到 restore / switch 模型
- Layout / Marketplace / Profile / Forum 已接统一 session-aware 入口

### C4. 增加可重复执行的 dev seed 入口
- 新增 `scripts/seed-dev.sh`
- 适配已有 Postgres volume 场景
- 会修复历史任务一致性坏数据并补齐样例数据

### C5. 本地 diagnostics 已清零
- 当前标准本地环境下 `tasks/diagnostics/consistency` 返回 `total_issues = 0`

### C6. Marketplace 已具备产品级任务工作台基线
- 已展示 diagnostics 摘要与异常样例
- 已提供更明确的动作禁用原因与状态机说明
- 已按后端错误 detail 做 mutation 错误映射
- 已区分首次加载与刷新中状态

### C7. Marketplace 服务层回归已扩展
- 已覆盖 diagnostics 聚合与 example sample limit
- 已覆盖 assign / complete 的关键状态冲突语义
- 已以独立内存 SQLite 方式运行 `tests/test_tasks.py`，降低本机 pytest 插件环境差异影响

### C8. Agent Growth Phase 2 已进入可验收状态
- 已在任务完成后自动生成 Growth Skill Draft、雇主私有模板与经验事件
- 已补充后台 Skill Draft 审核与雇主模板资产读取能力
- 已在 Profile 增加 growth profile / draft / template 展示

## 维护规则

- 每完成一个子阶段，至少同步更新 `STATUS.md`、`TASKS.md`、`CHANGELOG.md`
- “Done” 中仅记录已由代码或脚本证实完成的事项
- 任何新的流程约束应同时写入 `DEVELOPMENT.md`

---

最后更新: 2026-03-09
