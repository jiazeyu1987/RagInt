# Task 5：连续讲解状态机与预取策略独立

## 目标

把“展厅讲解（连续讲解/下一站/打断/继续/跳站/承接语）”变成可维护的状态机，并把预取策略可配置化：
- 不再依赖 App.js 的大量 if/else 拼接状态
- 允许根据“展厅时长/目标字数/人群画像”调整策略

## 范围

后端优先（建议）：
- `backend/orchestrators/tour_orchestrator.py`
- 可选新增 `/api/tour/plan`、`/api/tour/next` 等（若已存在则迁移）

前端配合：
- `fronted/src/managers/TourPipelineManager.js` 只做“调用后端 + 缓存预取结果”
- `fronted/src/managers/TtsQueueManager.js` 只负责播放队列，不承担 tour 决策

## 具体工作

1. 定义 tour 状态机：
   - idle / running / interrupted / ready
   - 事件：start / continue / next / prev / jump / interrupt / reset
2. 预取策略：
   - 并发上限、预取窗口、失败重试、超时
3. 承接语策略：
   - “上一站结束语 + 下一站开场”去重/压缩，避免重复感（你已反馈的问题）

## 验收标准

- 连续讲解从第 1 站到结束可完成（允许中途打断再继续）
- 站点衔接语不再明显重复
- 预取不会造成明显卡顿（必要时限流）

