# Backend 代码结构速览

后端入口：`backend/app.py`（Flask）。主要职责：装配服务、定义 API、把各类流式输出统一成 SSE / 音频流，并写入事件用于观测。

## 目录与核心模块

### Ask/RAG（流式文本 + 分段）

- `backend/orchestrators/conversation_orchestrator.py`
  - `ConversationOrchestrator.stream_ask(...)`：统一“chat 模式 / agent 模式”，输出增量 `chunk` 与 TTS `segment`
  - 分段策略：受 `text_cleaning.*` 控制；支持语义分段缓冲（更适配 TTS）
  - 产物：生成 SSE event dict（最终在 `backend/app.py` 包成 `data: {...}\n\n`）

- `backend/services/ragflow_service.py`
  - 负责 RAGFlow chat/session 复用（按 chat_name 缓存 session）
  - 提供 `/api/ragflow/chats`

- `backend/services/ragflow_agent_service.py`
  - 走 RAGFlow HTTP Agent SSE：`/api/v1/agents/{agent_id}/completions`
  - 本地解析 SSE 的 `data:` 行，抽取 delta 文本，交给 orchestrator 做进一步分段/约束

- `backend/services/intent_service.py`
  - 轻量规则意图识别（qa/guide/direction/chitchat/complaint）
  - 结果通常通过 SSE 的 `meta` 回传给前端（用于 UI 展示/策略切换）

### ASR（语音转文字）

- `backend/services/asr_service.py`
  - `ASRService.transcribe(raw_bytes, app_config, cancel_event, ...)`
  - 预处理：调用 `ffmpeg` 转成 16k/mono/PCM16 WAV，可选 `trim_silence`、`normalize`
  - provider：`funasr` / `faster_whisper` / `dashscope`（按配置选择与回退）

### TTS（文字转语音）

- `backend/services/tts_service.py`
  - `TTSSvc.stream(...)`：按 provider 选择不同实现（在线 cosyvoice/bailian、Edge、SAPI、本地 SoVITS 等）
  - 顺序/重复检测：`tts_state_update(...)` 记录 segment_index 的 out-of-order、duplicate、gap
  - 白噪声硬化：WAV header probe + PCM（RMS/ZCR）探测；可疑流/背压后不回收连接池对象

### 观测、取消、录制、历史

- `backend/infra/event_store.py`
  - 内存事件 ring buffer：全局 + 按 request_id
  - API：`GET /api/events`、`POST /api/client_events`

- `backend/services/request_registry.py`
  - in-process 取消 + 简单限流
  - “同一 client_id 的新请求取消旧请求”（按 kind 维度）

- `backend/services/history_store.py`
  - SQLite（WAL）存储问答历史（用于 `/api/history`）

- `backend/services/recording_store.py`
  - “导览录制”持久化：保存 ask 的 chunk/segment 以及每段 TTS 的 WAV 文件
  - API：`/api/recordings/*`（元数据、单站点回放、音频文件）

## request_id 的端到端路径（建议按此 grep 日志/事件）

1) 前端发起 `/api/ask`（携带 `request_id`、`client_id`）
2) 后端 SSE 返回 `chunk`/`segment`
3) 前端对每个 `segment` 调用 `/api/text_to_speech_stream`（同一个 `request_id`，递增 `segment_index`）
4) 前端播放完会 `POST /api/client_events` 上报 `play_end`
5) 后端可用 `/api/status?request_id=...` 汇总 timing/derived_ms/tts_state/last_error

