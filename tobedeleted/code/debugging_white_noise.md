# 白噪声排查清单（端到端）

这里的“白噪声”通常不是“模型说话难听”，而是字节流被当成了错误的 PCM 播放（或音频流被截断/错序）。

## 先确定 request_id 与 segment

前端会把同一个 `request_id` 贯穿：
- `/api/ask`（SSE）
- `/api/text_to_speech_stream`（TTS）

因此排查第一步：从浏览器控制台或 Network 拿到：
- `request_id`（形如 `ask_xxx`）
- 某段 TTS 的 `segment_index`

## 用后端观测接口回放时间线

### 1) 拉事件：`GET /api/events?request_id=...`

重点关注：
- `ask_*`：是否正常开始/结束、有无 `ask_stream_failed`
- `tts_*`：是否出现 `tts_stream_failed`、`tts_cancelled_*`
- `pcm_probe_suspect_white_noise`、`wav_probe_failed` 等（来自 `backend/services/tts_service.py`）

也可以用 `format=ndjson` 便于命令行 grep。

### 2) 拉汇总状态：`GET /api/status?request_id=...`

关注字段：
- `derived_ms.submit_to_tts_first_audio_ms`：首包音频是否异常慢
- `tts_state`：是否出现 out-of-order/duplicate/gap（说明 segment_index 顺序异常）
- `last_error`：最后一条 error 事件

## 前端侧确认是否“把 WAV header 当 PCM”

白噪声最常见的形态之一：TTS 流中间重复出现 WAV header（`RIFF....WAVE`）。

检查点：
- 前端播放代码：`fronted/src/audio/ttsAudio.js`
  - 看到“embedded WAV header mid-stream”相关日志/分支时，说明后端/上游 provider 可能在每帧都带了 header

应对策略（当前实现已做 best-effort）：
- 检测到 header 立即重置解析状态，避免把 header 当 PCM
- 若仍频繁触发，优先从后端侧改为“只发 PCM”（或改为标准 WAV 单 header + PCM body）

## 后端侧确认是否发生了“丢包/背压/复用污染”

TTS 后端关键点：`backend/services/tts_service.py`

现有硬化点（与排查相关）：
- 背压时尽量不丢字节（丢字节很容易导致 WAV/PCM 损坏）
- 若检测到可疑流（WAV probe 异常、PCM probe 疑似白噪声、或发生背压等待），连接池对象不回收，避免污染后续请求

## 最小复现建议

1) 固定同一段文本（短句），重复调用 `/api/text_to_speech_stream`，观察是否“偶现”
2) 关闭/开启连接池（配置 `tts.bailian.use_connection_pool`）对比是否与复用相关
3) 抓取一条异常请求的原始字节（后端或浏览器），确认是否存在重复 header 或明显截断

