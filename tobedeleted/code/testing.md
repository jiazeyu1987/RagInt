# 测试策略（建议最小集，面向稳定迭代）

本仓库目前以“端到端链路稳定”为核心风险（SSE、TTS 音频流、取消/中断、导览/录制）。建议按以下层次逐步补齐测试，而不是一次性引入重型框架。

## 1. 契约测试（Contract tests，优先级最高）

### 1.1 SSE schema 回归

目标：确保 `/api/ask` 输出的 event JSON 字段不会破坏前端解析。

建议断言：
- 每条 event 都以 `data: ` 开头（后端输出层）
- `done=true` 最终会出现（或 EOF 时前端能 finalize）
- `chunk`/`segment` 任意组合都能被前端容忍
- `meta` 缺失时不影响解析

落点建议：
- 后端侧：对 orchestrator 输出 dict 进行 schema 校验（轻量）
- 前端侧：对解析循环做单元测试（把 SSE 文本喂给 parser）

### 1.2 TTS URL 构造回归

目标：确保 `TtsQueueManager._buildSegmentUrl()` 在新增参数时不破坏现有 query。

建议断言：
- 必须包含 `text/request_id/segment_index`
- `tts_provider/tts_voice` 有值时才出现
- 录制场景：有 `recording_id` 时才允许 `stop_index`

## 2. 行为测试（Workflow tests）

### 2.1 中断一致性（最易出回归）

目标：在任何阶段 interrupt 后：
- 当前播放停止
- ask SSE abort
- 不会再 enqueue 旧 run 的 segment

建议模拟：
1) 先产生 3 段 `segment`（未播放完）
2) 触发 interrupt
3) 再喂入旧 SSE 的迟到 segment，断言不会入队

### 2.2 “done 缺失”EOF finalize

目标：SSE 断开但没有 `done=true` 时：
- UI 不会一直 loading
- 若没有任何 segment 且 fullAnswer 非空，会把 fullAnswer 当作兜底 segment

## 3. 音频/格式测试（白噪声回归守门）

### 3.1 重复 WAV header 流

目标：当音频流中途出现 `RIFF....WAVE`：
- 播放器不会把 header 当 PCM（不会明显白噪声）
- 能触发重置逻辑/回退逻辑（至少不会崩）

建议：构造一个 mock stream：`[WAV_HEADER + PCM][WAV_HEADER + PCM]...` 喂给解析器。

### 3.2 PCM sanity 探测阈值稳定性

目标：避免阈值改动导致误判或漏判。

建议：固定几段已知样本（正常语音/白噪声），对 RMS/ZCR 输出做快照断言（容忍小误差）。

## 4. 后端冒烟测试（API smoke）

建议最小覆盖：
- `GET /health` 返回结构
- `GET /api/events`、`GET /api/status` 的参数校验（缺 request_id 返回 400）
- `POST /api/cancel` 在 request_id 缺失时的行为（能 cancel_active）
- `POST /api/ask` 空 question 返回 400

## 5. 建议的测试分层落地路径

1) 先补“契约测试”（不需要真实 RAGFlow/真实 TTS）
2) 再补“中断/EOF finalize”行为测试（最常见线上 bug）
3) 最后补音频格式 mock 流测试（白噪声守门）

> 如果你希望我下一步直接开始加测试，我需要你确认：优先放在后端（pytest）还是前端（react-scripts/jest），以及 CI/本地执行入口用什么命令。

