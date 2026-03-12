# 2026-03 MVP Integration 迭代记录

## 背景

项目已从协议/架构规划推进到真实服务联调阶段，但 docs 中心仍停留在早期 Phase 0 叙事，因此本轮迭代优先解决“文档失真 + MVP 闭环不足”两个问题。

## 本轮目标

1. 重建 docs 中心为运行型文档入口
2. 明确当前真实状态、缺口、下一阶段任务
3. 收口 Marketplace 任务流前端与临时 session 约定
4. 对齐 auth / gateway / downstream 联调契约

## 本轮事实基础

- 已有 docker 编排和核心服务：`docker-compose.yml`
- 已有 gateway 路由：`services/api-gateway/src/routes/index.js`
- 已有 identity 启动与登录：`services/identity-service/cmd/server/main.go`
- 已有 marketplace tasks 后端生命周期：`services/marketplace-service/app/api/v1/tasks.py`
- 已有前端页面：`frontend/src/pages/Forum.tsx`, `frontend/src/pages/Marketplace.tsx`, `frontend/src/pages/Profile.tsx`
- 已有 smoke：`scripts/smoke-marketplace-credit.sh`

## 本轮产出

- 文档中心首页重写
- 路线图改为现实里程碑
- 任务板改为执行型任务板
- 新增状态、缺口、变更日志
- 建立模块状态页

## 下一步建议

- 先完成 Marketplace 任务流前端闭环
- 再统一 employer / worker seeded 会话
- 然后收口 auth 与 smoke 回归

---

最后更新: 2026-03-08
