# 前端音频/播放链路（`fronted/`）

前端核心目标：把 `/api/ask` 的 SSE（文本增量 + TTS 分段）转成一串 `/api/text_to_speech_stream` 的音频流，并稳定顺序播放。

## 关键文件

- Ask SSE：`fronted/src/managers/AskWorkflowManager.js`
- TTS 队列：`fronted/src/managers/TtsQueueManager.js`
- 音频播放/解码：`fronted/src/audio/ttsAudio.js`
- 后端请求封装：`fronted/src/api/backendClient.js`（含 `cancelRequest`、`emitClientEvent`）

## 高层流程

1) 发送问答：前端 `POST /api/ask`（body 带 `request_id`、`client_id`、可选 `guide`、`agent_id`、`conversation_name`）
2) 解析 SSE：逐行读取 `data: {...}` 的 JSON
   - `chunk`：拼接到 `fullAnswer` 并刷新 UI
   - `segment`：交给 `TtsQueueManager.enqueueText(seg, { stopIndex, source: 'ask' })`
   - `done=true`：标记 ragDone，并等待队列自然播放完（或触发预取下一站）
3) 生成 TTS URL：`TtsQueueManager._buildSegmentUrl(...)` 会构造：
   - `GET /api/text_to_speech_stream?text=...&request_id=...&client_id=...&tts_provider=...&tts_voice=...&segment_index=...`
   - 若启用导览录制，还会追加 `recording_id`、`stop_index`
4) 播放策略：队列顺序播放（避免并发叠音），并在结束时上报 `play_end`（`POST /api/client_events`）

## WebAudio 流式播放要点（白噪声风险点）

主路径：`playWavStreamViaWebAudio(url, ...)`（`fronted/src/audio/ttsAudio.js`）

假设/约束：
- 后端返回 `audio/wav`，WAV header 解析后，后续按 PCM16（通常 16kHz/mono）投喂 WebAudio

白噪声常见原因：
- 流中途重复出现 `RIFF....WAVE` header（把 header 当作 PCM 播放会变白噪声）
- 字节丢失/截断导致 PCM 对齐/容器尺寸错误

已做的防护（见 `fronted/src/audio/ttsAudio.js`）：
- 检测到 chunk 以 `RIFF`/`WAVE` 开头且处于 mid-stream 时，重置 WAV 解析状态（避免把 header 当 PCM）
- 对前若干字节做 PCM sanity（RMS + ZCR）探测，疑似白噪声会触发回退路径

回退路径：
1) `decodeAudioData`（一次性拉完整个 wav，必要时 patch RIFF/data size）
2) `<audio>` 标签播放

