# PRD

- Task ID: `pad-20260413T100127`
- Created: `2026-04-13T10:01:27`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `pad 产品支持上传图片并在新老模式中显示对应产品图片`

## Goal

让 pad 产品讲解系统中的每个产品都支持上传图片，并在演示模式与运维模式中显示对应产品图片，同时保持现有音频讲解链路可用，并把图片纳入现有离线同步能力。

## Scope

- `backend` 中 pad 产品数据域的图片资产存储、文件落盘、接口返回与离线访问。
- `pad-frontend` 中产品图片展示、图片上传入口、图片离线缓存与双模式渲染。
- `fronted/e2e` 与 `backend/tests` 中覆盖图片能力的回归测试。
- `doc/tasks/pad-20260413T100127` 下的任务工件更新。

## Non-Goals

- 不实现完整图片管理后台，不做删除、排序、裁剪、批量导入旧图片。
- 不改现有产品音频资产语义，不把图片塞进音频表。
- 不改旧 `/api/ask`、RagInt 问答、TTS 生成主链路。
- 不引入兜底图、占位图自动降级或隐藏失败行为。

## Preconditions

- 本地仓库 `D:\ProjectPackage\RagInt` 可读写。
- Python 测试环境可运行 `pytest`。
- `fronted/node_modules` 已安装，可运行 `npx playwright test`。
- pad 前端继续通过现有 `/api/pad/*` 命名空间获取产品数据。
- 浏览器端离线缓存继续依赖现有 `indexedDB + Cache Storage + serviceWorker`。

如果以上任一前提不满足，必须停止并记录到 `task-state.json.blocking_prereqs`。

## Impacted Areas

- `backend/services/pad_product_store.py`
- `backend/services/pad_product_image_service.py`
- `backend/api/pad.py`
- `backend/bootstrap.py`
- `backend/app_deps.py`
- `backend/tests/test_pad_product_store.py`
- `backend/tests/test_pad_api_blueprint_unit.py`
- `pad-frontend/app.js`
- `pad-frontend/app.css`
- `fronted/e2e/pad-frontend.spec.js`

## Phase Plan

### P1: Pad 产品图片资产与 API

- Objective:
  为 pad 产品建立独立图片资产域，支持上传、读取、离线读取，并把图片元数据接入产品列表与离线 manifest。
- Owned paths:
  `backend/services/pad_product_store.py`
  `backend/services/pad_product_image_service.py`
  `backend/api/pad.py`
  `backend/bootstrap.py`
  `backend/app_deps.py`
  `backend/tests/test_pad_product_store.py`
  `backend/tests/test_pad_api_blueprint_unit.py`
- Dependencies:
  现有 `pad_hall_bindings`、`hall_products`、离线 manifest、客户端 `X-Client-ID` 绑定逻辑。
- Deliverables:
  独立图片资产表与文件目录、图片上传接口、图片访问接口、离线图片接口、产品接口中的图片字段、后端单测。

### P2: Pad 双模式图片展示与离线缓存

- Objective:
  在演示模式与运维模式中展示产品图片，并把图片接入现有离线资源同步与本地快照。
- Owned paths:
  `pad-frontend/app.js`
  `pad-frontend/app.css`
- Dependencies:
  P1 的产品图片接口与 manifest 字段。
- Deliverables:
  演示模式图片展示、运维模式图片画廊与上传入口、图片缓存逻辑、离线加载能力。

### P3: 回归验证与证据固化

- Objective:
  通过后端测试和真实浏览器 e2e 固化图片能力，同时确认现有演示模式音频行为未回退。
- Owned paths:
  `backend/tests/test_pad_product_store.py`
  `backend/tests/test_pad_api_blueprint_unit.py`
  `fronted/e2e/pad-frontend.spec.js`
  `doc/tasks/pad-20260413T100127/execution-log.md`
  `doc/tasks/pad-20260413T100127/test-report.md`
- Dependencies:
  P1、P2 完成。
- Deliverables:
  通过的 `pytest` 与 Playwright 结果、浏览器证据文件、任务工件中的执行与测试记录。

## Phase Acceptance Criteria

### P1

- P1-AC1: pad 后端存在独立产品图片资产存储，单个产品可保存一张或多张图片，且删除产品时会同步清理该产品图片资产记录与文件目录。
- P1-AC2: `GET /api/pad/halls/current/products` 与 `GET /api/pad/offline/manifest` 会返回每个产品的图片列表与主展示图片信息，且展厅版本更新时间会反映图片变更。
- P1-AC3: `POST /api/pad/products/<product_id>/images/upload` 能成功写入图片资产；在线图片访问与离线图片访问都受当前 `client_id -> hall_id` 绑定约束。
- Evidence expectation:
  `execution-log.md` 记录新增表、接口与校验逻辑；`backend/tests` 给出覆盖上传、查询、作用域校验和清理行为的证据。

### P2

- P2-AC1: 演示模式中，带图片的产品 item 会显示对应产品图片；无图片的产品不会渲染伪装的成功图片状态。
- P2-AC2: 运维模式中，选中产品后可看到当前图片列表，并可通过页面上传图片；上传完成后当前产品图片会立即更新显示。
- P2-AC3: 图片会进入离线 manifest、本地缓存和本地快照；完成同步后断网重新进入 pad 首页时，仍能显示已同步的产品图片。
- Evidence expectation:
  `execution-log.md` 记录前端渲染与离线接入点；Playwright 证据展示 demo/ops/offline 三条链路中的图片表现。

### P3

- P3-AC1: `pytest` 针对 pad 产品存储与 pad API 的图片相关测试全部通过。
- P3-AC2: Playwright 真实浏览器回归覆盖演示模式显示图片、运维模式上传图片、离线模式显示已缓存图片，且保留现有音频讲解切换行为。
- P3-AC3: `test-report.md` 中的每个图片相关通过用例都引用至少一个真实浏览器证据文件。
- Evidence expectation:
  `test-report.md` 记录命令、结果、证据路径与最终判定，且可被验证脚本通过。

## Done Definition

- P1、P2、P3 全部完成。
- 所有 acceptance ids 状态均为 `completed`。
- pad 产品图片可以被上传、在线显示、离线显示。
- 演示模式与运维模式都能看到对应产品图片。
- 现有 pad 音频播放、模式切换与离线音频能力未回退。
- `execution-log.md` 与 `test-report.md` 中对每个 acceptance id 都有可追溯证据。

## Blocking Conditions

- 缺少可写的后端数据目录或图片文件目录。
- `pytest` 或 Playwright 无法运行。
- 图片上传后无法以受控路径安全落盘。
- 离线缓存所需的浏览器能力缺失且无法按当前实现路径验证。
- 任一实现需要通过兜底图、静默降级或绕过 hall 绑定来“看起来成功”时，必须停止。
