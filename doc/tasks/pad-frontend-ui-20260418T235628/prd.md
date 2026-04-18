# PRD

- Task ID: `pad-frontend-ui-20260418T235628`
- Created: `2026-04-18T23:56:28`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `重构 pad-frontend 前端代码，要求不改变与后端的通信接口，不改变操作逻辑，不改变 UI，对代码进行从上而下的模块划分，模块之间耦合度低`

## Goal

将 `pad-frontend` 从当前单文件、全局状态高度耦合的原生 JavaScript 应用，重构为按顶层职责分层的多模块前端实现，同时保持以下行为完全一致：

- 与后端的 HTTP 接口、资源路径、Service Worker 路径和请求参数不变。
- 页面视觉表现、主要 DOM 结构语义、交互操作逻辑和离线同步行为不变。
- Demo 模式、Ops 模式、产品音频播放、展台讲解播放、场景热点编辑、离线同步与缓存流程不变。

## Scope

- `pad-frontend/index.html`
- `pad-frontend/app.js`
- `pad-frontend/app.css`
- `pad-frontend/sw.js`
- `pad-frontend` 下新建的模块文件与目录
- 与 `pad-frontend` 直接相关的任务文档与验证记录

## Non-Goals

- 不修改任何后端 API、参数、返回结构、路由或静态资源协议。
- 不调整 UI 文案、布局、样式设计、交互顺序或可见功能范围。
- 不引入 React、Vite、Webpack、TypeScript 等新框架或构建系统。
- 不修复与本次模块化无关的历史产品缺陷，除非它阻塞重构落地。
- 不引入 fallback、兼容分支、mock 数据、占位成功响应或静默降级。

## Preconditions

- 本地仓库 `D:\ProjectPackage\RagInt` 可读写。
- `pad-frontend` 静态目录仍由现有运行方式直接提供，无需新构建步骤。
- 可使用 Python 运行任务工作流脚本。
- 可使用浏览器或 Playwright 对 `pad-frontend` 进行真实页面验证。
- 若需完整交互回归，相关后端服务和依赖数据需能启动并返回真实结果。

如果以上任一前置条件缺失，必须停止并记录到 `task-state.json.blocking_prereqs`。

## Impacted Areas

- `pad-frontend/index.html` 的脚本装载顺序
- `pad-frontend/app.js` 当前全部状态、接口、渲染、事件、播放器与离线逻辑
- `pad-frontend/sw.js` 对壳资源列表的依赖
- `pad-frontend/app.css` 作为 UI 不变的基准样式
- 浏览器端 `localStorage`、`indexedDB`、`Cache Storage`、`Service Worker`
- 后端接口调用点，包括但不限于：
  - `/api/pad/bootstrap`
  - `/api/pad/halls/current/products`
  - `/api/pad/display/current`
  - `/api/pad/offline/manifest`
  - `/api/pad/display/current/config`
  - `/api/pad/halls/current/scenes*`
  - `/api/pad/halls/current/stations*`
  - `/api/pad/products*`
  - `/api/recordings*`
- 现有人工调试入口 `window.__RAGINT_PAD_E2E__`

## Phase Plan

### P1: 建立模块化骨架与装载边界

- Objective:
  将当前单文件应用切分为顶层职责明确的模块装载结构，保留现有运行方式，不引入构建工具。
- Owned paths:
  - `pad-frontend/index.html`
  - `pad-frontend/app.js`
  - `pad-frontend/modules/**`
- Dependencies:
  - 现有 `pad-frontend` 静态资源可被直接访问
  - 当前 `app.js` 中的常量、基础工具和共享状态定义
- Deliverables:
  - 明确的模块目录结构
  - 单一 bootstrap 入口
  - 不依赖重复定义顺序的基础装载框架

### P2: 提取基础层与数据层

- Objective:
  将常量、文本资源、共享状态、存储读写、通用工具、API 请求、数据归一化与离线数据访问从 UI 与事件层解耦。
- Owned paths:
  - `pad-frontend/modules/core/**`
  - `pad-frontend/modules/data/**`
  - `pad-frontend/modules/offline/**`
  - `pad-frontend/app.js`
- Dependencies:
  - P1 模块骨架
  - 现有 `fetchJson`、IndexedDB、cache、normalizer、storage 逻辑
- Deliverables:
  - 基础模块之间形成清晰单向依赖
  - 原有接口 URL、参数与失败语义保持不变

### P3: 提取播放、场景编辑与事件编排层

