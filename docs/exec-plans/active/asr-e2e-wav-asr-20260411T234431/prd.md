# PRD

- Task ID: `asr-e2e-wav-asr-20260411T234431`
- Created: `2026-04-11T23:44:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `ASR 准确性 E2E 测试：使用测试 wav 数据进行真实浏览器 / 真实 ASR 评测`

## Goal

在现有 RagInt 前端上新增一条可复用的真实 ASR 准确性 E2E 回归链路：用浏览器 fake microphone 将仓库中的测试 `wav` 样本送入真实 SAUC ASR，采集前端收到的最终识别文本，并与仓库内维护的 gold transcript 对比，形成可执行、可复查、可记录证据的准确性回归入口。

## Scope

- `fronted` 下与真实浏览器 E2E 相关的配置、spec、runner 和 fixture manifest。
- 前端只读 E2E 观测面，暴露 ASR 最终文本与页面可见输入文本等只读状态，供 Playwright 断言使用。
- 选取仓库内现有 `wav` 文件建立一组明确标注的 gold set，并记录每个样本的预期文本与播放时长。
- 使用真实前端、真实后端、真实 SAUC 配置运行测试，不新增后端接口，不修改 `/api/ask` 或 ASR websocket 契约。
- 将执行证据写入当前任务目录的 `execution-log.md` 与 `test-report.md`。

## Non-Goals

- 不引入基于 `emitAsrFinal(...)` 的文本注入 mock 作为准确性测试路径。
- 不测试真实物理麦克风、操作系统麦克风权限弹窗、真人口语采集质量或外部网络抖动下的鲁棒性。
- 不把这组样本包装成“覆盖所有真人中文语音场景”的全面准确率结论；本次只声明对选定 `wav` gold set 的回归验证能力。
- 不修改后端 ASR 服务实现、RAGFlow `/api/ask` 业务逻辑或会话解析逻辑。
- 不为缺失前置条件添加 fallback、mock backend 或伪造识别结果。

## Preconditions

- 本地后端服务可访问，且 `http://127.0.0.1:8000/health` 与 `http://127.0.0.1:8000/api/asr/sauc/health` 返回成功。
- `backend/data/app_settings.db` 中存在可用的 SAUC 配置，或可通过真实 `/api/app_settings` 写入并在测试结束后恢复。
- 本地 `fronted` 依赖与 Playwright Chromium 已安装，可启动 `npm start`。
- Chromium 在当前机器上支持 `--use-fake-device-for-media-stream` 与 `--use-file-for-fake-audio-capture=<wav>`。
- 选定的仓库内 `wav` 样本真实存在，且每个样本都有明确的 gold transcript 与播放时长定义。
- 如果上述任一项缺失，必须停止执行并记录到 `task-state.json.blocking_prereqs`，不得降级成文本注入或接口 mock。

## Impacted Areas

- 前端 E2E 入口：`fronted/playwright.asr-accuracy.config.js`、`fronted/e2e/asr-accuracy.real.spec.js`、`fronted/scripts/run_asr_accuracy_e2e.js`、`fronted/package.json`。
- 前端 ASR UI/状态汇聚：`fronted/src/app/AppShell.js`，必要时包含其相关测试。
- 样本与标注：`fronted/e2e/fixtures/asr-accuracy/*`，以及被引用的 `backend/data/qa_audio_cache/audio/*.wav`。
- 现有真实集成参考：`fronted/e2e/integration.real-services.spec.js`、`fronted/e2e/README.md`。
- 任务工件：`docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/*`。

## Phase Plan

### P1: 固化样本与只读观测面

- Objective: 选定可执行的 `wav` gold set，并补充前端只读 E2E 观测面，确保 Playwright 能在不注入文本的前提下读取真实识别结果。
- Owned paths: `fronted/e2e/fixtures/asr-accuracy/*`, `fronted/src/app/AppShell.js`, `fronted/src/app/AppShell.test.js`, `docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/*`
- Dependencies: `backend/data/qa_audio_cache.db`, `backend/data/qa_audio_cache/audio/*.wav`, `fronted/src/app/AppShell.js`
- Deliverables: fixture manifest、样本文本标注、只读 ASR probe getter、对应回归测试或验证说明

### P2: 实现真实 wav -> fake mic -> SAUC 的 Playwright 链路

