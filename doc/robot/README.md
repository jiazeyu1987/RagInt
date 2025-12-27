# 文档索引（交付/验收用）

本文档用于把“用户需求 -> 软件需求 -> 详细设计 -> 运维交付”串起来，便于评审与验收。

## 1. 阅读顺序（推荐）

1) `doc/robot/用户需求.md`：本期要做什么/不做什么，以及未闭环边界
2) `doc/robot/软件需求文档.md`：FR/NFR 条目 + 可操作验收条款（重点看 FR-1/FR-6/FR-9）
3) `doc/robot/软件详细设计文档.md`：SD 分解与实现口径（重点看 SD-6/SD-9 的表格）
4) `doc/robot/运维交付操作手册.md`：现场启动、健康检查、导出、排障

## 2. 关键验收入口（后端）

- 健康检查：`http://localhost:8000/api/health`
- 一键诊断：`http://localhost:8000/api/diag`
- 状态查询：`http://localhost:8000/api/status?request_id=<request_id>`
- 事件导出：`http://localhost:8000/api/events?request_id=<request_id>&format=ndjson`
- 日志导出：`http://localhost:8000/api/logs/download`、`http://localhost:8000/api/logs?tail_kb=256`

## 3. 关键验收入口（前端）

- 调试面板：右侧「调试面板」可执行“一键诊断/导出事件/下载日志”
- 离线播报：顶部控制条「离线播报/停止离线」（依赖本地离线资源清单与音频文件）

