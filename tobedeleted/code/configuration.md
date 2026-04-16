# 配置说明（`ragflow_demo/ragflow_config.json`）

后端通过 `backend/services/ragflow_service.py` 读取 `ragflow_demo/ragflow_config.json`，并在 `backend/app.py` 中通过 `load_app_config()` 获取运行时配置。

## 顶层字段

- `api_key` / `base_url`：RAGFlow 凭证与地址
- `dataset_name`：用于创建/绑定 chat 的数据集名
- `default_conversation_name`：前端默认选中的 chat 名

## `asr`

- `asr.provider`：`funasr` / `faster_whisper` / `dashscope`
- `asr.preprocess.trim_silence`：是否先做静音裁剪（`ffmpeg`）
- `asr.preprocess.normalize`：是否做响度归一（`ffmpeg loudnorm`）

按 provider 分组的子配置：
- `asr.funasr.*`
- `asr.faster_whisper.*`
- `asr.dashscope.*`（含 `api_key`、`model`、`kwargs`）

## `text_cleaning`（影响 `/api/ask` 的分段策略）

常用字段：
- `enabled`：是否启用清洗/分段
- `tts_buffer_enabled`：是否启用面向 TTS 的分段缓冲（推荐开启）
- `semantic_chunking`：是否偏“语义分段”（开启时对段落更友好）
- `max_chunk_size`：分段缓冲窗口上限（字符数）
- `start_tts_on_first_chunk`：是否在拿到首批 token 后尽快输出第一段 `segment`
- `first_segment_min_chars`：第一段最小字符数
- `segment_min_chars`：后续段最小字符数
- `segment_flush_interval_s`：按时间强制 flush（避免长时间不出段）

## `tour` / `tour_planner`（导览站点与规划）

- `tour.stops`：站点列表（也会被 `/api/tour/stops` 返回）

`tour_planner` 用于 `/api/tour/meta` 与 `/api/tour/plan`：
- `zones` / `profiles`：前端下拉选项
- `default_zone` / `default_profile`
- `routes`：`{ "<zone>": ["站点1", "站点2", ...] }`
- `stop_durations_s`：三种形式均支持（见 `backend/services/tour_planner.py`）
  - `{ "<zone>": [..] }`：按路线给一组时长
  - `[ ... ]`：全局列表（与 stops 对齐）
  - `{ "<stop name>": seconds }`：按站点名映射
- `trim_by_duration`：是否按总时长裁剪站点（默认 false）
- `chars_per_second`：用于把 stop 时长换算成“目标字数”（默认约 4.5 字/秒）

## `tts`

### 基础

- `tts.provider`：默认 provider（前端可通过 query/header 覆盖）
- `tts.mimetype`：后端响应的 `Content-Type`（前端默认按 `audio/wav` 处理）

### provider 名称（前后端一致）

前端通过 `/api/text_to_speech_stream` 的 query 参数传入：
- `tts_provider`：例如 `modelscope` / `flash` / `sapi` / `edge` / `sovtts1` / `sovtts2`（最终以 `backend/services/tts_service.py` 的实现为准）
- `tts_voice`：覆盖音色（部分 provider 生效）
- `tts_model`：覆盖模型（部分 provider 生效）

对应的配置块通常包括：
- `tts.bailian.*`：在线 cosyvoice/dashscope（流式）
- `tts.edge.*`：Edge TTS
- `tts.sapi.*`：Windows SAPI
- `tts.sovtts1.*` / `tts.sovtts2.*` / `tts.local.*`：本地 SoVITS HTTP

### 在线（bailian/modelscope/flash）常用字段

`tts.bailian` 常见字段（具体由实现使用）：
- `mode`：`dashscope` 或 `http`
- `model` / `voice` / `format` / `sample_rate`
- `use_connection_pool` / `pool_max_size`
- `queue_max_chunks`：后端内部缓冲上限（过小易导致背压/丢包）
- `first_chunk_timeout_s`
- `pcm_probe_target_bytes`：白噪声探测采样窗口（字节）

## 安全提示

`ragflow_config.json` 会被后端直接读取；不要把生产环境密钥提交到仓库文件中，推荐用占位符并在部署侧注入真实值（当前代码默认仍以文件为准）。

