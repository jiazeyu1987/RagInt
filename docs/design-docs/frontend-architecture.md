# 前端架构（React 18 + AppShell）

## 1. 总体结构

- 入口：`fronted/src/App.js`
- 主编排：`fronted/src/app/AppShell.js`
- 技术栈：React 18（`fronted/package.json`）

`AppShell` 负责把 hooks、managers、voice 与 UI 组件串成完整业务流程。

## 2. 分层职责

## 2.1 hooks 层

负责状态、请求和副作用编排，典型包括：

- `useAppSettings`：设置加载/更新。
- `useRagflowBootstrap`：会话与 Agent 启动阶段准备。
- `useRunOrchestration`：问题提交与流程调度。
- `useVoiceInputManager`：语音输入接入点。
- `useTourPipelineManager`：讲解路线流水线。

## 2.2 managers 层

负责可复用流程对象与状态机，典型包括：

- `RecordingWorkflowManager`：录音生命周期和文本落地。
- `TourPipelineManager`：讲解分段、预取、中断协同。
- `InterruptManager`：打断控制节拍。
- `RagflowChatManager`：聊天会话选择和默认会话处理。

## 2.3 voice 层

负责语音识别抽象与文本拼装，典型包括：

- `PressToTalkAsrModule`
- `AsrRecognitionSession`
- `AsrPostProcessPipeline`
- `providers/createPressToTalkProvider.js`

## 3. VoiceKit / SAUC 通道

核心调用链：

`useVoiceInputManager` -> `PressToTalkAsrModule` -> `RecordingWorkflowManager` -> `VoiceKitWsRecorderManager | SaucWsRecorderManager`

后端对应接口：

- VoiceKit WS：`/voicekit/ws/asr`
- SAUC 代理 WS：`/api/asr/sauc/ws`
- SAUC 健康检查：`/api/asr/sauc/health`

## 4. 与后端的关键契约

- 语音问答：`POST /api/ask`
- 文本过滤：`POST /api/asr/filter`
- 讲解控制：`/api/tour/control*`
- 配置：`GET/PUT /api/app_settings`
- 录音：`/api/recordings*`
- TTS：`/api/text_to_speech*`

## 5. 运行联调

- 前端容器端口：`4981`
- 后端容器端口：`8000`
- 联调编排：`docker-compose.yml`（`fronted` 依赖 `backend`，`backend` 依赖 `redis`）