- Objective:
  将音频播放、展台讲解播放、时间轴、场景编辑器和用户事件绑定迁移为独立模块，降低对渲染层的直接耦合。
- Owned paths:
  - `pad-frontend/modules/audio/**`
  - `pad-frontend/modules/scene/**`
  - `pad-frontend/modules/events/**`
  - `pad-frontend/app.js`
- Dependencies:
  - P2 的状态、工具、数据访问模块
  - 现有 `<audio>` 元素与全局交互行为
- Deliverables:
  - 播放控制逻辑单独封装
  - 场景热点编辑逻辑单独封装
  - 事件绑定层只做 DOM 到 action 的转发

### P4: 提取渲染层并完成无回归集成

- Objective:
  将 Demo/Ops 渲染逻辑按页面职责拆分为可维护的 renderer 模块，删除重复定义，完成最终集成与回归验证。
- Owned paths:
  - `pad-frontend/modules/render/**`
  - `pad-frontend/modules/app/**`
  - `pad-frontend/app.js`
  - `pad-frontend/sw.js`
- Dependencies:
  - P1-P3 完成
  - 当前 UI 结构与类名必须保持稳定
- Deliverables:
  - 按职责组织的渲染模块
  - 删除重复函数定义
  - Service Worker 壳资源列表与入口同步完成

## Phase Acceptance Criteria

### P1

- P1-AC1: `pad-frontend` 新增清晰的模块目录和单一 bootstrap 入口，浏览器仍可直接加载页面，无需新增构建步骤。
- P1-AC2: `index.html`、`app.js` 与静态资源装载链保持可运行，页面初始加载不因模块化而报脚本错误。
- P1-AC3: 模块装载后仍保留现有全局音频元素和 `window.__RAGINT_PAD_E2E__` 调试入口。
- Evidence expectation:
  - 变更后的目录结构
  - 浏览器控制台无初始化报错
  - 页面可启动的运行证据

### P2

- P2-AC1: 常量、文本、共享状态、通用工具、存储读写和网络请求从渲染/事件层中提取到独立模块。
- P2-AC2: 所有后端通信接口、URL、查询参数、方法、请求体字段和错误抛出语义保持不变。
- P2-AC3: IndexedDB、Cache Storage、Service Worker 相关离线同步逻辑保持原有行为，不引入 fallback 分支。
- Evidence expectation:
  - 提取后的模块清单
  - 接口字符串与关键请求逻辑对照
  - 离线同步主链路运行证据

### P3

- P3-AC1: 产品播放、展台讲解播放、时间轴与 narration 节点逻辑提取为独立模块，并通过明确接口访问共享状态。
- P3-AC2: 场景编辑、热点编辑、搜索、导入导出等逻辑提取为独立模块，交互顺序与保存逻辑不变。
- P3-AC3: DOM 事件绑定从业务实现中分离，事件层仅负责转发，不重新定义业务规则。
- Evidence expectation:
  - 播放模块、场景编辑模块、事件绑定模块的变更记录
  - 关键交互路径人工或浏览器验证证据

### P4

- P4-AC1: Demo 与 Ops 渲染逻辑拆分为独立 renderer 模块，最终不再依赖同名函数的后定义覆盖。
- P4-AC2: UI 类名、布局结构、按钮行为、热点表现和音频控制区表现保持一致，不产生视觉回归。
- P4-AC3: `sw.js` 与壳资源入口保持一致，离线壳资源可继续注册并工作。
- P4-AC4: 最终代码形成自顶向下的模块依赖关系，顶层入口不直接承载全部业务细节。
- Evidence expectation:
  - 重构后模块关系说明
  - 真实页面回归结果
  - 静态资源与 Service Worker 校验结果

## Done Definition

- P1-P4 全部完成并通过阶段审查。
- 所有 acceptance id 在 `execution-log.md` 或 `test-report.md` 中有明确证据。
- `pad-frontend` 在不新增构建步骤的前提下可正常加载。
- 所有既有后端接口调用保持原路径、原方法、原参数与原失败语义。
- Demo/Ops 关键路径经过真实页面验证，UI 无预期外变更。
- `check_completion.py --apply` 通过。

## Blocking Conditions

- 发现模块化后必须引入新构建系统才能运行。
- 发现现有 UI 或交互需要改变才能完成重构。
- 发现后端接口契约不稳定，无法在不改通信接口的前提下拆分代码。
- 真实页面验证环境不可用，无法确认 UI 与操作逻辑未回归。
- 任何步骤需要通过 fallback、mock、占位响应或静默降级来掩盖问题。
