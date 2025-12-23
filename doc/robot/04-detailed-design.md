# 详细设计（展厅机器人：架构 / 状态机 / 数据流 / 接口）

## 1. 总体架构

### 1.1 组件
- **前端（React）**
  - 讲解控制（开始/继续/跳站/队列）
  - 音频：录音（MediaRecorder）+ 播放（WebAudio）
  - 调试面板：展示后端 `/api/status`
- **后端（Flask）**
  - ConversationOrchestrator：/api/ask 的流式编排
  - CancellationRegistry：request_id 统一取消
  - ASR/TTS/RAG services：provider 抽象与日志/指标
- **外部平台**
  - RAGFlow（chat/agent）
  - ASR provider（默认 FunASR，备用 DashScope/其他）
  - TTS provider（Bailian/DashScope streaming）

### 1.2 数据流（核心）

```
观众语音 -> 前端录音 -> /api/speech_to_text -> 文本回填输入框
用户提交 -> /api/ask (SSE) -> 前端分段 -> /api/text_to_speech_stream -> WebAudio 播放
取消 -> /api/cancel -> 后端 token -> RAG/TTS/ASR 退出
```

## 2. 状态机设计

### 2.1 Tour 状态机（前端）

状态：`idle` | `running` | `ready` | `interrupted`

事件：
- `start`：开始讲解（stopIndex=0）
- `continue`：从当前 stopIndex 继续
- `next/prev/jump`：切换站点
- `user_question`：观众提问（不改变 stopIndex，只改变 lastAction）
- `interrupt`：停止当前播放/生成并进入 interrupted

关键规则：
- 任何新 ask 都会触发 interrupt（前端停止播放 + 后端 cancel）
- `ready` 表示“本轮回答已完成，可继续讲解/下一站”，保存 `lastAnswerTail` 用于过渡承接

### 2.2 预取策略（连续讲解）

目标：上一站 TTS 播放过程中，提前获取下一站文本段落，减少停顿。

策略：
- 预取窗口：`ahead=1`（最多比当前播放站点超前 1 站，避免主线程压力与抖动）
- 触发点：
  - RAG done 时触发下一站预取（不等待 TTS 播放完）
  - 播放进入新 stopIndex 时，检查并补齐下一站预取
- 取消：`interrupt`/新问题提交会 abort prefetch

## 3. 关键接口（建议保持稳定）

### 3.1 问答
- `POST /api/ask`
  - 输入：`question, request_id, client_id, conversation_name|agent_id, guide{enabled,duration_s,style,continuous}`
  - 输出：SSE：`chunk/segment/done/meta`

### 3.2 取消
- `POST /api/cancel`
  - 输入：`request_id, reason, client_id`
  - 行为：标记取消并让 in-flight 流式循环尽快退出

### 3.3 语音识别
- `POST /api/speech_to_text`
  - form-data：`audio` + `client_id` + `request_id`
  - 输出：`{text}`

### 3.4 语音合成（流式）
- `GET /api/text_to_speech_stream?text=...&request_id=...&segment_index=...`
  - 输出：wav 流（chunked）

### 3.5 状态查询（调试/运维）
- `GET /api/status?request_id=...`
  - 输出：timeline + cancel/tts state

## 4. 关键工程约束与防坑

### 4.1 白噪音与播放卡顿
- 统一采样率（建议 16k），避免连续段落重建 AudioContext 导致重采样
- 对流式 wav：只保留首个 header，后续只喂 PCM；对异常 RMS/ZCR 做告警与回退

### 4.2 并发与抖动
- 取消必须贯穿后端（不仅是前端停止播放）
- 预取要限流，避免同时多个 `/api/ask` 抢占主线程与网络

### 4.3 观众体验
- 过渡语压缩（上一站尾句若含“接下来/欢迎来到”则下一站开头避免重复）
- 多人模式下提供“队列面板”，支持主持人手动提问优先级

