# Test Plan

- Task ID: `pad-20260412T234136`
- Created: `2026-04-12T23:41:36`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `pad 前端增加演示模式和运维模式：演示模式只展示 table 形态的产品 item，点击即播、当前播放项显示音浪、切换项时中断并播放新项；运维模式保留当前完整配置能力，两个模式可互相切换；按给定视觉风格实现`

## Test Scope

验证新的 `pad` 首页双模式体验是否成立：

- 默认进入演示模式
- 演示模式 item 列表渲染正确
- 点击 item 播放、当前播放音浪状态、切换 item 中断重播正确
- 无音频 item 的状态正确
- 运维模式可进入且保留现有关键管理能力
- `/ragint` 跳转和共享 `clientId` 不被双模式改动破坏

不在本次测试范围内：

- 真实扬声器输出质量
- 真实后端 TTS 服务稳定性
- 新增图片或图片上传能力

## Environment

- 工作目录：`D:\ProjectPackage\RagInt\fronted`
- 使用 `playwright.config.js` 启动 `npm run serve:dual:e2e`
- 浏览器基线：Playwright Chromium
- `pad` 相关 API 在测试中通过 route mock 提供确定性响应
- `HTMLMediaElement.play/pause` 在浏览器中做可控 stub，只验证前端交互状态与播放链路触发，不验证真实音频解码

## Accounts and Fixtures

- 固定 `clientId` 测试夹具：`pad-hall-a`、`pad-hall-b`
- `pad-hall-a` 夹具至少包含：
  - 1 个有当前生效音频的产品
  - 1 个通过重生成后切换到 TTS 的产品
  - 1 个无当前生效音频的产品
- `pad-hall-b` 用于验证切换 clientId 后仍只显示本厅产品

如果 route mock、双前端服务或浏览器依赖不可用，测试应直接失败并记录阻断原因。

## Commands

- `cd D:\ProjectPackage\RagInt\fronted`
  - 成功信号：命令进入前端目录，无错误输出
- `npm run test:e2e -- pad-frontend.spec.js`
  - 成功信号：`pad-frontend.spec.js` 所有测试通过，Playwright 退出码为 0

## Test Cases

### T1: 默认进入演示模式并显示当前展厅产品 item

- Covers: P1-AC1, P1-AC2
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 首页默认处于演示模式，只显示当前展厅产品 item 列表，且能看到模式切换入口。

### T2: 演示模式点击 item 播放并显示音浪状态

- Covers: P1-AC3
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 点击有音频的 item 后，请求当前产品音频并进入播放中状态，当前 item 显示音浪或等价的显式播放标识。

### T3: 演示模式切换到另一个 item 时中断旧讲解并启动新讲解

- Covers: P1-AC4, P1-AC7
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 点击第二个可播放 item 后，第一个 item 的播放标识消失，第二个 item 成为唯一播放项；随后切到运维模式时仍保持第二个产品为当前选中项。

### T4: 无音频 item 不留下错误的播放中状态

- Covers: P1-AC5
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 点击无音频 item 后，不出现错误的音浪状态，页面明确显示该产品暂无当前生效音频。

### T5: 运维模式保留当前完整配置能力

- Covers: P1-AC6, P2-AC2
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 从演示模式切到运维模式后，可见当前缓存文字、文字编辑框、TTS 重生成按钮、录音上传按钮、快速切换展厅与离线同步等现有能力入口。

### T6: 运维模式的关键链路和跳转回归

- Covers: P2-AC2
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 在运维模式中可完成 TTS 重生成并刷新当前缓存文字，同时 `/ragint/?entry=tour` 跳转仍可用且共享 `clientId` 不变。

### T7: 浏览器证据输出

- Covers: P2-AC1, P2-AC3
- Level: e2e
- Command: `npm run test:e2e -- pad-frontend.spec.js`
- Expected: 关键用例至少生成截图证据文件，测试报告可引用这些文件。

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | demo mode | 默认模式与列表渲染 | e2e | P1-AC1, P1-AC2 | Playwright 截图与断言 |
| T2 | demo mode | 点击 item 播放并显示音浪 | e2e | P1-AC3 | Playwright 截图与断言 |
| T3 | demo mode + ops mode | 切 item 中断重播并保持选中 | e2e | P1-AC4, P1-AC7 | Playwright 截图与断言 |
| T4 | demo mode | 无音频 item 状态正确 | e2e | P1-AC5 | Playwright 截图与断言 |
| T5 | ops mode | 运维功能入口仍存在 | e2e | P1-AC6, P2-AC2 | Playwright 截图与断言 |
| T6 | ops mode + ragint nav | 重生成和 `/ragint` 跳转回归 | e2e | P2-AC2 | Playwright 截图与断言 |
| T7 | evidence | 证据文件输出 | e2e | P2-AC1, P2-AC3 | 真实截图文件 |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-browser
- Required tools: playwright
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 使用真实浏览器访问本地启动的双前端服务，执行真实点击和页面断言；对 API 使用测试 route mock，但不跳过真实 DOM、真实事件与真实浏览器渲染。
- Escalation rule: 在 tester 形成初始 verdict 之前，不检查 `execution-log.md` 与 `task-state.json`。

## Pass / Fail Criteria

- Pass when:
  - `pad-frontend.spec.js` 所有相关用例通过
  - 默认演示模式、播放中音浪、切换 item 中断重播、运维模式保留能力都被验证
  - 至少有一组真实浏览器截图证据可供引用
- Fail when:
  - 默认模式不正确
  - 播放状态不能唯一对应当前 item
  - 切换 item 时旧播放状态残留
  - 运维模式丢失现有关键能力
  - `/ragint` 跳转或共享 `clientId` 被破坏

## Regression Scope

- 现有 pad 首页 hall 绑定与只显示本厅产品逻辑
- 离线资源同步与离线快照读取
- 当前缓存音频文字展示与重生成后的刷新
- `/ragint` 跳转与 `clientId` 共享

## Reporting Notes

结果写入 `D:\ProjectPackage\RagInt\doc\tasks\pad-20260412T234136\test-report.md`。

测试报告需按测试用例编号记录命令、结果、证据文件和最终 verdict。
