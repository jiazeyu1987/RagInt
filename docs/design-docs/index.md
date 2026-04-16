# 设计文档索引

本目录用于承载 RagInt 的可导航设计文档，面向开发协作与实现对齐。

## 阅读顺序

1. [`core-beliefs.md`](./core-beliefs.md)
2. [`backend-architecture.md`](./backend-architecture.md)
3. [`frontend-architecture.md`](./frontend-architecture.md)
4. [`interaction-flow.md`](./interaction-flow.md)

快速入口：[`interaction-flow.md`](./interaction-flow.md)

## 代码入口索引

- 后端 Flask 入口：`backend/app.py`
- 后端依赖组装与 blueprint 注册：`backend/bootstrap.py`
- 前端入口：`fronted/src/App.js`
- 前端编排根：`fronted/src/app/AppShell.js`
- 容器编排：`docker-compose.yml`

## 后端 API 族群索引（真实文件 + 接口示例）

- `system`：`backend/api/system.py`
  - `GET /api/version`、`GET /api/status`、`GET /health`
- `app_settings`：`backend/api/app_settings.py`
  - `GET/PUT /api/app_settings`
- `breakpoint`：`backend/api/breakpoint.py`
  - `GET/POST/DELETE /api/breakpoint`
- `tour_control`：`backend/api/tour_control.py`
  - `GET/POST /api/tour/control`
- `tour_command`：`backend/api/tour_command.py`
  - `POST /api/tour/command/parse`
- `selling_points`：`backend/api/selling_points.py`
  - `GET/POST/DELETE /api/selling_points`
- `ops`：`backend/api/ops.py`
  - `GET /api/ops/devices`、`POST /api/ops/heartbeat`
- `qa_audio_cache`：`backend/api/qa_audio_cache.py`
  - `GET /api/qa_audio_cache/audio/<pair_id>`
- `speech`：`backend/api/speech.py`
  - `POST /api/ask`、`POST /api/asr/filter`、`GET /api/asr/sauc/health`
- `recordings`：`backend/api/recordings.py`
  - `GET /api/recordings`、`POST /api/recordings/start`
- `tts`：`backend/api/tts.py`
  - `POST /api/text_to_speech`、`GET/POST /api/text_to_speech_stream`

## 文档出口

- 设计总览：[`../DESIGN.md`](../DESIGN.md)
- 前端专项：[`../FRONTEND.md`](../FRONTEND.md)
- 根架构总览：[`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
