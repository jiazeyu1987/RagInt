# 前后端契约（Contracts）与兼容策略

目标：把“接口字段/语义/兼容”写清楚，避免后续加功能时靠猜导致回归。

## 1. 全局标识语义

- `request_id`
  - 语义：一次 run 的主键（ask + 所有段的 tts）
  - 约束：同一 run 内复用；新 run 使用新值

- `client_id`
  - 语义：浏览器实例/设备标识（用于后端限流与“新请求取消旧请求”）
  - 约束：同一页面生命周期尽量稳定

- `segment_index`
  - 语义：一次 run 内 TTS 分段序号（前端递增）
  - 约束：应当单调递增；后端会记录 duplicate/out_of_order/gap

## 2. Ask SSE（`POST /api/ask`）

### 2.1 请求（Request）

最小字段：
```json
{ "question": "...", "request_id": "ask_xxx", "client_id": "c_xxx" }
```

可选字段（当前代码支持）：
- `kind`：用于策略/限流维度（例如 `ask`、`ask_prefetch`）
- `conversation_name`：chat 模式选中的会话名
- `agent_id`：agent 模式（传入则忽略 conversation_name）
- `recording_id`：导览录制 run id（用于后续 tts 保存）
- `guide`：导览讲解约束对象（见 `backend/orchestrators/conversation_orchestrator.py`）

### 2.2 响应（Response，SSE）

Content-Type：`text/event-stream`

事件行格式：
```text
data: {json}\n\n
```

事件 JSON（字段可能部分出现）：
- `chunk: string`：增量文本（用于 UI 展示）
- `segment: string`：TTS 分段文本（用于生成 TTS 请求）
- `done: boolean`：`true` 表示 ask 流结束
- `segment_seq?: number`：后端内部段序（可选）
- `meta?: object`：例如 `{ intent, intent_confidence }`

#### 兼容约定

- 前端必须容忍：某些事件只有 `chunk`，没有 `segment`
- 前端必须容忍：没有 `meta` 或 `segment_seq`
- 后端必须保证：最后一定输出 `done=true`（best-effort；断链时前端需自行 finalize）

## 3. TTS（`GET|POST /api/text_to_speech_stream`）

### 3.1 请求（Query/JSON）

前端当前默认用 GET query（见 `fronted/src/managers/TtsQueueManager.js`）：
- `text`（必填）
- `request_id`、`client_id`
- `segment_index`（必填：前端递增）
- `tts_provider`（可选）
- `tts_voice`、`tts_model`（可选，覆盖部分 provider 的配置）
- `recording_id`、`stop_index`（可选，用于保存音频）

### 3.2 响应（音频字节流）

响应头：
- `Content-Type`: `tts.mimetype`（通常 `audio/wav`）
- `X-Accel-Buffering: no`

字节流约定（当前前端假设）：
- 首选：单个 WAV header + PCM body
- 容忍：流中重复出现 header（前端会尝试检测并重置解析）

#### 兼容约定

- 若未来切换为“纯 PCM”流：必须通过**新 endpoint**或显式 `format=pcm16` 之类的协商字段，避免旧前端误解码。

## 4. 取消（`POST /api/cancel`）

请求 JSON：
```json
{ "request_id": "ask_xxx", "client_id": "c_xxx", "reason": "client_cancel" }
```

兼容约定：
- 后端应允许缺省 `client_id`（用 header/remote_addr 兜底）
- 取消是 best-effort：可能已产生部分 chunk/segment/tts

## 5. 观测（`/api/events`、`/api/status`、`/api/client_events`）

建议新增功能时：
- 入口事件：`*_received`
- 启动事件：`*_start`
- 结束事件：`*_done`
- 异常事件：`*_failed`（并在 fields 放 `err`）

`POST /api/client_events`：
- 前端应至少上报：`play_end`（用于后端计算 derived_ms）

## 6. 契约版本策略（建议）

为避免“字段越加越乱”，建议新增功能遵循：
- **新增字段优先**，不要改字段语义
- 改语义必须：
  - 新增字段（例如 `tts_format`）并保留旧字段
  - 或新建 endpoint（例如 `/api/text_to_speech_stream_v2`）
- 在 `doc/code/contracts.md` 记录：
  - 新字段默认值
  - 前端最低兼容版本（若有）

