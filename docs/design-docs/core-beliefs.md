# 核心设计信条（基于当前实现）

## 1. 单一组装入口，避免隐式初始化

- 后端依赖在 `backend/bootstrap.py` 统一组装，并由 `backend/app.py` 调度注册。
- 前端页面级编排统一收敛在 `fronted/src/app/AppShell.js`。

## 2. 模块边界清晰：视图 / 状态 / 流程 / 语音分离

- 视图组件在 `fronted/src/components`。
- 状态与副作用在 `fronted/src/hooks`。
- 流程控制在 `fronted/src/managers`。
- 语音识别抽象在 `fronted/src/voice`。

## 3. 接口按业务域拆分，不做“巨型 API”

- 后端以 blueprint 族群按域拆分（system、tour、ops、speech、tts、recordings 等）。
- 每个域有独立文件与路由集合，降低跨域耦合。

## 4. 状态与数据存储显式分层

- SQLite 负责本地业务持久化（设置、断点、运营、录音、缓存等）。
- Redis 作为可切换事件/状态后端，启用开关由环境变量控制。

## 5. 外部能力通过适配层接入

- RAGFlow 由 `RagflowService` 统一承接，前端通过标准 API 使用。
- VoiceKit 与 SAUC 通过 recorder manager/WS 代理接入，前端无需直接耦合上游协议细节。

## 6. 失败语义透明

- provider 不支持时直接报错（如 `unsupported_press_to_talk_provider:*`）。
- 缺少默认语音依赖（VoiceKit）时启动直接失败，不跳过 `/voicekit/ws/asr`。
