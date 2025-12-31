# 可观测性规范（logs/events/status）

目标：后续加功能时，能用统一的事件与字段快速回答：
- “卡在哪一步？”
- “为什么白噪声/没声音/延迟大？”
- “是前端播放问题，还是后端流问题？”

当前实现基座：
- 事件存储：`backend/infra/event_store.py`
- 事件 API：`GET /api/events`、`POST /api/client_events`
- 汇总 API：`GET /api/status?request_id=...`

## 1. 事件命名规范（建议新增功能遵守）

### 1.1 命名

- `kind`：能力域（`ask` / `tts` / `asr` / `nav` / `client` / `cancel`）
- `name`：动词短语，推荐这组后缀：
  - `*_received`：请求进入系统
  - `*_start`：真正开始处理
  - `*_done`：成功结束
  - `*_failed`：异常结束（fields 里必须包含 `err`）
  - `*_rate_limited`：限流拦截
  - `*_client_disconnect`：客户端断开（SSE/TTS）

### 1.2 字段（fields）建议

所有事件尽量包含：
- `endpoint`：如 `/api/ask`、`/api/text_to_speech_stream`
- `method`：GET/POST（如适用）
- `bytes` / `chars`：输入/输出规模
- `segment_index`：TTS 段序号（如适用）
- `stop_index` / `stop_name`：导览相关（如适用）
- `provider`：asr/tts provider（如适用）
- `err`：错误信息（failed 必填）

## 2. /api/events 使用方式

### 2.1 针对某次 run

`GET /api/events?request_id=<RID>&limit=200`

推荐排查顺序：
1) `ask_received` / `ask_registered` 是否出现
2) 是否有 `ask_stream_failed` / `tts_stream_failed`
3) TTS 是否有 `tts_request_received`、是否 `tts_stream_done`
4) `pcm_probe_suspect_white_noise` / `wav_probe_failed` 是否出现（TTS 流可疑）

### 2.2 全局最近事件

`GET /api/events?limit=300`

用于看“系统整体是否在跑”，但不适合精确定位单次问题。

## 3. /api/status 指标口径

`GET /api/status?request_id=<RID>`

返回内容：
- `timing`：后端记录的时间点（perf_counter）
- `derived_ms`：由 timing/客户端事件推导的耗时（毫秒）
- `tts_state`：段序统计（用于发现 segment_index 乱序/重复/跳号）
- `last_error`：该 request 的最后一条 error 事件

建议把这些指标当作“性能回归”基线：
- `submit_to_first_segment_ms`
- `submit_to_tts_first_audio_ms`
- `submit_to_play_end_ms`

## 4. 前端上报（/api/client_events）

当前最关键的是：
- `play_end`：用于补齐“客户端播放完成”时间点（后端 derived_ms 依赖它）

建议后续新增功能时，按需补充：
- `play_start`（若需要更精确的播放延迟）
- `audio_fallback`（触发 decodeAudioData 或 <audio> 的原因）
- `format_detected`（检测到 RIFF 重复 header、PCM probe 失败等）

## 5. Debug Checklist（新增功能自检）

新增/改动任一链路时，至少保证：
- 后端：入口/结束/失败事件齐全（能从 /api/events 看完整路径）
- 前端：中断时能看到 cancel 行为（且旧 run 不会继续 enqueue）
- /api/status 能解释“慢在哪里”（timing/derived_ms 对得上）

