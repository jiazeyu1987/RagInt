# 关键交互流（P1）

本文档记录当前实现中的主路径交互流，便于排障和协作。

## 1. 应用启动流

1. 用户访问前端（`fronted`，端口 `4981`）。
2. `fronted/src/App.js` 渲染 `AppShell`。
3. AppShell 内 hooks 启动：
   - `useAppSettings` 读取设置；
   - `useRagflowBootstrap` 拉取会话/Agent；
   - `useTourBootstrap` 初始化讲解元数据。
4. 前端通过 `backend`（端口 `8000`）调用 `/api/*` 系列接口。

## 2. 文本问答流（/api/ask）

1. 用户提交文本问题。
2. 前端调用 `POST /api/ask`（`backend/api/speech.py`）。
3. 后端通过 `bootstrap.build_deps` 注入的服务执行：
   - 意图与流程编排；
   - RAGFlow 问答；
   - 可选 TTS/缓存处理。
4. 前端更新答案、队列状态和调试面板。

## 3. 语音输入流（VoiceKit / SAUC）

1. `useVoiceInputManager` 创建 `PressToTalkAsrModule`。
2. `RecordingWorkflowManager` 按 `providerType` 选择录音器：
   - `voicekit_ws` -> `VoiceKitWsRecorderManager`
   - `sauc_ws` -> `SaucWsRecorderManager`
3. WebSocket 通道：
   - VoiceKit：连接 `/voicekit/ws/asr`
   - SAUC：连接 `/api/asr/sauc/ws`（先可选探活 `/api/asr/sauc/health`）
4. 语音 partial/final 文本经 `AsrRecognitionSession` 组装后回填输入框，再触发问答提交流程。

## 4. 讲解控制流（Tour）

1. 前端通过 `tour_control` 与 `tour_command` 接口获取/推进讲解状态。
2. `TourPipelineManager` 管理站点顺序、预取与中断恢复。
3. `recordings` 与 `tts` 接口可用于讲解录制回放与语音合成输出。

## 5. 数据持久化流

1. 后端 store 默认落在 SQLite（`backend/data/*.db`）。
2. 事件状态后端根据 `RAGINT_STATE_BACKEND` 选择内存或 Redis。
3. docker-compose 场景中，Redis 服务与 backend 同网段直连。
