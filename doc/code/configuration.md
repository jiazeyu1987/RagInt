# Configuration Reference

Primary config: `ragflow_demo/ragflow_config.json`

## Top-level

- `api_key` / `base_url`: RAGFlow credentials/endpoint
- `dataset_name`: dataset to attach to chat(s)
- `default_conversation_name`: default chat for the frontend

## `asr`

- `asr.provider`: `funasr` (default), `faster_whisper`, `dashscope`
- `asr.preprocess.trim_silence`: `true|false` (ffmpeg silenceremove)
- `asr.preprocess.normalize`: `true|false` (ffmpeg loudnorm)
- `asr.preprocess.loudnorm_filter`: optional override for loudnorm filter string
- `asr.preprocess.silenceremove_filter`: optional override for silenceremove filter string

### `asr.funasr`

- `asr.funasr.model`: FunASR model id/path
- `asr.funasr.device`: `cpu` / `cuda` etc
- `asr.funasr.disable_update`: boolean
- `asr.funasr.kwargs`: dict passed to `AutoModel(...)`

### `asr.faster_whisper`

- `asr.faster_whisper.model`: Whisper model size or path (e.g. `large-v3`)
- `asr.faster_whisper.device`: `cpu` / `cuda`
- `asr.faster_whisper.compute_type`: e.g. `int8`, `float16`
- `asr.faster_whisper.cpu_threads`: optional int
- `asr.faster_whisper.language`: e.g. `zh`
- `asr.faster_whisper.beam_size`: int
- `asr.faster_whisper.vad_filter`: boolean
- `asr.faster_whisper.initial_prompt`: optional string

### `asr.dashscope`

- `asr.dashscope.api_key`: DashScope ASR key (if used)
- `asr.dashscope.model`: e.g. `paraformer-realtime-v2`
- `asr.dashscope.kwargs`: passed to SDK

## `text_cleaning`

Used by `POST /api/ask` streaming segmentation.

Key fields:
- `enabled`: enable cleaner + segment buffer
- `language`: `zh-CN` etc
- `cleaning_level`: affects cleaner rules
- `tts_buffer_enabled`: enable segmentation emission
- `max_chunk_size`: segmentation buffer size
- `start_tts_on_first_chunk`: emit early after first chunk
- `first_segment_min_chars`: min chars for first TTS segment
- `segment_flush_interval_s`: time-based forced emission
- `segment_min_chars`: min chars for later segments

## `tts`

- `tts.provider`: `bailian` or `local`
- `tts.mimetype`: usually `audio/wav`

### `tts.local`

Local GPT-SoVITS HTTP (often disabled):
- `enabled`: `false` to avoid hitting `127.0.0.1:9880`
- `url`, `timeout_s`, `media_type`, etc.

### `tts.bailian`

DashScope/CosyVoice streaming:
- `mode`: `dashscope` or `http`
- `api_key`: DashScope key
- `model`: `cosyvoice-v3-plus`
- `voice`: voice id
- `format`: `wav` (recommended for current frontend)
- `sample_rate`: `16000` (matches frontend preferred sample rate)
- `use_connection_pool`: `true|false`
- `pool_max_size`: pool size
- `queue_max_chunks`: buffering (backend)
- `first_chunk_timeout_s`: cancel if first audio too slow
- `pcm_probe_target_bytes`: probe bytes for noise detection
