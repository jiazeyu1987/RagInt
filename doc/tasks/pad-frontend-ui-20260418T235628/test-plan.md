# Test Plan

- Task ID: `pad-frontend-ui-20260418T235628`
- Created: `2026-04-18T23:56:28`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `重构 pad-frontend 前端代码，要求不改变与后端的通信接口，不改变操作逻辑，不改变 UI，对代码进行从上而下的模块划分，模块之间耦合度低`

## Test Scope

验证 `pad-frontend` 在模块化重构后仍保持：

- 页面可加载，脚本初始化成功。
- 后端接口调用路径、参数与失败语义不变。
- Demo 模式与 Ops 模式核心交互可用。
- 产品播放、展台讲解播放、场景编辑与离线同步主链路不回归。
- UI 与主要 DOM 结构不发生预期外变化。

不在本次测试范围内：

- 非 `pad-frontend` 目录下的 React 前端 `fronted`
- 与本次重构无关的历史业务缺陷修复
- 后端新功能或新接口验证

## Environment

- 操作系统：Windows
- 工作目录：`D:\ProjectPackage\RagInt`
- 运行方式：使用仓库现有静态/全栈启动方式启动 `pad-frontend`
- 浏览器验证：真实浏览器，优先使用 Playwright 采集证据
- 需要真实后端服务可访问，以验证接口契约与运行时交互
- 若浏览器或后端环境不可用，测试必须 fail fast 并记录阻塞项

## Accounts and Fixtures

- 不依赖额外账号登录
- 需要现有 `clientId` 与展厅数据可返回真实页面数据
- 需要至少一个可播放产品或展台数据，用于验证音频相关链路
- 若当前环境缺少数据，测试记录为 blocked，不允许用 mock 替代

## Commands

- `python -c "from pathlib import Path; import re; s=Path(r'D:\\ProjectPackage\\RagInt\\pad-frontend\\app.js').read_text(encoding='utf-8'); print('ok' if '/api/pad/bootstrap' in s and '/api/pad/halls/current/products' in s and '/api/pad/display/current' in s else 'missing')"`
  - Expected success signal: 输出 `ok`
- `python -c "from pathlib import Path; import re; root=Path(r'D:\\ProjectPackage\\RagInt\\pad-frontend'); texts=[]; [texts.append(p.read_text(encoding='utf-8')) for p in sorted(root.rglob('*.js'))]; joined='\\n'.join(texts); print('ok' if 'window.__RAGINT_PAD_E2E__' in joined else 'missing')"`
  - Expected success signal: 输出 `ok`
- `python -c "from pathlib import Path; root=Path(r'D:\\ProjectPackage\\RagInt\\pad-frontend'); texts=[]; [texts.append(p.read_text(encoding='utf-8')) for p in sorted(root.rglob('*.js'))]; joined='\\n'.join(texts); print('ok' if 'function renderDemoShellV4' not in joined and 'function renderOpsShellV4' not in joined else 'needs-review')"`
  - Expected success signal: 输出 `ok` 或人工确认重复定义已移除
- Playwright/真实浏览器打开 pad 页面并完成手工或脚本化回归
  - Expected success signal: 页面无脚本错误，可完成关键交互并产出截图/控制台证据

## Test Cases

### T1: 页面启动与入口装载

- Covers: P1-AC1, P1-AC2, P1-AC3
- Level: e2e
- Command: 真实浏览器打开 `pad-frontend` 页面，检查初始加载、控制台和 `window.__RAGINT_PAD_E2E__`
- Expected: 页面可加载，无初始化脚本错误，保留全局音频元素和调试入口

### T2: 接口契约保持不变

- Covers: P2-AC1, P2-AC2
- Level: static-review
- Command: 代码检索与对比 `pad-frontend` 中的 API 路径、请求方法、关键参数拼接逻辑
- Expected: 所有现有接口路径与调用语义保持一致，无新增兼容接口或 fallback 分支

### T3: 离线同步主链路回归

- Covers: P2-AC3, P4-AC3
- Level: e2e
- Command: 在真实浏览器中触发加载、同步与离线资源准备流程，检查 Service Worker 注册、IndexedDB 快照与缓存路径
- Expected: Service Worker 正常注册，离线同步流程可执行，错误时保持原失败语义

### T4: 产品播放与展台讲解播放回归

- Covers: P3-AC1
- Level: e2e
- Command: 在 Demo/Ops 页面分别触发产品播放、展台播放、暂停/恢复或时间轴相关操作
- Expected: 音频状态、播放状态和高亮联动与重构前一致

### T5: 场景热点编辑回归

- Covers: P3-AC2, P3-AC3
- Level: e2e
- Command: 在 Ops 场景编辑区验证热点选择、拖拽、搜索、保存、删除或创建流程
- Expected: 事件绑定层仅转发动作，用户操作路径和保存结果保持一致

### T6: UI 与渲染结构无回归

- Covers: P4-AC1, P4-AC2, P4-AC4
- Level: e2e
- Command: 对比重构后的 Demo/Ops 界面截图、关键按钮区域、音频 dock、场景区与操作面板
- Expected: 无明显视觉回归，渲染逻辑已模块化，重复函数覆盖问题消失

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | bootstrap | 页面启动与入口装载 | e2e | P1-AC1, P1-AC2, P1-AC3 | `test-report.md`, 浏览器截图 |
| T2 | api-contract | 接口路径与调用语义保持不变 | static-review | P2-AC1, P2-AC2 | `test-report.md`, 代码检索输出 |
| T3 | offline | Service Worker 与离线同步 | e2e | P2-AC3, P4-AC3 | `test-report.md`, 浏览器截图/控制台证据 |
| T4 | audio | 产品播放与展台讲解播放 | e2e | P3-AC1 | `test-report.md`, 浏览器截图 |
| T5 | scene-editor | 热点编辑与事件转发 | e2e | P3-AC2, P3-AC3 | `test-report.md`, 浏览器截图 |
| T6 | render | UI 无回归与重复定义清理 | e2e | P4-AC1, P4-AC2, P4-AC4 | `test-report.md`, 浏览器截图、代码检索输出 |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-browser
- Required tools: playwright, browser-devtools, python
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 使用真实仓库和真实运行环境验证 `pad-frontend`。UI 与交互路径必须在真实浏览器中验证，并记录截图或等效非任务工件证据。
- Escalation rule: 在形成首轮测试结论前，不查看 `execution-log.md` 与 `task-state.json`。

## Pass / Fail Criteria

- Pass when:
  - 所有测试案例执行完成或有合理的非阻塞说明
  - 页面加载、接口契约、音频链路、场景编辑、离线同步和 UI 回归均通过
  - 所有 acceptance id 都有独立测试证据
- Fail when:
  - 任一核心页面无法加载
  - 任一接口路径、参数或失败语义发生变化
  - Demo/Ops 核心交互或 UI 发生回归
  - Service Worker 或离线同步主链路损坏
  - 需要依赖 mock、fallback 或隐藏错误才能通过验证

## Regression Scope

- `pad-frontend/index.html` 的脚本装载
- `pad-frontend/sw.js` 的缓存壳资源
- `window.__RAGINT_PAD_E2E__` 调试对象
- 产品列表、详情、图片、音频 dock
- 展台时间轴、narration 节点、热点高亮
- 场景编辑与热点导入导出
- 离线同步与 hall 切换

## Reporting Notes

结果写入 `test-report.md`。

测试者必须保持独立，不修改产品代码。对于 `real-browser` 用例，每个通过的浏览器测试至少引用一个真实存在的截图、视频、trace、HAR 或等价证据文件。
