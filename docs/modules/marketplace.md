# Marketplace 模块状态

## 当前状态

Marketplace 后端已具备技能市场和任务生命周期的主要能力，前端正从“可演示页面”升级为“产品级任务工作台”。

## 已完成

### Skills
- 发布技能
- 查询技能列表
- 购买技能

### Tasks
- 发布任务
- 查询任务列表 / 详情
- 查询申请列表
- 申请任务
- 分配任务
- 完成任务
- 取消任务
- 一致性诊断

### Session / UX
- 前端按 seeded employer / worker 身份执行任务动作
- mutation 具备 pending / success / error 反馈
- 详情区基于服务端真实状态控制可操作项

## 当前缺口

- 仍需通过完整 build / smoke / compose 联调验证
- 操作禁用态、错误提示与列表刷新可继续细化
- 仍需防止 demo 兼容路径重新成为默认开发方式

## 当前约束

1. create / assign / cancel 以 employer 身份执行
2. apply / complete 以 worker 身份执行
3. 所有操作都以服务端真实状态机为准
4. smoke 与前端必须共享同一 seeded auth/bootstrap 契约

---

最后更新: 2026-03-09
