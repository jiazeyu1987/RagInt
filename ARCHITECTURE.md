# RagInt 架构总览

本文件描述仓库当前已经落地的真实架构，用于前后端、测试和运维协作时快速建立共同上下文。

## 1. 运行拓扑

[`docker-compose.yml`](./docker-compose.yml) 当前定义了 3 个核心服务：

- `redis`：默认端口 `6379`
- `backend`：Flask API 与语音相关 WebSocket 入口，默认端口 `8000`
- `fronted`：React 前端静态站点，默认端口 `4981`

## 2. 后端主干

后端入口在 [`backend/app.py`](./backend/app.py)，依赖组装在 [`backend/bootstrap.py`](./backend/bootstrap.py)。

`create_app()` 的真实链路是：

1. 创建 Flask 应用并配置 CORS
2. 调用 `build_deps(...)` 组装 services、stores 和状态后端
3. 调用 `init_ragflow(...)` 初始化 RAGFlow 能力
4. 调用 `register_blueprints(...)` 注册 HTTP API
5. 调用 `register_voicekit(...)` 与 `register_sauc_proxy(...)` 注册语音 WebSocket 通道

## 3. 核心 API 族群

`backend/bootstrap.py` 当前注册的主要 blueprint 包括：

- `system`
- `app_settings`
- `breakpoint`
- `tour_control`
- `tour_command`
- `selling_points`
- `ops`
- `qa_audio_cache`
- `speech`
- `recordings`
- `tts`

此外还包含 `offline` 与 `ragflow_tour_history`。

## 4. 前端主干

前端入口链路是：

- [`fronted/src/App.js`](./fronted/src/App.js)
- [`fronted/src/app/AppShell.js`](./fronted/src/app/AppShell.js)

当前前端的结构事实是：

- React 18 来自 [`fronted/package.json`](./fronted/package.json)
- `hooks/` 负责状态和副作用编排
- `managers/` 负责流程控制与状态机
- `voice/` 负责 ASR 文本组装与语音 provider
- `components/` 负责界面与面板组织

## 5. 关键依赖角色

- RAGFlow：问答、会话、Agent 数据面
- VoiceKit：默认 ASR WebSocket 入口，路径 `/voicekit/ws/asr`
- SAUC：可选 ASR 上游，前端通过 `/api/asr/sauc/ws` 间接接入
- SQLite：默认本地持久化介质，承载设置、断点、缓存、运维与录制元数据
- Redis：可切换状态/事件后端，适合多进程或多实例场景

## 6. 继续阅读

- 设计总文档：[`docs/DESIGN.md`](./docs/DESIGN.md)
- 前端专项：[`docs/FRONTEND.md`](./docs/FRONTEND.md)
- 设计文档索引：[`docs/design-docs/index.md`](./docs/design-docs/index.md)
- 产品规格索引：[`docs/product-specs/index.md`](./docs/product-specs/index.md)
