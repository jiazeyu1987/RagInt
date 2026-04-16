# Reliability

本文件记录 RagInt 当前从代码与配置中可直接观察到的可靠性设计与风险。

## 运行形态

- 后端：Flask 应用，入口在 [`backend/app.py`](../backend/app.py)，组装逻辑在 [`backend/bootstrap.py`](../backend/bootstrap.py)
- 前端：React 18，入口在 [`fronted/src/App.js`](../fronted/src/App.js)，核心编排在 [`fronted/src/app/AppShell.js`](../fronted/src/app/AppShell.js)
- 组合部署：[`docker-compose.yml`](../docker-compose.yml) 提供 `redis`、`backend`、`fronted` 三服务

## 当前可靠性抓手

### 状态后端可切换

- 默认可使用内存态事件存储
- 当 `RAGINT_STATE_BACKEND=redis` 时，后端切到 Redis 事件/状态后端
- README 已明确多进程/多实例场景推荐 Redis

### 请求取消与事件时间线

- 后端有 request registry、event store、status/events 接口
- 前端有中断管理、队列管理、导览控制与恢复逻辑

### 可观察性入口

- `/health`
- `/api/status`
- `/api/events`
- `/api/diagnostics`

### 本地持久化

- `breakpoints.db`
- `qa_history.db`
- `qa_audio_cache.db`
- `tour_control.db`
- `ops.db`
- `recordings.db`

## 主要风险

### 单机依赖仍然偏强

- SQLite 和本地文件目录是默认持久化介质
- 如果直接扩展到多实例而不启用 Redis、共享存储和明确的数据策略，行为一致性会下降

### 外部能力边界不够统一

- RAGFlow、VoiceKit、SAUC、TTS provider 都是关键外部依赖
- 某些能力允许按环境决定是否严格要求
- 这些依赖的故障处理方式还没有统一运维手册

### 数据目录直接留在仓库

- `backend/data/` 下既有 SQLite，又有缓存音频、录制音频、日志和临时文件
- 这有利于本地调试，但不利于数据治理和版本管理

## 建议的默认运行姿势

### 本地开发

- 允许使用 `memory` 状态后端
- 重点关注接口、导览、录制和回放链路是否可跑通

### 联调或多人共享环境

- 启用 Redis 状态后端
- 明确数据目录保留策略
- 将 diagnostics 与 ops 纳入受控凭据

### 交付环境

- 不依赖仓库内 JSON 保存真实密钥
- 不默认开放 ops 和 diagnostics
- 为录制、缓存、日志与数据库制定备份和清理周期

## 与测试的关系

- `backend/tests/` 是当前后端稳定性的重要证据来源
- `fronted/e2e/` 为关键前端业务链路提供了兜底验证
- 可用性与可靠性不只等于“测试通过”，还包括部署拓扑、配置边界、数据留存和外部依赖失败后的可诊断性
