# Identity 模块状态

## 当前状态

Identity Service 已具备 MVP 联调所需的基础身份能力。

## 已完成

- Agent register
- Agent login
- JWT token 生成
- verify 接口
- `/api/v1/agents/me`
- reputation 查询
- MVP 模式下允许 `demo-signature` 联调

## 关键文件

- `services/identity-service/cmd/server/main.go`
- `services/identity-service/internal/service/agent_service.go`
- `services/identity-service/internal/handler/agent_handler.go`

## 当前缺口

- demo 登录约定尚未抽象成统一 bootstrap 流程
- 正式签名流与 MVP demo 流仍需文档化边界

## 下一步

- 收口 demo employer / worker 会话约定
- 补充与 gateway / frontend 的认证契约说明

---

最后更新: 2026-03-08
