# 后端架构（Flask 组装与 API 族群）

## 1. 入口与组装

- Flask 入口：`backend/app.py`
- 依赖组装：`backend/bootstrap.py`

`create_app()` 的核心顺序：

1. 创建 Flask 应用并配置 CORS。
2. `build_deps(...)` 组装服务与 store。
3. `init_ragflow(...)` 初始化 RAGFlow 默认能力。
4. `register_blueprints(...)` 注册业务 API。
5. `register_voicekit(...)` 和 `register_sauc_proxy(...)` 注册语音 WS 入口。

## 2. Blueprint 族群与接口

| 族群 | 文件 | 接口示例 |
| --- | --- | --- |
| system | `backend/api/system.py` | `GET /api/version`、`GET /api/status`、`GET /health` |
| app_settings | `backend/api/app_settings.py` | `GET/PUT /api/app_settings` |
| breakpoint | `backend/api/breakpoint.py` | `GET/POST/DELETE /api/breakpoint` |
| tour_control | `backend/api/tour_control.py` | `GET/POST /api/tour/control`、`POST /api/tour/control/consume` |
| tour_command | `backend/api/tour_command.py` | `POST /api/tour/command/parse` |
| selling_points | `backend/api/selling_points.py` | `GET/POST/DELETE /api/selling_points` |
| ops | `backend/api/ops.py` | `GET /api/ops/devices`、`POST /api/ops/heartbeat`、`GET /api/ops/audit` |
| qa_audio_cache | `backend/api/qa_audio_cache.py` | `GET /api/qa_audio_cache/audio/<pair_id>` |
| speech | `backend/api/speech.py` | `POST /api/ask`、`POST /api/asr/filter`、`GET /api/asr/sauc/health` |
| recordings | `backend/api/recordings.py` | `GET /api/recordings`、`POST /api/recordings/start` |
| tts | `backend/api/tts.py` | `POST /api/text_to_speech`、`GET/POST /api/text_to_speech_stream` |

补充：同一注册点还包含 `offline` 和 `ragflow_tour_history` blueprint。

## 3. 依赖与存储角色

## 3.1 RAGFlow

- 主要入口：`backend/services/ragflow_service.py`
- 角色：聊天会话、Agent 列表、问答调用、会话清理。

## 3.2 VoiceKit

- 注册点：`bootstrap.register_voicekit(...)`
- 角色：提供 `/voicekit/ws/asr` 实时 ASR WS 服务。

## 3.3 SAUC

- 注册点：`bootstrap.register_sauc_proxy(...)`
- 实现：`backend/ws/sauc_proxy.py`
- 角色：把浏览器 WS 请求代理到 SAUC 上游 WS。

## 3.4 SQLite 与 Redis

- SQLite：`build_deps` 中多个 `*Store` 默认落库到 `backend/data/*.db`。
- Redis：`RAGINT_STATE_BACKEND=redis` 时使用 `RedisEventStore`，承载事件时间线与状态后端能力。

## 4. 容器运行关系

`docker-compose.yml` 中：

- `backend` 对外端口 `8000`
- `fronted` 对外端口 `4981`
- `redis` 与 `backend` 通过 `RAGINT_REDIS_URL` 连接
