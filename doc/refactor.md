# 重构方案（长期迭代）

本文目标：在不影响现有功能（RAGFlow 流式问答、TTS 流式播放、ASR 语音输入、连续讲解/预取、打断/取消、历史/调试面板）的前提下，降低耦合、提升可维护性与可观测性，并为“展厅机器人”场景的高并发与长会话做好结构准备。

---

## 一、现状痛点（按风险排序）

### 1) 后端 `backend/app.py`
- **职责混杂**：路由 + 业务编排 + 第三方 SDK 调用 + 状态管理 + 日志/指标混在一起，改动容易产生回归。
- **取消/打断难统一**：RAG/TTS/ASR 多条链路并行，缺少统一的 `request_id` 生命周期与取消 token 管理。
- **资源清理与复用复杂**：WebSocket/连接池/缓存/临时文件等清理策略不清晰时容易出现“第二次必现”类问题（历史上已出现白噪音/连接异常等）。
- **观测分散**：日志虽多，但缺少统一的阶段化指标结构（submit→rag_first→tts_first→tts_done 等）与跨模块关联。

### 2) 前端 `fronted/src/App.js`
- **编排逻辑仍偏重**：组件已拆分，但仍存在较多 workflow/状态编排、遗留代码与边界不清的依赖。
- **音频链路复杂**：流式音频播放要对抗主线程抖动、预取并发、用户打断、AudioContext 生命周期等，若不集中管理易反复出问题。
- **“长讲解 + 预取”压测不足**：prefetch 与播放/渲染同线程抢占，会导致卡顿；需要可配置与可观测（队列长度、预缓冲、underrun 次数）。

---

## 二、重构总原则

1. **最小可行迁移（Strangler Fig）**：先抽离 service/manager，再把旧逻辑逐段替换并删除。
2. **单一职责**：每个模块只做一件事；复杂流程由 orchestrator/manager 组合。
3. **全链路 request_id**：从前端 submit 开始贯穿后端 RAG/TTS/ASR；取消与状态查询都基于同一 ID。
4. **可观测性优先**：统一的阶段指标（timeline）+ 结构化日志（event + dt + ids + sizes）。
5. **故障隔离**：任何一个子系统失败（ASR/TTS/RAG）不应拖垮整体；降级策略明确（例如 TTS 失败回退纯文本）。

---

## 三、目标架构（建议）

### 3.1 后端（Flask 仍保留）

建议目录结构（示例）：

```
backend/
  app.py                      # 仅做 Flask 初始化、路由装配、CORS、日志初始化
  config/                     # 读取 json/yaml 配置（已在项目中推进“配置文件化”）
  services/
    asr_service.py             # ASR Provider 抽象 + 预处理（ffmpeg）+ 三方实现
    tts_service.py             # TTS Provider 抽象 + DashScope/Bailian + 本地（可选）
    ragflow_chat_service.py    # chat 实体对接（流式）
    ragflow_agent_service.py   # agent 实体对接（流式）
    history_service.py         # sqlite 读写（问答历史、频次、排序）
  orchestrators/
    conversation_orchestrator.py  # “一次请求”的主编排：intent/route/队列/取消/清理
    tour_orchestrator.py          # 连续讲解状态机、预取、下一站/打断/继续
  infra/
    cancellation.py            # CancellationToken / registry（按 request_id）
    metrics.py                 # timeline/指标汇总（submit→rag→tts…）
    logging.py                 # 结构化日志封装（logger.event(...)）
```

关键点：
- **Provider 接口统一**：`ASRProvider` / `TTSProvider` / `RAGProvider`，并行/替换成本低。
- **Orchestrator 统一取消**：收到新请求/用户打断时，统一 `cancel(request_id)`，所有 provider 的 in-flight 都能感知并尽快退出。
- **状态查询**：可选增加 `/api/status?request_id=...`，前端调试/排障方便（队列、阶段耗时、是否取消、错误码等）。

### 3.2 前端（React 仍保留）

建议目录结构（示例）：

