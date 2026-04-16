# Backend API（Flask，`backend/app.py`）

默认：后端 `http://localhost:8000`，前端 `http://localhost:3000`（跨域由 CORS 允许 `/api/*`）。

## 关键约定

- `request_id`：贯穿一次“问答 + TTS 播放”的链路标识；前端会把同一个 `request_id` 带到 `/api/ask` 与后续 `/api/text_to_speech_stream`。
- `client_id`：区分不同浏览器/设备；用于后端的简单限流与“新请求取消旧请求”。
- 取消：`POST /api/cancel` 会置位取消标记；后端与前端都做 best-effort 的中断处理。
- 观测：后端会往内存事件池写入事件，可用 `/api/events` + `/api/status` 拉取调试信息。

## 健康检查

### `GET /health`

返回后端基础状态：

```json
{ "asr_loaded": true, "ragflow_connected": true }
```

## RAGFlow 下拉数据

### `GET /api/ragflow/chats`

返回 chat 列表（用于“会话/聊天”下拉框）：

```json
{ "chats": [{ "id": "...", "name": "..." }], "default": "..." }
```

### `GET /api/ragflow/agents`

返回 agent 列表（用于“智能体”模式下拉框）：

```json
{ "agents": [{ "id": "...", "title": "...", "description": "..." }], "default": "..." }
```

## 历史记录

### `GET /api/history`

Query：
- `sort`: `time`（默认）或 `count`
- `order`: `desc`（默认）或 `asc`
- `limit`: 默认 `100`

返回：
```json
{ "sort": "time", "items": [ { "question": "...", "answer": "...", "cnt": 3, "last_request_id": "...", "...": "..." } ] }
```

## 导览/讲解（Tour）

### `GET /api/tour/stops`

返回站点列表；优先读 `ragflow_demo/ragflow_config.json` 的 `tour.stops`，否则返回内置默认。

### `GET /api/tour/meta`

返回导览可选项（zones/profiles/defaults），读取 `tour_planner.*`。

### `POST /api/tour/plan`

Request JSON：
```json
{ "zone": "默认路线", "profile": "大众", "duration_s": 60 }
```

Response JSON：包含 `stops`、`stop_durations_s`、`stop_target_chars` 等（用于前端生成“讲解模式”提示词约束）。

## 取消/事件/状态（观测）

### `POST /api/cancel`

Request JSON：
```json
{ "request_id": "ask_xxx", "client_id": "c_xxx", "reason": "client_cancel" }
```

`request_id` 为空时，后端会尝试取消该 `client_id` 当前活跃的 ask 请求。

### `GET /api/events`

Query：
- `request_id`：可选；传则只返回该 request 的事件
- `limit`：默认 `200`
- `since_ms`：可选；只返回 `ts_ms >= since_ms`
- `format`：`json`（默认）或 `ndjson`

Response（json）：
```json
{ "request_id": "ask_xxx", "items": [ { "ts_ms": 0, "kind": "ask", "name": "ask_received", "fields": {} } ], "last_error": null }
```

### `POST /api/client_events`

前端上报客户端侧事件（例如 `play_end`），用于把“播放结束时间”写入 `/api/status` 的 derived 指标。

Request JSON：
```json
{ "request_id": "ask_xxx", "client_id": "c_xxx", "kind": "client", "name": "play_end", "level": "info", "fields": { "t_client_ms": 0 } }
```

### `GET /api/status?request_id=...`

返回某次运行的取消信息、时间点（timing）、衍生耗时（derived_ms）、TTS 顺序状态（tts_state）与 last_error。

## ASR（语音转文字）

### `POST /api/speech_to_text`

multipart/form-data：
- 文件字段名：`audio`
- 可选字段：`request_id`、`client_id`（也可用 header `X-Request-ID`/`X-Client-ID`）

Response JSON：
```json
{ "text": "..." }
```

## Ask（RAG/Agent 问答，SSE）

### `POST /api/ask`

Request JSON（常用字段）：
```json
{
  "question": "公司有什么产品？",
  "request_id": "ask_...",
  "client_id": "c_...",
  "kind": "ask",
  "conversation_name": "展厅聊天",
  "agent_id": "",
  "recording_id": "",
  "guide": {
    "enabled": true,
    "style": "friendly",
    "duration_s": 60,
    "target_chars": 280,
    "stop_name": "公司总体介绍",
    "stop_index": 0,
    "tour_action": "next",
    "action_type": "讲解",
    "continuous": true
  }
}
```

Response：`text/event-stream`（SSE）。每行形如：
```text
data: {"chunk":"...","segment":"...","done":false,"meta":{"intent":"qa","intent_confidence":0.45}}
```

字段说明（同一条 event 可能只包含其中一部分）：
- `chunk`：增量文本（用于 UI 实时展示）
- `segment`：用于 TTS 的分段文本（前端会逐段调用 `/api/text_to_speech_stream`）
- `done`：`true` 表示本次问答结束
- `meta`：意图识别等附加信息（例如 `intent`/`intent_confidence`）

## TTS（文字转语音）

### `POST /api/text_to_speech`

非流式（直接返回音频字节）。

Request JSON：
```json
{ "text": "你好", "request_id": "tts_...", "client_id": "c_...", "segment_index": 0, "tts_provider": "modelscope", "tts_voice": "" }
```

### `GET|POST /api/text_to_speech_stream`

流式（chunked）返回音频字节，前端默认按 WAV/PCM 流式播放。

GET Query（前端默认使用 GET）：
- `text`（必填）
- `request_id`、`client_id`
- `segment_index`：递增序号（用于顺序校验与日志）
- `tts_provider`：例如 `modelscope`/`flash`/`sapi`/`edge`/`sovtts1`/`sovtts2`（最终由 `backend/services/tts_service.py` 决定）
- `tts_voice`、`tts_model`：可覆盖配置中的模型/音色（仅部分 provider 生效）
- `recording_id`、`stop_index`：开启“导览录制”时用于把该段音频持久化到 `backend/data/recordings/`

响应头：
- `Content-Type`: 来自配置 `tts.mimetype`（通常为 `audio/wav`）
- `X-Accel-Buffering: no`（提示反代不要缓冲）

