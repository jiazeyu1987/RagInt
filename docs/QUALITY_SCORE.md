# Quality Score

以下评分是基于当前仓库可观察到的代码、测试、配置和运维入口做的工程质量快照，不是形式化审计结果。

## 评分方法

- 10 分代表该维度已形成较清晰的默认实践和可复查证据。
- 5 分代表有实现基础，但边界、文档或治理仍不稳定。
- 3 分以下代表高风险或明显缺口。

## 维度评分

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 后端模块化 | 7/10 | `api/services/orchestrators/infra/config` 分层清晰，blueprint 切分明确 |
| 前端模块化 | 5/10 | `hooks`/`managers`/`voice` 已拆分，但 `AppShell.js` 仍承担大量编排职责 |
| 自动化测试 | 8/10 | `backend/tests` 约 84 个测试文件，前端也有组件测试和 4 个 Playwright e2e |
| 可观察性 | 7/10 | 有 `/health`、`/api/status`、`/api/events`、`/api/diagnostics` 与事件存储 |
| 配置治理 | 5/10 | `.env` 示例齐全，但真实配置来源分散在 env、JSON、SQLite 和前端本地设置 |
| 文档完备度 | 3/10 -> 7/10 | 本次任务前几乎缺失，补齐后可达到可维护水平，但仍需伴随代码持续更新 |
| 安全治理 | 4/10 | 有 token/diagnostics/open-access 开关，但仓库内存在未遮蔽敏感配置和样例数据风险 |
| 可靠性 | 6/10 | 支持 Redis、多种状态与取消机制，但默认仍偏单机、本地文件和 SQLite |

## 结论

- 综合观察：`6.1 / 10`
- 最强项：后端测试基础、功能完整度、导览/问答/录制/回放一体化能力。
- 最弱项：前端核心编排体量、敏感配置治理、数据落库边界和历史文档缺失。

## 优先改进建议

1. 先收紧安全与配置治理，再继续扩大功能面。
2. 把前端编排层继续拆小，减少对单一大组件的依赖。
3. 将数据库结构、运行时配置和技术债跟踪纳入固定文档更新流程。

## 相关文档

- [`docs/RELIABILITY.md`](./RELIABILITY.md)
- [`docs/SECURITY.md`](./SECURITY.md)
- [`docs/exec-plans/tech-debt-tracker.md`](./exec-plans/tech-debt-tracker.md)
