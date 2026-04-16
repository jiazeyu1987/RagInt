# Test Plan

- Task ID: `asr-e2e-wav-asr-20260411T234431`
- Created: `2026-04-11T23:44:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `ASR 准确性 E2E 测试：使用测试 wav 数据进行真实浏览器 / 真实 ASR 评测`

## Test Scope

验证新增的 ASR accuracy E2E 能否在真实浏览器中用 fake microphone 回放仓库内 `wav`，并在真实 SAUC ASR 链路上得到可比较的最终识别文本。测试范围覆盖 fixture manifest、只读 probe 暴露、Playwright 专用启动配置、runner 的 fail-fast 前置检查，以及至少 3 个 gold set 样本的识别结果。

以下内容不在本次测试范围内：

- 真实硬件麦克风或真人口语采集。
- `emitAsrFinal(...)` 等文本注入 mock 路径。
- RAGFlow `/api/ask` 回答质量、TTS 播放效果或会话继续逻辑。
- 广义“ASR 总体准确率”统计结论。

## Environment

- 操作系统：Windows / PowerShell。
- 代码工作区：`D:\ProjectPackage\RagInt`。
- 后端：`http://127.0.0.1:8000` 可访问，且 `/health`、`/api/asr/sauc/health` 成功。
- 前端：`fronted` 可通过 `npm start` 在 `http://127.0.0.1:4981` 启动。
- 浏览器：Playwright Chromium 已安装，并允许 fake media stream 启动参数。
- 推荐环境变量：
  - `PW_REAL_BACKEND_URL=http://127.0.0.1:8000`
  - `REACT_APP_BACKEND_URL=http://127.0.0.1:8000`
- 平台假设：runner 会通过真实 `/api/app_settings` 暂存并恢复测试所需 ASR 设置；若恢复失败，测试必须判定为 blocked/failed。

## Accounts and Fixtures

- 无需登录账号。
- 需要 fixture manifest 中声明的真实样本文件存在。
- 本次第一版 gold set 来源于仓库已有 `backend/data/qa_audio_cache/audio/*.wav` 与 `backend/data/qa_audio_cache.db` 中的对应文本标注。
- 这些样本主要是系统播报类语音，不代表真人自由口语；tester 需要在报告中记录这一局限。
- 若任一 fixture 缺少音频文件、标注文本、播放时长或 timeout，测试必须 fail fast 并记录缺失项。

## Commands

- `@'\nconst fs = require('fs');\nconst manifest = require('./fronted/e2e/fixtures/asr-accuracy/manifest');\nfor (const item of manifest.fixtures) {\n  if (!fs.existsSync(item.audioPath)) throw new Error(`missing_audio:${item.id}:${item.audioPath}`);\n  if (!String(item.expectedText || '').trim()) throw new Error(`missing_expected:${item.id}`);\n  if (!(Number(item.holdMs) > 0)) throw new Error(`missing_hold:${item.id}`);\n}\nconsole.log(`fixtures_ok:${manifest.fixtures.length}`);\n'@ | node -`
  Expected success signal: 输出 `fixtures_ok:<n>` 且没有抛错。

- `cd fronted; node scripts/run_asr_accuracy_e2e.js --check`
  Expected success signal: 输出 backend/SAUC health、settings snapshot 能力、fixture 可读性检查均通过。

- `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short`
  Expected success signal: Playwright 真实浏览器用例通过，生成该 fixture 的 result json 与截图证据文件。

- `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture math-2x2`
  Expected success signal: Playwright 真实浏览器用例通过，观测到的最终识别文本与 gold transcript 按 spec 约定匹配。

- `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture coating-domain`
  Expected success signal: Playwright 真实浏览器用例通过，长文本样本仍能在 timeout 内完成最终识别并产出证据文件。

- `cd fronted; node scripts/run_asr_accuracy_e2e.js`
  Expected success signal: 默认依次执行所有 fixture，最终退出码为 0，并打印每个 fixture 的结果摘要。

## Test Cases

### T1: Fixture manifest 与样本完整性

- Covers: P1-AC1
- Level: integration
- Command: `@'\nconst fs = require('fs');\nconst manifest = require('./fronted/e2e/fixtures/asr-accuracy/manifest');\nfor (const item of manifest.fixtures) {\n  if (!fs.existsSync(item.audioPath)) throw new Error(`missing_audio:${item.id}:${item.audioPath}`);\n  if (!String(item.expectedText || '').trim()) throw new Error(`missing_expected:${item.id}`);\n  if (!(Number(item.holdMs) > 0)) throw new Error(`missing_hold:${item.id}`);\n  if (!(Number(item.maxFinalWaitMs) > 0)) throw new Error(`missing_timeout:${item.id}`);\n}\nconsole.log(`fixtures_ok:${manifest.fixtures.length}`);\n'@ | node -`
- Expected: 所有 fixture 都有真实音频、预期文本、播放时长和 timeout 定义。

