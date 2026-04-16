# RagInt 设计总览（P1 基线）

本文件用于把当前实现统一映射为可协作文档，所有描述均以仓库代码事实为准。

## 1. 设计目标

- 明确系统的真实组装点与运行边界。
- 让前后端成员可以快速定位模块职责、接口入口和依赖关系。
- 建立后续阶段可复用的设计文档骨架（`docs/design-docs`）。

## 2. 系统主干

### 2.1 后端主干（Flask）

- 入口：`backend/app.py`
- 组装：`backend/bootstrap.py`
- 组装步骤：
  1. `build_deps(...)` 构建服务与存储依赖。
  2. `init_ragflow(...)` 建立 RAGFlow 初始化状态。
  3. `register_blueprints(...)` 注册核心 HTTP API。
  4. `register_voicekit(...)` 注册 VoiceKit WS。
  5. `register_sauc_proxy(...)` 注册 SAUC 代理 WS。

### 2.2 前端主干（React 18）

- React 版本：`fronted/package.json` 中 `react@^18.2.0`、`react-dom@^18.2.0`。
- 入口链路：`fronted/src/App.js` -> `fronted/src/app/AppShell.js`。
- 架构形态：AppShell 编排 + hooks 状态层 + managers 流程层 + voice 语音层 + components 视图层。

## 3. 核心模块分层（前后端）

### 3.1 后端 API 族群（P1 重点）

- `system`、`app_settings`、`breakpoint`、`tour_control`、`tour_command`
- `selling_points`、`ops`、`qa_audio_cache`、`speech`、`recordings`、`tts`

具体文件与路由见：[`docs/design-docs/backend-architecture.md`](./design-docs/backend-architecture.md)

### 3.2 前端模块族群（P1 重点）

- hooks：`fronted/src/hooks/*`（状态、请求、副作用编排）
- managers：`fronted/src/managers/*`（流程控制、状态机、队列/中断管理）
- voice：`fronted/src/voice/*`（ASR 文本装配、按住说话语音模块）

具体分层与调用链见：[`docs/design-docs/frontend-architecture.md`](./design-docs/frontend-architecture.md)

## 4. 运行与依赖角色

### 4.1 容器运行面

`docker-compose.yml` 的核心服务：

- `redis`
- `backend`（端口 `8000`）
- `fronted`（端口 `4981`）

### 4.2 技术能力角色

- RAGFlow：问答、会话、Agent 数据能力。
- VoiceKit：默认 WebSocket ASR 通道。
- SAUC：可选 ASR 上游（通过后端代理向前端暴露）。
- SQLite：本地持久化（多业务 store）。
- Redis：事件流/状态后端（按环境变量启用）。

## 5. 交互流入口

交互主流程见：[`docs/design-docs/interaction-flow.md`](./design-docs/interaction-flow.md)

## 6. 文档导航

- 设计索引：[`docs/design-docs/index.md`](./design-docs/index.md)
- 核心原则：[`docs/design-docs/core-beliefs.md`](./design-docs/core-beliefs.md)
- 前端专项：[`docs/FRONTEND.md`](./FRONTEND.md)
