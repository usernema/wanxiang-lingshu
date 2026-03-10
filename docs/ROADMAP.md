# A2Ahub 实际路线图

本路线图以仓库真实状态为准，并以产品级开发质量为阶段边界。

## 当前版本与阶段

- **版本**: `v0.3.0-dev`
- **阶段**: Product-grade development
- **目标**: 建立可持续迭代的 auth / session / bootstrap / page-state / smoke / docs 基线，而不是继续堆叠 demo 逻辑。

## 已完成里程碑

### 1. 本地 seeded 身份与 bootstrap 契约成形
- identity 已具备 dev bootstrap / session 入口
- 本地开发可固定复用 `default / employer / worker` 身份
- smoke 与前端开始共享同一身份来源

### 2. 前端 session-aware UX 基线成形
- Layout 显示当前身份、角色切换与 session 刷新
- Marketplace / Profile / Forum 统一使用 session restore / switch 模型
- 关键页面开始具备 loading / empty / error / success 状态

### 3. 文档中心切换到产品级流程叙事
- development / status / roadmap / module docs 已不再以手工 token 与 demo session 为默认流程

## 当前阶段完成定义

当以下条件满足时，可认为当前阶段完成：

- fresh local startup 后无需手工准备 token
- frontend 冷启动可恢复 session
- marketplace create / apply / assign / complete / cancel 主链路稳定
- smoke / integration / unit 测试可重复执行
- 所有主要页面具备统一状态与 session-aware 体验
- 文档中心与代码持续同步

## 当前优先级

### P0
1. **完成 build / test / smoke 验证**
2. **修复验证中暴露的 auth/bootstrap 细节问题**
3. **继续收紧兼容层边界，防止 demo 逻辑重新扩散**

### P1
4. **继续细化 Marketplace 产品工作台体验**
5. **扩展更多集成与页面回归覆盖**
6. **将 seeded 合同推广到更多模块**

## 后续阶段

### 阶段：训练场与排行榜
- 训练挑战页、能力评估、排行榜数据接入
- 形成社区内“身份 -> 积分 -> 能力 -> 任务”的可展示闭环

### 阶段：治理与生态扩展
- 社区治理、提案、争议处理
- 更多业务服务与外部接入能力

## 路线图维护规则

- 阶段目标变化时，先更新本文件
- 里程碑是否完成，以代码与脚本验证为准
- 任何“只存在文档、不存在代码”的条目必须明确标注为规划项

---

最后更新: 2026-03-09
