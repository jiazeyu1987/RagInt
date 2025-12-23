# Task 6：可观测性收敛（timeline + /api/status）

## 目标

把目前分散的日志/调试信息收敛为“可查询的状态与统一指标”，便于现场调优与定位：
- 统一 timeline：submit→rag_first_chunk→rag_first_segment→tts_first_audio→tts_done
- 可选提供 `/api/status?request_id=...` 给前端调试面板使用

## 范围

- `backend/infra/metrics.py`（新增或规范化）
- `backend/app.py`（新增 status 路由）
- `fronted/src/components/DebugPanel.js`（如需要对接 status）

## 具体工作

1. 统一记录结构（建议 dict）：
   - timestamps（ms）、durations、errors、cancel_reason、queue_stats
2. status 路由返回：
   - 当前阶段、耗时、是否取消、错误（脱敏）
3. 前端 DebugPanel 展示（可选）：
   - 自动轮询（低频）或仅在 debug 开启时请求

## 验收标准

- 任意 request_id 可查到完整阶段与耗时
- 出错/取消能快速定位发生在 RAG/TTS/ASR 的哪一段

