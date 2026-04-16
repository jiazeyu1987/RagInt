# Test Plan

- Task ID: `task-4732427cb5-20260412T163924`
- Created: `2026-04-12T16:39:24`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `双前端展厅产品讲解系统正式方案`

## Test Scope

验证新的 pad 产品讲解系统是否按设备绑定展厅、能播放当前生效音频、可在离线情况下继续工作，并确认旧 RagInt 前端迁移到 `/ragint` 后仍可正常使用和切换。真实麦克风、真实 ASR、完整后台管理界面不在本次测试范围内。

## Environment

- 工作目录：`D:\ProjectPackage\RagInt`
- Python 环境可执行 `pytest`
- Node/npm 依赖已安装，可执行 `npm test` 与 `playwright test`
- Playwright 使用 Chromium，基于真实浏览器运行
- 前端默认通过 `npm start` 启动；e2e 通过现有 Playwright webServer 配置拉起
- 导入测试需要访问 `tobedeleted/上海展厅展品列表.xlsx`

## Accounts and Fixtures

- 固定 `client_id` 测试样例至少 2 个，用于映射不同展厅
- 至少一个带当前生效音频的产品样例，用于播放与离线缓存验证
- Excel 样例使用仓库内 `tobedeleted/上海展厅展品列表.xlsx`
- 若任一 fixture 缺失，测试必须失败并在 `test-report.md` 记录阻塞

## Commands

- `python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py`
  预期：全部通过，覆盖 pad 数据域、接口与导入逻辑
- `cd fronted; npm test -- --runInBand --watch=false --runTestsByPath src/app/AppShell.test.js src/components/HomeActions.test.js`
  预期：全部通过，覆盖旧前端 `/ragint` 入口与导航改动
- `cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js`
  预期：全部通过，覆盖 pad 首页、双向跳转、共享 `clientId` 与关键 UI 流
- 如需整体验证部署：
  `docker compose build fronted backend && docker compose up -d`
  预期：`/`、`/ragint` 与 `/api/*` 均可访问

## Test Cases

### T1: pad 数据表与客户端绑定解析

- Covers: P1-AC1, P1-AC3
- Level: unit/integration
- Command: `python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py -k "binding or bootstrap or current_products"`
- Expected: `client_id -> hall_id` 绑定正确；bootstrap 与产品接口只返回当前设备所属展厅数据

### T2: Excel 导入脚本导入 8 个展厅产品

- Covers: P1-AC2
- Level: integration
- Command: `python -m pytest backend/tests/test_pad_import_script.py`
- Expected: 从仓库 Excel 成功导入，字段、排序与 8 个展厅覆盖正确

### T3: 当前生效音频切换与获取

- Covers: P1-AC4
- Level: integration
- Command: `python -m pytest backend/tests/test_pad_api_blueprint_unit.py -k "audio_current or upload or regenerate"`
- Expected: 上传录音和 TTS 重生成都能创建新资产并切换 `is_active`；当前音频接口始终返回当前生效音频

### T4: pad 首页按设备展示本厅产品

- Covers: P2-AC1
- Level: e2e
- Command: `cd fronted; npx playwright test e2e/pad-frontend.spec.js -g "loads current hall products"`
- Expected: 真实打开 `/` 后，仅看到当前 `clientId` 绑定展厅的产品清单

### T5: pad 产品音频播放与跳转旧前端

- Covers: P2-AC2, P3-AC2
- Level: e2e
- Command: `cd fronted; npx playwright test e2e/pad-frontend.spec.js -g "plays product audio and navigates to ragint"`
- Expected: 点击产品触发当前音频播放；点击入口跳转到 `/ragint/?entry=tour`；往返后 `clientId` 不变

### T6: pad 离线缓存

- Covers: P2-AC3
- Level: e2e
- Command: `cd fronted; npx playwright test e2e/pad-frontend.spec.js -g "supports offline hall resources"`
- Expected: 首次同步后切换浏览器离线模式，仍能打开 `/`、看到缓存列表并播放音频；未同步资源时显示明确错误

### T7: 双 SPA 部署与旧前端 `/ragint` 启动

- Covers: P2-AC4, P3-AC1
- Level: e2e/manual
- Command: `cd fronted; npx playwright test e2e/app-shell.spec.js -g "ragint subpath entry"` 或在 compose 环境中手动访问 `/` 与 `/ragint`
- Expected: `/` 命中新 pad 前端，`/ragint` 命中旧前端；旧前端在 `?entry=tour` 下直接进入讲解模式

### T8: 旧前端问答回归

- Covers: P3-AC3
- Level: unit/e2e
- Command: `cd fronted; npm test -- --runInBand --watch=false --runTestsByPath src/app/AppShell.test.js src/components/HomeActions.test.js && npx playwright test e2e/business-flows.spec.js`
- Expected: 路径迁移后旧前端关键入口、导航与原有问答主链路不回归

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | backend pad domain | 设备绑定与本厅数据返回 | unit/integration | P1-AC1, P1-AC3 | `test-report.md` pytest output |
| T2 | import script | Excel 导入 8 个展厅产品 | integration | P1-AC2 | `test-report.md` pytest output |
| T3 | backend audio asset | 当前生效音频获取/上传/TTS 重生成 | integration | P1-AC4 | `test-report.md` pytest output |
| T4 | pad frontend | `/` 首页只展示本厅产品 | e2e | P2-AC1 | Playwright trace/screenshot |
| T5 | dual frontend nav | 产品播放与跳转 `/ragint` | e2e | P2-AC2, P3-AC2 | Playwright trace/screenshot |
| T6 | pad offline | 已同步资源离线可用 | e2e | P2-AC3 | Playwright trace/screenshot |
| T7 | deployment/subpath | `/` 与 `/ragint` 双 SPA 正常启动 | e2e/manual | P2-AC4, P3-AC1 | Playwright trace/screenshot or manual capture |
| T8 | legacy ragint regression | 旧前端讲解与问答主链路回归 | unit/e2e | P3-AC3 | Jest output + Playwright trace |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-browser
- Required tools: pytest, npm test, playwright
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 在真实仓库与真实浏览器中验证；所有 UI 相关通过项都应留下 Playwright 证据文件
- Escalation rule: 初次判定前不查看 `execution-log.md` 或 `task-state.json`

## Pass / Fail Criteria

- Pass when:
  所有计划中的命令成功；每个 acceptance id 至少被一个通过的测试用例覆盖；UI/e2e 用例附带真实浏览器证据
- Fail when:
  任一 acceptance id 没有测试覆盖；任一关键命令失败；离线、设备绑定或路径迁移逻辑出现未解释失败；缺少真实浏览器证据

## Regression Scope

- 旧 RagInt 前端在 `/ragint` 子路径下的静态资源加载与导航
- 共享 `clientId` 后旧前端请求头 `X-Client-ID` 的稳定性
- 现有 `/api/ask`、旧问答链路、原录音业务接口不应被 pad 产品音频数据域污染
- 现有前端设置、历史面板、简单讲解模式不应因路径或导航调整失效

## Reporting Notes

测试结果写入 `test-report.md`，每个用例记录命令、结果、关联系统、证据文件路径与最终 verdict。
