# Security

本文件只记录当前仓库可观察到的安全现状与风险，不包含任何真实密钥值。

## 保护对象

- RAGFlow、DashScope、TTS/ASR provider 相关凭据
- 设备与运维接口
- 诊断包、日志、录制音频、问答历史和缓存音频
- 导览控制指令和设备配置

## 已有控制点

### 环境变量优先

- 后端 `.env.example` 已给出 `RAGINT_OPS_ADMIN_TOKEN`、`RAGINT_OPS_VIEW_TOKEN`、`RAGINT_DEVICE_SHARED_SECRET`、`RAGINT_DIAGNOSTICS_KEY` 等入口。
- 前端 `.env.example` 只保留少量运行参数，不直接暴露高敏感配置。

### 诊断与运维访问控制

- `/api/diagnostics` 支持通过 `RAGINT_DIAGNOSTICS_KEY` 保护。
- ops 相关接口支持 admin/view token，并可要求设备 token。

### CORS 与本地默认

- 默认 CORS 允许本地开发端口，降低误连生产域名的概率。
- `docker-compose.yml` 中的部署示例也围绕本地端口组织。

## 当前风险

### 1. 仓库内存在未遮蔽的敏感配置样式

- [`ragflow_demo/ragflow_config.json`](../ragflow_demo/ragflow_config.json) 当前包含未遮蔽的 `api_key` 字段。
- 无论该值是否仍有效，这都意味着密钥治理边界不清晰。
- 建议立即轮换密钥，并把仓库内样例改成占位符或环境变量注入说明。

### 2. 数据资产直接落在仓库目录

- `backend/data/recordings/`、`backend/data/qa_audio_cache/`、`backend/data/logs/` 中包含音频、缓存、日志等资产。
- 这些内容可能包含用户语音、文本问答、系统状态与调试线索。
- 当前仓库更像开发快照，而不是最小化数据面。

### 3. 可选开放开关需要谨慎

- `RAGINT_OPS_OPEN_ACCESS=1` 会显式开放 ops。
- `RAGINT_DIAGNOSTICS_ALLOW_NO_KEY=1` 会允许无 key 访问诊断包。
- 这类开关适合本地调试，不适合默认交付。

### 4. 语音与回放资产缺少数据分级文档

- 录制、缓存与导览内容实际已经形成“可复用内容库”。
- 但仓库内还没有清晰的数据留存、清理、脱敏和导出策略说明。

## 最低安全基线

1. 样例配置文件不保留真实凭据。
2. 运维与诊断接口默认关闭匿名访问。
3. 录制与缓存目录不直接纳入长期版本控制。
4. 任何新文档都不写入真实 key、token、密码或完整样例值。

## 下一步建议

- 轮换并移除仓库中的真实样式密钥。
- 为 `backend/data/` 制定忽略、清理和归档策略。
- 明确哪类日志和音频可以留存，哪类必须清理。
- 为 ops、device、diagnostics 补一页最小权限使用手册。
