# Test Plan

- Task ID: `pad-20260413T100127`
- Created: `2026-04-13T10:01:27`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `pad 产品支持上传图片并在新老模式中显示对应产品图片`

## Test Scope

验证 pad 产品图片资产的后端存储与接口、前端双模式图片展示、图片上传行为、图片离线缓存与离线显示，以及现有音频讲解关键链路未回退。

不在本次测试范围内：

- 图片删除、排序、裁剪、压缩策略
- 旧 RagInt `/ragint` 页面中的新图片管理能力
- 真实外网图片服务或第三方图床

## Environment

- Workspace: `D:\ProjectPackage\RagInt`
- Backend tests 在本地临时目录运行，不依赖真实线上服务。
- E2E 使用现有 dual frontend 本地服务与 Playwright route mock。
- E2E Validation surface: real-browser
- Required tools: `pytest`, `playwright`
- 若复用现有本地 4981 服务，Playwright 需避免再次抢占同端口；若不复用，则由默认配置自行拉起 webServer。

## Accounts and Fixtures

- 后端单测使用 `backend/tests` 中的临时 SQLite 与本地临时文件目录。
- E2E 使用 `fronted/e2e/pad-frontend.spec.js` 中的 route mock fixtures。
- E2E 需提供至少一张可识别的 mock 产品图片与上传后的替换图片。

若以上 fixture 缺失，测试必须直接失败并记录，不允许伪造通过。

## Commands

- `python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py -q`
  期望信号：全部通过，且覆盖产品图片资产存储、上传、读取、作用域校验和清理行为。
- `npx playwright test e2e/pad-frontend.spec.js --config <reuse-or-default-config>`
  期望信号：全部通过，且生成真实浏览器证据文件。

## Test Cases

### T1: 后端图片资产存储与清理

- Covers: P1-AC1
- Level: unit
- Command: `python -m pytest backend/tests/test_pad_product_store.py -q`
- Expected: 产品图片资产可持久化、可按产品查询、产品移除时图片文件和记录会被清理。

### T2: pad API 返回图片并校验 hall 作用域

- Covers: P1-AC2, P1-AC3
- Level: integration
- Command: `python -m pytest backend/tests/test_pad_api_blueprint_unit.py -q`
- Expected: 产品列表和离线 manifest 返回图片字段；图片上传成功；在线图片和离线图片访问均受 hall 绑定约束。

### T3: 演示模式显示产品图片

- Covers: P2-AC1, P3-AC2
- Level: e2e
- Command: `npx playwright test e2e/pad-frontend.spec.js --config <reuse-or-default-config>`
- Expected: 演示模式产品卡能显示产品图片；无图产品不会显示伪造图片态；点击讲解的音频行为仍正常。

### T4: 运维模式上传图片并即时显示

- Covers: P2-AC2, P3-AC2
- Level: e2e
- Command: `npx playwright test e2e/pad-frontend.spec.js --config <reuse-or-default-config>`
- Expected: 运维模式可上传图片，上传完成后详情画廊立即刷新，切回演示模式后同产品显示新图片。

### T5: 离线模式显示已缓存图片

- Covers: P2-AC3, P3-AC2, P3-AC3
- Level: e2e
- Command: `npx playwright test e2e/pad-frontend.spec.js --config <reuse-or-default-config>`
- Expected: 完成离线同步后，浏览器进入离线状态仍能打开 pad 首页并看到已缓存产品图片，同时测试产出可引用的浏览器证据文件。

### T6: 回归现有 pad 音频链路

- Covers: P3-AC1, P3-AC2
- Level: mixed
- Command: `python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py -q` and `npx playwright test e2e/pad-frontend.spec.js --config <reuse-or-default-config>`
- Expected: 图片能力接入后，现有音频上传、TTS 重生成、演示模式播放切换、离线音频播放回归通过。

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | backend store | 产品图片资产持久化与清理 | unit | P1-AC1 | `test-report.md#T1`, pytest output |
| T2 | backend api | 图片上传、产品返回、hall 作用域 | integration | P1-AC2, P1-AC3 | `test-report.md#T2`, pytest output |
| T3 | demo mode | 演示模式显示图片且音频不回退 | e2e | P2-AC1, P3-AC2 | `test-report.md#T3`, `fronted/test-results/...png` |
| T4 | ops mode | 运维模式上传图片并即时显示 | e2e | P2-AC2, P3-AC2 | `test-report.md#T4`, `fronted/test-results/...png` |
| T5 | offline | 离线状态继续显示已缓存图片 | e2e | P2-AC3, P3-AC2, P3-AC3 | `test-report.md#T5`, `fronted/test-results/...png` |
| T6 | regression | 图片接入后音频主链路回归 | mixed | P3-AC1, P3-AC2 | `test-report.md#T6`, pytest and Playwright output |

## Evaluator Independence

- Mode: full-context
- Validation surface: real-browser
- Required tools: pytest, playwright
- First-pass readable artifacts: prd.md, test-plan.md, execution-log.md, task-state.json
- Withheld artifacts:
- Real environment expectation: 使用当前仓库、当前本地前端服务和真实浏览器会话执行；UI 路径必须使用 Playwright 真浏览器并保存具体证据文件。
- Escalation rule: 如本地前端服务、测试命令或浏览器证据文件缺失，则立即停止并将测试标记为 blocked。

## Pass / Fail Criteria

- Pass when:
  后端图片资产测试通过；真实浏览器验证通过；演示模式、运维模式、离线模式都能看到正确图片；现有音频主链路未回退；每个通过的浏览器用例都有可解析的证据文件。
- Fail when:
  图片上传后无法显示；离线同步后图片缺失；hall 作用域被绕过；需要依赖伪造占位图或静默降级；任何必跑命令失败或缺少证据。

## Regression Scope

- pad 产品列表排序与讲解次数排序逻辑
- 演示模式点击播放与单一音浪状态
- 运维模式音频上传、TTS 重生成、当前缓存文字显示
- 图片接入后的离线快照与音频缓存协同

## Reporting Notes

结果写入 `test-report.md`。

测试阶段不修产品代码、不修改 `task-state.json`；本次采用 full-context 本地验收，重点保留真实浏览器证据与命令结果。
