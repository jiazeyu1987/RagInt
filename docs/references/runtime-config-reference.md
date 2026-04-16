# Runtime Config Reference

## 后端环境变量

以下变量直接来自 [`backend/.env.example`](../backend/.env.example) 或运行代码中的读取逻辑：

- `RAGINT_HOST`, `RAGINT_PORT`, `RAGINT_DEBUG`
- `RAGINT_CORS_ORIGINS`
- `RAGINT_CONFIG_PATH`
- `RAGINT_KB_VERSION`
- `RAGINT_SENSITIVE_WORDS`
- `RAGINT_REQUIRE_VOICEKIT`
- `RAGINT_STATE_BACKEND`, `RAGINT_REDIS_URL`, `RAGINT_REDIS_PREFIX`
- `RAGINT_BREAKPOINT_DB_PATH`
- `RAGINT_TOUR_CONTROL_DB_PATH`
- `RAGINT_SELLING_POINTS_DB_PATH`
- `RAGINT_OPS_DB_PATH`
- `RAGINT_OPS_ADMIN_TOKEN`, `RAGINT_OPS_VIEW_TOKEN`, `RAGINT_OPS_OPEN_ACCESS`
- `RAGINT_DEVICE_SHARED_SECRET`, `RAGINT_DEVICE_AUTH_REQUIRED`
- `RAGINT_DIAGNOSTICS_KEY`, `RAGINT_DIAGNOSTICS_ALLOW_NO_KEY`
- `RAGFLOW_API_KEY`, `RAGFLOW_BASE_URL`, `RAGFLOW_DATASET_NAME`, `RAGFLOW_DEFAULT_CONVERSATION_NAME`
- `BAILIAN_API_KEY`, `DASHSCOPE_API_KEY`

## 前端环境变量

来自 [`fronted/.env.example`](../../fronted/.env.example) 和 `fronted/src/config/*.js`：

- `PORT`
- `REACT_APP_BACKEND_URL`
- `REACT_APP_BACKEND_BASE`
- `REACT_APP_VOICE_DEBUG`
- `REACT_APP_ASK_TRACE_DEBUG`
- `REACT_APP_WAKE_HOLD_MS`

## 非 env 配置来源

- `ragflow_demo/ragflow_config.json`: 当前仓库中的示例/运行配置载体之一
- `backend/data/ragflow_config.db`: RAGFlow 配置持久化
- `backend/data/app_settings.db`: 应用设置持久化
- 前端 localStorage: UI 视图模式与部分客户端侧设置

## 建议理解方式

1. 先看 env 是否覆盖
2. 再看 JSON / SQLite 中是否持久化了运行配置
3. 最后看前端是否在本地保存了纯 UI 偏好
