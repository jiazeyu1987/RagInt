# 开发/运行手册（Dev Runbook）

本文档用于让新同学或我（后续重构时）快速把项目跑起来，并能定位“没声音/卡住/白噪声/接口失败”等常见问题。

## 1. 目录与端口

- 后端：`backend/`，Flask 默认 `http://localhost:8000`
- 前端：`fronted/`，React 开发服务器默认 `http://localhost:3000`

## 2. 启动方式（本地）

### 2.1 后端（Python）

依赖文件：`backend/requirements.txt`

常见启动：
- 进入 `backend/` 后运行 `python app.py`

注意事项：
- ASR 预处理依赖 `ffmpeg`（`backend/services/asr_service.py` 调用外部命令）
- RAGFlow 的 `api_key/base_url` 读取自 `ragflow_demo/ragflow_config.json`

### 2.2 前端（Node）

依赖文件：`fronted/package.json`

常见启动：
- 进入 `fronted/` 后运行 `npm run start`

后端地址：
- 目前前端写死 `http://localhost:8000`（见 `fronted/src/api/backendClient.js`）

## 3. 配置与环境

主配置：`ragflow_demo/ragflow_config.json`

关键段：
- `asr.*`：ASR provider 与预处理
- `text_cleaning.*`：Ask 的分段策略（影响 TTS 段落节奏）
- `tts.*`：默认 TTS provider 与具体 provider 配置
- `tour.*` / `tour_planner.*`：导览站点与路线规划

建议：
- 不要把生产密钥提交到仓库；优先用占位符 + 部署注入（当前代码仍会直接读文件）

## 4. 常见问题排查入口

### 4.1 先看后端健康

- `GET /health`

### 4.2 再看单次 run 的事件与状态

拿到 `request_id` 后：
- `GET /api/events?request_id=<RID>`
- `GET /api/status?request_id=<RID>`

### 4.3 前端没声音（但有文本）

常见原因：
- 音频自动播放被浏览器拦截（需要用户交互解锁 AudioContext）
- TTS provider 返回格式与前端假设不一致

排查：
- 打开前端 Console，看是否触发了 WebAudio fallback
- 看 `/api/events` 是否有 `tts_*_failed`、`wav_probe_failed`、`pcm_probe_suspect_white_noise`

### 4.4 白噪声

优先看：`doc/code/debugging_white_noise.md`

### 4.5 频繁被取消/串音

检查：
- 前端是否复用同一个 `client_id`（应稳定）
- 新 run 是否复用旧 `request_id`（不应复用）
- `/api/events` 中是否出现大量 `*_client_disconnect`、`*_cancelled_*`

## 5. 录制/回放（导览）

后端保存位置：
- `backend/data/recordings/`

相关 API：
- `GET /api/recordings`
- `POST /api/recordings/start`
- `POST /api/recordings/<id>/finish`
- `GET /api/recordings/<id>/stop/<stop_index>`
- `GET /api/recordings/<id>/audio/<filename>`

## 6. 开发改动建议（避免踩坑）

- 改 SSE 字段/语义前：先更新 `doc/code/contracts.md`
- 改中断/连续导览逻辑前：先更新 `doc/code/state_machine.md`
- 改 TTS 格式/播放链路前：先更新 `doc/code/frontend_audio.md` + `doc/code/debugging_white_noise.md`

