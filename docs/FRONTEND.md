# Fronted 前端架构说明（React 18）

> 说明：仓库目录名为 `fronted`（非 `frontend`），本文档按真实路径记录。

## 1. 入口与技术栈

- 入口文件：`fronted/src/App.js`
- 根组件：`fronted/src/app/AppShell.js`
- React 版本：`react@^18.2.0`、`react-dom@^18.2.0`

`App.js` 只负责渲染 `<AppShell />`，因此 AppShell 是前端单一编排入口。

## 2. AppShell 架构定位

`fronted/src/app/AppShell.js` 负责：

- 聚合页面级状态（问答、讲解、ASR/TTS、队列、调试态）。
- 编排 hooks 的加载与互相协作。
- 将 managers/voice 模块能力注入 UI 组件（`SettingsPanel`、`MainLayout`、`InputSection` 等）。

AppShell 本身不承担底层语音协议细节，语音细节下沉到 `hooks + managers + voice`。

## 3. hooks / managers / voice 分层

### 3.1 hooks 层（状态与副作用）

典型文件：

- `useAppSettings`：应用设置读写与本地同步。
- `useRagflowBootstrap`：RAGFlow 会话/Agent 初始化。
- `useRunOrchestration`：问答与讲解流程编排。
- `useVoiceInputManager`：语音输入管理入口（按 provider 切换）。
- `useTourPipelineManager`：讲解路径预取与状态联动。

### 3.2 managers 层（流程控制）

典型文件：

- `RecordingWorkflowManager`：统一封装录音生命周期、最短录音时长、最终文本处理。
- `TourPipelineManager` / `TourController`：讲解流程与站点推进。
- `InterruptManager`：中断节拍管理。
- `RagflowChatManager` / `RagflowChunkManager`：RAGFlow 会话和分段处理。

### 3.3 voice 层（ASR 语音能力）

典型文件：

- `PressToTalkAsrModule`：按住说话能力入口。
- `AsrRecognitionSession`：partial/final 文本组装。
- `AsrPostProcessPipeline`：识别结果后处理。
- provider 工厂：`voice/providers/createPressToTalkProvider.js`

## 4. VoiceKit 与 SAUC 的前端路径

语音录制器由 `RecordingWorkflowManager` 根据 `providerType` 选择：

- `voicekit_ws` -> `VoiceKitWsRecorderManager`
- `sauc_ws` -> `SaucWsRecorderManager`

调用链（简化）：

`useVoiceInputManager` -> `PressToTalkAsrModule` -> `VoiceKitPressToTalkProvider` -> `RecordingWorkflowManager` -> `VoiceKitWsRecorderManager | SaucWsRecorderManager`

对应后端入口：

- VoiceKit：`/voicekit/ws/asr`
- SAUC 代理：`/api/asr/sauc/ws`（并提供 `/api/asr/sauc/health` 探活）

## 5. 与后端契约关键点

- 业务 HTTP 主入口：`/api/ask`
- 配置与状态：`/api/app_settings`、`/api/status`、`/api/events`
- 讲解控制：`/api/tour/control`、`/api/tour/command/parse`
- TTS：`/api/text_to_speech`、`/api/text_to_speech_stream`
- 录音：`/api/recordings*`

## 6. 运行端口与本地联调

- 前端容器端口：`4981`
- 后端容器端口：`8000`
- 在 `docker-compose.yml` 中已定义 `fronted -> backend -> redis` 依赖顺序。

## 7. 相关阅读

- 设计总览：[`docs/DESIGN.md`](./DESIGN.md)
- 前端细分文档：[`docs/design-docs/frontend-architecture.md`](./design-docs/frontend-architecture.md)
- 交互流程：[`docs/design-docs/interaction-flow.md`](./design-docs/interaction-flow.md)
