# Task 2：后端 service 抽离（`app.py` 变薄）

## 目标

把 `backend/app.py` 中的核心能力按领域拆到 `backend/services/`，`app.py` 只负责：
- Flask 初始化、CORS、日志初始化
- 路由注册（handler 只做入参校验与调用 service/orchestrator）

## 范围

优先抽离（按依赖少→多排序）：
1. History（SQLite）
2. TTS（Bailian/DashScope）
3. ASR（多 provider）
4. RAG（chat + agent）

## 具体工作

1. 为每个领域建立 `services/*.py`，暴露清晰 API（不依赖 Flask request 对象）。
2. `app.py` 路由层只做：
   - 参数解析/校验
   - `request_id/client_id` 注入
   - 调用 service 并返回 Response
3. 日志规范化：service 内部统一打点（event + dt + ids）。

## 验收标准

- `python backend/app.py` 能启动
- 至少纯文本问答链路可用（/api/ask）
- TTS 接口（/api/text_to_speech_stream 或当前使用的接口）可用

## 回滚策略

- 每抽离一个 service 就提交一次“可运行点”（或至少形成一个独立 patch）。
- 若抽离导致无法启动，优先回滚到上一个可运行点。