### T2: 只读 ASR probe 可见

- Covers: P1-AC2
- Level: e2e
- Command: `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short --probe-only`
- Expected: 真实页面加载后可读到 `window.__RAGINT_E2E__.getAsrProbeState()`，且该 probe 不暴露文本注入或状态切换写接口。

### T3: 短句样本识别准确

- Covers: P2-AC1, P2-AC3
- Level: e2e
- Command: `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short`
- Expected: fake mic 回放 `no-answer-short` 的 `wav` 后，前端 probe 观测到的最终识别文本与 gold transcript 匹配，并保存截图/结果文件。

### T4: 中等长度数学样本识别准确

- Covers: P2-AC1, P2-AC3
- Level: e2e
- Command: `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture math-2x2`
- Expected: 真实 SAUC ASR 返回的最终文本与 fixture 的 gold transcript 匹配，且输入框文本与 probe 文本一致。

### T5: 领域长句样本识别准确

- Covers: P2-AC3
- Level: e2e
- Command: `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture coating-domain`
- Expected: 长句领域样本在规定 timeout 内产生最终识别结果，并按 fixture 约定通过文本比对。

### T6: Runner 对缺失前置条件 fail fast

- Covers: P2-AC2
- Level: integration
- Command: `cd fronted; node scripts/run_asr_accuracy_e2e.js --check`
- Expected: 若 backend health、SAUC health、fixture 文件或 app settings snapshot/restore 不满足条件，runner 直接返回明确错误，而不是自动切换到 mock 路径。

### T7: 执行与测试证据闭环

- Covers: P3-AC1, P3-AC2
- Level: manual
- Command: `人工复核 docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/execution-log.md 与 test-report.md，并检查被引用的 screenshot/result json/trace 文件确实存在`
- Expected: 执行日志和测试报告都能映射回 acceptance ids，且通过的浏览器 case 有真实证据文件。

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | fixtures | gold set 样本与标注完整 | integration | P1-AC1 | `test-report.md` 中的 fixture 校验结果 |
| T2 | frontend probe | 页面只读 ASR probe 暴露 | e2e | P1-AC2 | Playwright 截图 / result json |
| T3 | real asr short | 短句样本识别准确 | e2e | P2-AC1, P2-AC3 | Playwright 截图 / result json |
| T4 | real asr medium | 数学样本识别准确 | e2e | P2-AC1, P2-AC3 | Playwright 截图 / result json |
| T5 | real asr long | 领域长句样本识别准确 | e2e | P2-AC3 | Playwright 截图 / result json |
| T6 | runner fail-fast | 缺失前置条件时直接失败 | integration | P2-AC2 | runner 控制台日志 |
| T7 | artifact review | 执行与测试证据闭环 | manual | P3-AC1, P3-AC2 | `execution-log.md`, `test-report.md`, 证据文件 |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-browser
- Required tools: playwright, chromium, node, powershell
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 在真实仓库、真实 backend、真实浏览器中运行，不使用文本注入 mock 或 API route mock 替代 ASR 结果；通过真实用户操作触发录音并保存浏览器证据。
- Escalation rule: tester 先仅根据 `prd.md`、`test-plan.md` 和当前仓库状态跑首轮验证并写出初始结论，之后才能查看 `execution-log.md` 或 `task-state.json` 做差异分析。

## Pass / Fail Criteria

- Pass when:
  - fixture manifest 校验通过；
  - runner 的真实环境检查通过；
  - 至少 3 个 fixture 的真实浏览器 case 运行完成；
  - 每个通过的浏览器 case 都有真实截图或等价证据文件；
  - `test-report.md` 明确记录每个 case 的观测文本、结果和局限性。
- Fail when:
  - backend/SAUC 不可用；
  - fake microphone 无法启动；
  - 任何 fixture 缺失真实样本或文本标注；
  - runner 私自降级到 mock；
  - 浏览器 case 没有真实证据文件；
  - 识别结果与 gold transcript 按 spec 约定不匹配。

## Regression Scope

- `fronted/e2e/integration.real-services.spec.js` 现有真实集成轨道不应被破坏。
- `fronted/playwright.config.js` 默认 mock-flow 套件不应因为新增配置而受影响。
- `fronted/src/app/AppShell.js` 现有 UI 流程、手动文本发送与 ASR 文本填充逻辑不应因 probe 暴露而发生行为变化。
- 真实 `/api/app_settings` 在测试结束后应恢复原设置，避免污染用户当前运行态。

## Reporting Notes

测试结果写入 `test-report.md`。tester 需要对每个执行的 case 记录：

- 实际运行命令
- 使用的 fixture id 与音频路径
- 观测到的最终识别文本
- 证据文件路径
- 结论是 `passed` / `failed` / `blocked` / `not_run`
- 如通过，也要注明样本来源局限，不把结果外推成全面准确率