- Objective: 新增专用 Playwright 配置、真实 E2E spec 与 runner，支持按 fixture 逐个启动 Chromium 并用 fake microphone 回放目标 `wav`。
- Owned paths: `fronted/playwright.asr-accuracy.config.js`, `fronted/e2e/asr-accuracy.real.spec.js`, `fronted/scripts/run_asr_accuracy_e2e.js`, `fronted/package.json`
- Dependencies: P1 deliverables, `fronted/playwright.config.js`, `fronted/e2e/README.md`, 本地 Chromium, 本地前后端运行环境
- Deliverables: 可执行 runner、真实浏览器 spec、fake mic 启动参数、每个 case 的结果产物与截图证据

### P3: 执行验证并回填证据

- Objective: 在真实本地运行态下执行选定 fixture，记录通过/失败结果、阻塞项和证据文件，完成当前任务工件闭环。
- Owned paths: `docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/execution-log.md`, `docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/test-report.md`
- Dependencies: P1 deliverables, P2 deliverables, 本地 backend 运行态, Playwright 产出的截图/trace/result json
- Deliverables: reviewed execution log、independent test report、按 acceptance id 归档的证据引用

## Phase Acceptance Criteria

### P1

- P1-AC1: 新增的 ASR fixture manifest 至少定义 3 个可执行样本；每个样本都引用仓库内真实 `wav` 路径，并声明 `id`、`audio path`、`expected transcript`、`hold/play duration`、`timeout`。
- P1-AC2: 前端暴露只读 E2E probe，用于读取“前端收到的最终 ASR 文本”“当前输入框文本”“关键时间戳/状态”；不得新增任何能写入识别文本或直接切换识别状态的注入接口。
- Evidence expectation: 通过 manifest 文件内容、样本文件存在校验、以及真实页面上 `window.__RAGINT_E2E__.getAsrProbeState()` 可读来证明 P1 完成。

### P2

- P2-AC1: 新增的 Playwright 专用配置会以 Chromium 启动真实页面，并带有 fake microphone 所需参数与麦克风权限。
- P2-AC2: runner 会在执行单个 fixture 前验证真实 backend/SAUC 健康状态、fixture 文件存在性和必要环境变量；任一缺失时直接失败并给出明确原因。
- P2-AC3: 真实 E2E spec 至少完成以下链路断言：打开页面、用户级操作触发录音、`wav` 经 fake mic 送入 ASR、前端 probe 观测到最终识别文本、识别文本与 gold transcript 按约定规则比较、产出至少一个截图或等价浏览器证据文件。
- Evidence expectation: 通过 runner 日志、Playwright 结果文件、截图证据和 spec 断言结果证明 P2 完成。

### P3

- P3-AC1: `execution-log.md` 记录本次实现覆盖的真实路径、执行命令、已覆盖 acceptance ids、仍存风险和阻塞项。
- P3-AC2: `test-report.md` 以独立 tester 视角记录至少 3 个 fixture case 的真实浏览器结果，并为每个通过的浏览器 case 引用至少一个存在的截图、trace、video 或结果文件。
- Evidence expectation: 通过 `execution-log.md`、`test-report.md` 与非任务工件证据文件之间的交叉引用证明 P3 完成。

## Done Definition

- P1、P2、P3 全部完成，且所有 acceptance ids 在 `execution-log.md` 或 `test-report.md` 中均有对应证据。
- 仓库中存在一条可重跑的 ASR accuracy E2E 命令入口，能按 fixture 逐个执行真实 `wav` 回放。
- 测试不依赖文本注入 mock，不依赖新增后端接口，不通过 API route mock 伪造 ASR 识别成功。
- `test-report.md` 给出独立测试结论，并引用真实截图/trace/result 文件。
- 如果样本或运行环境存在局限，文档与测试报告中明确说明，不以“通过”掩盖。

## Blocking Conditions

- 后端 `/health` 或 `/api/asr/sauc/health` 不可用，或 SAUC 未注册成功。
- Playwright Chromium 无法使用 fake microphone 启动参数，或当前机器策略阻止麦克风 fake device。
- 选定 `wav` 文件缺失、损坏，或缺少可追溯的 gold transcript。
- 真实 `/api/app_settings` 无法读取/恢复 SAUC 相关设置，导致测试会破坏用户当前运行态且无法回滚。
- 任何实现尝试需要退回到文本注入、route mock 或假识别结果才能继续时，必须停止而不是继续“假通过”。
