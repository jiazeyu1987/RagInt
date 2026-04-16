# 代码侧文档索引（doc/code）

这些文档面向“读代码/排查问题”，把当前语音问答链路（前端 SSE + TTS 流式播放、后端 RAG/ASR/TTS）中关键约定、格式假设和常见坑整理出来。

注意：本项目前端目录名为 `fronted/`（不是 `frontend/`）。

## 文档列表

- `doc/code/backend_api.md`：后端 HTTP API（含 SSE 与 TTS 音频流）协议与字段约定
- `doc/code/backend_services.md`：后端模块拆分与关键行为（RAG/Agent/ASR/TTS/观测/录制）
- `doc/code/frontend_audio.md`：前端 TTS 队列与流式音频播放（WebAudio + 回退）实现要点
- `doc/code/configuration.md`：`ragflow_demo/ragflow_config.json` 配置项说明（以及前端可覆盖的 TTS 参数）
- `doc/code/debugging_white_noise.md`：端到端“白噪声”问题排查清单（含 `/api/events`、`/api/status` 用法）
- `doc/code/architecture.md`：一页式架构与数据流 + 扩展点（后续加功能/重构建议落点）
- `doc/code/contracts.md`：前后端契约（SSE/TTS/取消/观测）与兼容策略
- `doc/code/state_machine.md`：前端 run/TTS 队列状态机与中断策略（重构抓手）
- `doc/code/observability.md`：事件/日志/状态指标规范（新增功能必须补的观测点）
- `doc/code/testing.md`：建议的最小测试集（契约/中断/音频格式守门）
- `doc/code/dev_runbook.md`：本地运行与排障手册（依赖、端口、常见问题）