```
fronted/src/
  App.js                       # 仅做页面布局 + 状态组合（尽量薄）
  components/                  # 纯 UI 组件（已在推进）
  managers/
    RecorderManager.js         # 录音/编码/上传
    TtsQueueManager.js         # TTS 分段队列/播放/停止
    TourPipelineManager.js     # 连续讲解/预取/站点切换
    AskWorkflowManager.js      # /api/ask 流式读取 + 取消/打断 + 驱动 TTS
  api/
    backendClient.js           # fetch 封装（headers、client_id、credentials、错误处理）
  audio/
    ttsAudio.js                # 播放策略（流式/解码/调度）
```

关键点：
- **App.js 只做“组合”**：所有网络请求、复杂并发、状态机逻辑都下沉到 manager。
- **播放策略集中**：`ttsAudio.js` 只负责“给我 wav 流，我稳定播放”；buffer/underrun/日志都集中在此处。
- **可配置参数集中**：prefetch 并发、TTS 预缓冲时长、队列长度阈值等统一配置，方便 AB 对比与现场调参。

---

## 四、分阶段实施（推荐顺序）

### Phase 0：基线与观测（1 天）
- 统一定义 timeline 字段：`submit_at/rag_first_chunk_at/rag_first_segment_at/tts_first_audio_at/tts_done_at/cancel_at`
- 前后端日志都带：`request_id`、`client_id`、`stopIndex`、`segment_index/seq`
- 增加一个“性能/调试开关”（例如前端 localStorage / query param 控制更详细日志）

验收：
- 任一请求都能在日志里完整还原链路，并能计算关键耗时。

### Phase 1：前端继续瘦身（0.5~1 天）
- 删除 `App.js` 中遗留/未使用的 legacy 音频函数与重复实现（保持单一入口：`ttsAudio.js`）
- 将 `askQuestion` 的旧实现迁移完毕并删除 fallback，确保以 `AskWorkflowManager` 为唯一编排入口

验收：
- `npm run build` 通过；连续讲解/打断/预取/多人围观功能回归通过。

### Phase 2：后端“路由-服务-编排”三层化（2~4 天）
- `app.py` 只保留 Flask 初始化与路由注册
- `services/` 抽离：ASR/TTS/RAG/History（已有部分则继续规范化）
- 增加 `infra/cancellation.py`：按 `request_id` 注册/取消；每个 provider 支持及时退出

验收：
- 新问题打断旧问题时，后端不再持续消耗旧流程资源（RAG/TTS/ASR 都能停）。

### Phase 3：连续讲解状态机与预取策略独立（2~5 天）
- 后端：`tour_orchestrator` 统一管理站点顺序、目标字数/时长、承接语生成策略
- 前端：prefetch 并发限流、预取队列可视化、与 TTS 播放解耦

验收：
- 长时间连续讲解中，停顿显著减少；多次打断/继续/跳站不会出现状态污染。

### Phase 4：面向“展厅机器人”的稳定性（持续迭代）
- 多人围观：队列/优先级/轮询策略后移到后端（避免前端状态丢失）
- 容错与降级：TTS 失败回退文本、ASR 失败提示重录、RAG 超时提示
- 运行时配置：不同展厅/人群画像/时长等可在线调整

---

## 五、关键技术策略（针对已出现过的问题）

### 1) 音频播放“卡顿”
- 原因常见是主线程抖动 + 流式播放供给不稳（特别是 ScriptProcessorNode 方案）。
- 方案：使用**预缓冲 + 调度**播放，并记录 underrun 计数；prefetch 并发要限流，避免抢主线程。

### 2) 白噪音/音频异常
- 重点排查：wav header 拼接/重复 header、sample_rate 不一致导致的重采样失真、分段切分过短导致播放器误判。
- 方案：统一输出格式与采样率；前端 sanity probe（rms/zcr）只做告警，播放层做更强健的拼接与容错。

### 3) 打断/取消一致性
- 方案：前端 `cancel -> /api/cancel`，后端 `CancellationRegistry` 广播到 RAG/TTS/ASR；所有流式循环每次 read 都检查 token。

---

## 六、落地建议（你现在就可以做的下一步）

1. **前端**：彻底删除 `App.js` 内的 legacy 音频与 ask fallback（减少重复维护面）
2. **后端**：把 `request_id` 作为“一等公民”，构建 `infra/cancellation.py`，先保证取消/清理一致
3. **压测脚本**：增加一个“连续讲解 10 站 + 中途打断 3 次”的最小压测流程（人工也可），每次改动后跑一遍

