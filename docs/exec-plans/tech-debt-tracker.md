# Tech Debt Tracker

| ID | Debt | Evidence | Impact | Priority | Suggested Next Step |
| --- | --- | --- | --- | --- | --- |
| TD-001 | 前端主编排过大 | `fronted/src/app/AppShell.js` 承担大量状态、事件和模式切换 | 提高改动风险与 onboarding 成本 | High | 继续拆分为更稳定的容器与子管线 |
| TD-002 | 仓库内存在真实样式敏感配置 | `ragflow_demo/ragflow_config.json` 含未遮蔽 `api_key` 字段 | 安全风险、样例边界不清 | Critical | 立即轮换并改成占位符/环境变量说明 |
| TD-003 | 运行数据直接落库到仓库目录 | `backend/data/` 下有 SQLite、录音、缓存与日志 | 数据治理、版本管理和隐私风险 | High | 把运行数据移出仓库默认路径或加强忽略策略 |
| TD-004 | 目录命名存在历史包袱 | 前端目录名为 `fronted/` | 增加认知负担和自动化脚本歧义 | Medium | 评估统一命名或在文档中固定解释 |
| TD-005 | 旧文档存在编码问题 | `fronted/docs/interaction-flow.md` 当前可读性差 | 文档不可复用、误导读者 | Medium | 用新文档替代并清理旧文档编码 |
| TD-006 | 配置来源分散 | env、JSON、SQLite、本地设置共同参与运行 | 难以判断单一事实来源 | High | 建立配置优先级和责任边界文档 |
| TD-007 | 版本标识默认值弱 | `backend/version.py` 缺省返回 `0.0.0` | 交付物追踪弱 | Medium | 在 CI/发布中强制注入版本号 |
| TD-008 | fallback 相关历史路径仍可见 | 已清理 `backend/orchestrators/ragflow_streaming_fallback.py`、TTS registry 自动降级、VoiceKit 可选启动、ASR filter 原文回退、RAGFlow 非流式回退 | 本轮已消除主要“伪装成功”路径；剩余 fallback 字样多为显式配置、文件名兜底或相似度算法命名 | Done | 后续只在触及相关模块时继续评估局部命名与历史注释 |
