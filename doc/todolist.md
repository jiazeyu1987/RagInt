# TODO List（按优先级）

> 来源：对照 `doc/robot/软件详细设计文档.md` 与当前仓库代码现状整理。

## P0（必须补齐：影响“现场可用/可交付”）

- **SD-5 移动与到站对接：真实导航/底盘适配层 + API 闭环（不含 SLAM）**
  - 目标：把目前前端 `nav_*` “skipped”占位事件替换为真实链路，做到“切站→移动→到站→讲解；失败/急停→停讲解并提示人工介入”。
  - 缺口：
    - 后端缺少导航接口（示例：`/api/nav/go_to`、`/api/nav/cancel`、`/api/nav/state`）与对应服务模块（adapter）。
    - 缺少到站判定/超时/失败原因语义（arrived/failed/cancelled/estop/timeout）。
    - 前端缺少真实移动状态订阅/轮询与失败恢复 UI（重试/跳过/暂停）。
  - 线索/位置：`doc/robot/软件详细设计文档.md:141`、`backend/app.py:250`、`fronted/src/managers/AskWorkflowManager.js:279`

## P1（重要：提升可运维性/可持续迭代）

- **SD-8 配置与站点管理：导入/导出/备份 + 校验 +（可选）可视化编辑**
  - 目标：站点/路线/参数可维护，变更可回退；配置错误时可明确报错并进入安全状态。
  - 状态：已实现（后端接口 + 前端调试面板入口，导入会自动备份；导出会自动去除密钥字段）
  - 位置：`backend/app.py:395`（`/api/config/*`）、`backend/services/config_service.py:1`、`fronted/src/components/DebugPanel.js:1`

- **SD-9 降级与恢复：自动降级触发 + 恢复探测闭环**
  - 目标：在线服务异常（RAG/ASR/TTS）时可自动触发“仅文本/离线播报”等策略，并支持探测恢复（或明确人工恢复入口）。
  - 状态：已实现最小闭环（RAG 异常：问答固定兜底话术；讲解/切站链路触发自动切换离线；离线期间定时探测 `/api/health` 并给出“在线已恢复”提示；TTS 音频异常也会触发自动离线）
  - 位置：`fronted/src/managers/AskWorkflowManager.js:420`、`fronted/src/App.js:230`、`fronted/src/components/ControlBar.js:1`

## P2（增强：工程化与长期稳定）

- **SD-10 性能与稳定：压测/长稳/守护与自动巡检脚本**
  - 目标：补齐最小压测流程、长期运行守护（重启/资源阈值）、自动化巡检（CPU/内存/磁盘/网络/音频/底盘连通）。
  - 状态：已实现最小可执行脚本（巡检 + 守护 + soak）
  - 位置：`scripts/ops/health_check.ps1:1`、`scripts/ops/backend_watchdog.ps1:1`、`scripts/test/soak_backend.ps1:1`

- **SD-11 可维护与可扩展：适配层插件化/接口抽象更严格**
  - 目标：让 RAG/ASR/TTS/导航替换集中在 adapter 层，编排层不感知具体实现。
  - 状态：已落地导航适配层（provider 插件化：`mock/http`），`NavService` 只依赖统一接口
  - 位置：`backend/adapters/nav_provider.py:1`、`backend/services/nav_service.py:1`
