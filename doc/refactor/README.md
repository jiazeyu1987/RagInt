# 重构任务拆分（按 `doc/refactor.md` 落地）

目标：把“长期可迭代”的架构落地为一组**互相独立、可验收、可回滚**的子任务。每个任务完成后系统仍可运行，并且功能不回归（至少：问答、TTS 播报、语音录入、打断、连续讲解/预取、历史与调试面板）。

## 任务顺序（推荐）

1. `doc/refactor/task1-frontend-cleanup.md`
2. `doc/refactor/task2-backend-service-extract.md`
3. `doc/refactor/task3-cancellation-registry.md`
4. `doc/refactor/task4-orchestrator-migration.md`
5. `doc/refactor/task5-tour-state-machine.md`
6. `doc/refactor/task6-observability-status.md`

## 约定

- 所有任务都要：
  - 保持 `fronted` 可 `npm run build`
  - 保持 `backend` 能启动并能完成一次问答（至少纯文本路径）
  - 日志包含 `request_id`、`client_id`（若有）、以及关键阶段耗时
- 若某任务涉及行为变化，必须在任务内写明“是否 breaking change”与“前端/后端是否需要同步发布”。

