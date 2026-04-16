# PRD

- Task ID: `pad-20260412T234136`
- Created: `2026-04-12T23:41:36`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `pad 前端增加演示模式和运维模式：演示模式只展示 table 形态的产品 item，点击即播、当前播放项显示音浪、切换项时中断并播放新项；运维模式保留当前完整配置能力，两个模式可互相切换；按给定视觉风格实现`

## Goal

让新的 pad 产品讲解首页同时支持两种明确模式：

- `演示模式` 作为面向展厅现场的默认视图，只展示当前展厅产品 item 列表，用户点击产品即可播放该产品当前生效音频，播放中的 item 需要有明显的音浪状态，并且切换到另一个 item 时必须停止上一条讲解并启动新的讲解。
- `运维模式` 作为当前完整管理视图，继续提供展厅切换、在线刷新、离线同步、当前缓存文字查看、TTS 重生成、录音上传等能力。

## Scope

- `D:\ProjectPackage\RagInt\pad-frontend\app.js`
- `D:\ProjectPackage\RagInt\pad-frontend\app.css`
- `D:\ProjectPackage\RagInt\pad-frontend\index.html`（如需极小结构补充）
- `D:\ProjectPackage\RagInt\fronted\e2e\pad-frontend.spec.js`
- 本任务目录下的执行与测试工件

## Non-Goals

- 不新增后端接口，不修改 `/api/pad/*` 合同
- 不新增产品图片字段、图片上传能力或图片资源管理链路
- 不修改 RagInt 旧前端 `/ragint` 的业务逻辑，除现有跳转兼容外不扩散改动
- 不改产品音频资产模型，不改当前 active audio 的解析语义

## Preconditions

- `pad` 首页现有 `/api/pad/bootstrap`、`/api/pad/halls/current/products`、`/api/pad/products/<product_id>/audio/current`、`/api/pad/offline/manifest` 等接口仍可按现有契约返回
- `pad-frontend` 构建入口与 `fronted/scripts/serve_dual_frontends.js` 可正常提供 `/` 与 `/ragint`
- 本地具备 `node`、`npm`、`playwright` 运行条件，可执行 `npm run test:e2e`
- 现有产品数据继续只包含名称、英文名、注册证、公司、当前音频等字段，不依赖新增图片字段

如果任一前置条件失效，本任务应直接阻断，不引入 mock 之外的产品级 fallback 逻辑。

## Impacted Areas

- `pad` 首页默认展示逻辑与视觉结构
- 产品 item 点击播放与音频状态同步
- 共享 `clientId`、当前展厅绑定与离线资源状态展示
- 现有运维能力入口与可见性
- `pad` 首页 Playwright 回归套件

## Phase Plan

### P1: Pad 双模式交互与视觉实现

- Objective: 在现有 pad 首页中增加共享模式状态，默认进入演示模式，并在不新增后端接口的前提下完成演示模式列表、播放状态、音频切换中断和运维模式保留。
- Owned paths:
  - `D:\ProjectPackage\RagInt\pad-frontend\app.js`
  - `D:\ProjectPackage\RagInt\pad-frontend\app.css`
  - `D:\ProjectPackage\RagInt\pad-frontend\index.html`
- Dependencies:
  - 现有产品列表数据结构
  - 现有 HTMLAudioElement 播放链路
  - 现有 `clientId` / 离线同步 / 音频重生成能力
- Deliverables:
  - 可双向切换的模式入口
  - 默认演示模式列表视图
  - 播放中 item 音浪状态
  - 切换 item 时中断上一条并启动新音频
  - 保留完整运维模式

### P2: 浏览器回归与证据固化

- Objective: 为双模式行为补充 Playwright 回归，覆盖演示模式主链路与运维模式关键保留能力，并产出真实浏览器证据。
- Owned paths:
  - `D:\ProjectPackage\RagInt\fronted\e2e\pad-frontend.spec.js`
  - `D:\ProjectPackage\RagInt\doc\tasks\pad-20260412T234136\execution-log.md`
  - `D:\ProjectPackage\RagInt\doc\tasks\pad-20260412T234136\test-report.md`
- Dependencies:
  - P1 完成后的 pad 前端行为
  - Playwright 双前端本地服务
- Deliverables:
  - 覆盖双模式的 e2e 用例
  - 真实浏览器运行结果
  - 可引用的截图证据

## Phase Acceptance Criteria

### P1

- P1-AC1: pad 首页默认进入 `演示模式`，且页面存在可见、可点击的模式切换入口，能从演示模式切到运维模式，再从运维模式切回演示模式。
- P1-AC2: 演示模式只展示当前展厅的产品 item 列表，不展示当前运维模式中的大块详情配置面板；每个 item 至少展示产品中文名、英文名，以及现有可直接取用的元信息标签。
- P1-AC3: 点击带有当前生效音频的 item 时，会立即走现有音频播放链路；当前播放中的 item 需要显示明显的“正在讲解”视觉状态与音浪标识。
- P1-AC4: 当某个 item 正在播放时，点击另一个可播放 item，前一个 item 的播放状态和音浪标识会立即退出，新 item 成为唯一的当前播放项并开始播放。
- P1-AC5: 点击没有当前生效音频的 item 时，不会留下错误的播放中状态；页面会继续准确显示该 item 暂无音频。
- P1-AC6: 运维模式保留当前完整能力，包括在线刷新、离线同步、快速切换展厅、产品详情、当前缓存文字查看、TTS 重生成、录音上传；这些能力继续使用同一份产品与 clientId 上下文。
- P1-AC7: 模式切换不会丢失当前展厅上下文；从演示模式进入运维模式后，当前已选中的产品仍保持一致，反向切回时也保持同一产品高亮。
- Evidence expectation: `execution-log.md` 需要记录模式默认值、改动路径、点击播放与切换中断的实现说明，并给出至少一条浏览器验证或测试证据引用。

### P2

- P2-AC1: Playwright 用例覆盖默认演示模式展示、双向模式切换、点击 item 播放、播放中音浪状态、切换 item 时旧状态退出新状态生效。
- P2-AC2: Playwright 用例覆盖运维模式关键保留能力，至少包括当前缓存文字可见、TTS 重生成链路仍可用，以及 `/ragint` 跳转仍可用。
- P2-AC3: 测试执行产出真实浏览器证据文件，并在 `test-report.md` 中按测试用例引用。
- Evidence expectation: `test-report.md` 需要列出已跑命令、每个测试用例的结果、对应 acceptance ids 和真实证据文件路径。

## Done Definition

- P1 与 P2 全部标记为 `completed`
- 所有 acceptance ids 均有实现证据与测试证据
- pad 首页默认使用演示模式，运维模式可正常切换进入
- 演示模式的 item 播放/切换行为符合用户要求
- 运维模式现有能力没有被双模式改造破坏
- `npm run test:e2e -- pad-frontend.spec.js` 成功通过

## Blocking Conditions

- `/api/pad/*` 任一关键接口契约失效，导致无法拉取当前展厅产品或当前音频
- 本地 Playwright 或双前端服务无法启动，导致无法做真实浏览器验证
- 当前 pad 前端如果不存在稳定的音频播放入口，无法在不引入新 fallback 的前提下实现点击 item 讲解
