# Database Schema

本文件根据仓库当前 `backend/data/*.db` 中可读取到的 SQLite 表结构整理，不推测仓库外部数据库。

## 来源

- `backend/data/app_settings.db`
- `backend/data/breakpoints.db`
- `backend/data/ops.db`
- `backend/data/qa_audio_cache.db`
- `backend/data/qa_history.db`
- `backend/data/ragflow_config.db`
- `backend/data/selling_points.db`
- `backend/data/tour_control.db`
- `backend/data/recordings/recordings.db`

## 应用设置

### `app_settings.db`

- Table: `app_settings`

```sql
CREATE TABLE app_settings (
    scope_id TEXT NOT NULL PRIMARY KEY,
    settings_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
)
```

## 断点恢复

### `breakpoints.db`

- Table: `breakpoints`

```sql
CREATE TABLE breakpoints (
    kind TEXT NOT NULL,
    client_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (kind, client_id)
)
```

## 运维与设备

### `ops.db`

- Tables: `devices`, `device_configs`, `device_tokens`, `ops_audit`

```sql
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    meta_json TEXT NOT NULL DEFAULT '{}',
    last_seen_at_ms INTEGER NOT NULL
)
```

```sql
CREATE TABLE device_configs (
    device_id TEXT PRIMARY KEY,
    config_version INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at_ms INTEGER NOT NULL
)
```

```sql
CREATE TABLE device_tokens (
    device_id TEXT PRIMARY KEY,
    token_sha256 TEXT NOT NULL,
    issued_at_ms INTEGER NOT NULL,
    revoked_at_ms INTEGER
)
```

```sql
CREATE TABLE ops_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_ms INTEGER NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}'
)
```

## 问答缓存与历史

### `qa_history.db`

- Tables: `qa_history`, `qa_cache`

```sql
CREATE TABLE qa_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    mode TEXT NOT NULL,
    chat_name TEXT,
    agent_id TEXT
)
```

```sql
CREATE TABLE qa_cache (
    normalized_question TEXT NOT NULL,
    kb_version TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at_ms INTEGER,
    PRIMARY KEY (normalized_question, kb_version)
)
```

## 问答音频缓存

### `qa_audio_cache.db`

- Tables: `qa_audio_pairs`, `qa_audio_embeddings`

```sql
CREATE TABLE qa_audio_pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_question TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    audio_rel_path TEXT NOT NULL,
    tts_provider TEXT NOT NULL,
    tts_voice TEXT NOT NULL,
    tts_speed REAL NOT NULL,
    source_request_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
)
```

```sql
CREATE TABLE qa_audio_embeddings (
    pair_id INTEGER PRIMARY KEY,
    embedding_model TEXT NOT NULL,
    embedding_dim INTEGER NOT NULL,
    vector_blob BLOB NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY(pair_id) REFERENCES qa_audio_pairs(id) ON DELETE CASCADE
)
```

## RAGFlow 配置

### `ragflow_config.db`

- Table: `ragflow_config`

```sql
CREATE TABLE ragflow_config (
    scope_id TEXT NOT NULL PRIMARY KEY,
    config_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
)
```

## 卖点库

### `selling_points.db`

- Table: `selling_points`

```sql
CREATE TABLE selling_points (
    stop_name TEXT NOT NULL,
    text TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT "[]",
    updated_at_ms INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT "public",
    status TEXT NOT NULL DEFAULT "published",
    PRIMARY KEY (stop_name, text)
)
```

## 导览控制

### `tour_control.db`

- Tables: `tour_control_commands`, `tour_control_state`

```sql
CREATE TABLE tour_control_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    consumed_at_ms INTEGER
)
```

```sql
CREATE TABLE tour_control_state (
    client_id TEXT PRIMARY KEY,
    paused INTEGER NOT NULL DEFAULT 0,
    speed REAL NOT NULL DEFAULT 1.0,
    updated_at_ms INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting'
)
```

## 录制归档

### `recordings.db`

- Tables: `recordings`, `recording_ask_events`, `recording_tts_audio`

```sql
CREATE TABLE recordings (
    recording_id TEXT PRIMARY KEY,
    created_at_ms INTEGER NOT NULL,
    finished_at_ms INTEGER,
    stops_json TEXT NOT NULL,
    display_name TEXT,
    metadata_json TEXT
)
```

```sql
CREATE TABLE recording_ask_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id TEXT NOT NULL,
    stop_index INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT,
    created_at_ms INTEGER NOT NULL
)
```

```sql
CREATE TABLE recording_tts_audio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id TEXT NOT NULL,
    stop_index INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    segment_index INTEGER,
    seq INTEGER NOT NULL,
    text TEXT,
    rel_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER
)
```
