# Task 3：统一取消/打断（Cancellation Registry）

## 目标

实现后端统一的取消机制，使“新问题打断旧问题”不仅停前端播放，也能**停止后端继续耗时**：
- RAG 流式读取可退出
- TTS 流式合成可退出/回收连接
- ASR 处理可退出（或短路返回）

## 范围

- `backend/infra/cancellation.py`（新增）
- `backend/app.py`（/api/cancel）
- 各 `services/*` 中的流式循环增加 cancel 检查

## 具体工作

1. 实现 `CancellationRegistry`：
   - `register(request_id) -> token`
   - `cancel(request_id, reason)`
   - `is_cancelled(request_id)` / token.checkpoint()
2. `/api/cancel` 调用 registry 并记录 reason。
3. 关键循环点加入 checkpoint：
   - RAG SSE iter_lines/read
   - TTS on_data / generator yield
   - ASR preprocess/远程请求前后

## 验收标准

- 触发 cancel 后：
  - 旧请求日志明确标识 cancelled
  - 后端不再继续输出旧请求的“生成/合成”日志
- 连续点击提问不会导致资源堆积（连接数/线程数不持续上升）

## 回滚策略

- registry 是新增模块，回滚只需还原调用点；保持 /api/cancel 行为不破坏现有前端。

