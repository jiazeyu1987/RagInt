# Plans

本文件记录 RagInt 当前更适合落地的工程计划，而不是泛化路线图。

## 当前优先级

1. 文档体系收敛：补齐架构、产品、质量、可靠性、安全和参考文档，让新成员和自动化代理都能在仓库内完成自助理解。
2. 前端解耦：逐步拆分 [`fronted/src/app/AppShell.js`](../fronted/src/app/AppShell.js) 的状态编排，把 UI、对话、导览、录制与 ASR/TTS 管线进一步模块化。
3. 配置与密钥治理：收敛 `.env`、`ragflow_demo/ragflow_config.json`、SQLite 持久化设置和前端本地设置的边界，去除仓库中的真实敏感配置。
4. 运行可靠性治理：统一单机/多实例部署的推荐姿势，明确何时必须启用 Redis、何时允许本地 memory state。

## 近期待办

- 当前活动计划：[`docs/exec-plans/active/docs-20260407T232251`](./exec-plans/active/docs-20260407T232251/)
- 技术债跟踪：[`docs/exec-plans/tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md)
- 完成计划归档说明：[`docs/exec-plans/completed/README.md`](./exec-plans/completed/README.md)

## 建议节奏

### 0-30 天

- 用当前这套文档替代“靠口头传递”的知识入口。
- 处理仓库内敏感配置与样例数据问题。
- 把数据库结构和运行时配置纳入固定文档更新流程。

### 30-60 天

- 以 `AppShell -> hooks -> managers` 为边界继续拆前端编排逻辑。
- 给后端 blueprint 和持久化层建立更明确的领域划分说明。
- 把回放、录制、问答缓存、运维台几个子系统的验收标准整理成独立执行计划。

### 60-90 天

- 评估是否引入更统一的打包与 Python 依赖管理方案。
- 明确多实例部署、日志采集、诊断包下载和数据保留策略。
- 建立“文档变更必须伴随验证”的默认流程。

## 计划边界

- 这里不替代 PRD，也不替代当前任务目录下的执行工件。
- 这里记录“下一步应该做什么”，不代表这些工作已经完成。
