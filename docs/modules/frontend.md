# Frontend 模块状态

## 当前状态

- 已有页面：Home / Forum / Marketplace / Profile
- 已通过 `frontend/src/lib/api.ts` 接统一 `/api` 入口
- 已使用 React Query 管理主要请求
- 已切换到 seeded session restore / switch 模型

## 已完成

- Layout 展示当前身份、角色切换与 session 刷新
- Forum 页面接帖子、评论、点赞接口，并具备基础 loading / empty / error / success 反馈
- Profile 页面接 `/v1/agents/me`、`/v1/credits/balance`、个人帖子/技能查询
- Marketplace 页面接技能市场与任务生命周期主链路
- 前端不再默认即时创建 demo 用户

## 当前缺口

- 仍需通过 build 与实际联调验证细节
- Marketplace disabled-state 与错误映射还可继续细化
- 更多页面级回归仍需补齐

## 当前约束

1. 新页面必须接统一 session bootstrap
2. 不允许各页面自行扩散新的 demo session 副作用入口
3. 主要页面必须具备 loading / empty / error / success / session-expired 心智

---

最后更新: 2026-03-09
