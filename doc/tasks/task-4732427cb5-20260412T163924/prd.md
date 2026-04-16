# PRD

- Task ID: `task-4732427cb5-20260412T163924`
- Created: `2026-04-12T16:39:24`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `双前端展厅产品讲解系统正式方案`

## Goal

在同一套 RagInt 后端上落地一套面向展厅 pad 的产品讲解系统。系统默认首页为新的 pad 前端，能根据固定 `client_id` 自动识别当前 pad 对应展厅，只展示该展厅产品清单，并播放产品当前生效的讲解音频；旧 RagInt 前端继续保留并迁移到 `/ragint`，两个前端可双向切换并共享同一设备上下文。

## Scope

- 后端新增 pad 产品讲解专用数据域、导入脚本与 `/api/pad/*` 接口。
- 复用现有 TTS 能力与音频文件存储方式，新增产品讲解音频资产服务，不复用旧 `recording_id + stop_index` 语义。
- 新增独立 pad 前端，包含设备启动、自厅产品列表、音频播放、离线同步、跳转旧前端。
- 调整现有 `fronted` 构建与 nginx 部署，使旧前端运行在 `/ragint`。
- 旧 RagInt 前端支持 `?entry=tour` 启动态，并提供返回 pad 前端的入口。
- 自动化测试覆盖后端、前端和关键 e2e 流程。

## Non-Goals

- 不实现完整的产品/展厅/音频管理后台。
- 不做 IP、URL 参数或扫码识别展厅，展厅识别只基于固定 `client_id` 绑定。
- 不做跨展厅离线包缓存或离线兜底到其它展厅数据。
- 不改造旧问答缓存、导览录音、`qa_audio_cache` 的业务语义。
- 不新增新的问答或语音识别后端契约。

## Preconditions

- 当前仓库可读写，且 `backend/data` 可创建 SQLite 文件与音频目录。
- Python 运行环境可执行现有后端测试，并具备读取 Excel 所需依赖；导入脚本需要 `pandas` 和可读取 `.xlsx` 的引擎。
- Node/npm 依赖已安装，可执行 `fronted` 单测与 Playwright e2e。
- `tobedeleted/上海展厅展品列表.xlsx` 存在且包含导入所需列。
- Playwright Chromium 浏览器已可用，供 UI/e2e 验证。

## Impacted Areas

- 后端依赖注入与蓝图注册：`backend/bootstrap.py`、`backend/app_deps.py`
- 后端请求上下文与设备标识：`backend/api/request_context.py`
- 现有 TTS 复用入口：`backend/services/tts_service.py`
- 现有音频持久化参考：`backend/services/recording_store.py`、`backend/api/recordings.py`
- 新 pad 后端模块：新建 store/service/api/import script
- 旧前端主入口与设备上下文：`fronted/src/App.js`、`fronted/src/app/AppShell.js`、`fronted/src/hooks/useClientId.js`
- 旧前端部署：`fronted/Dockerfile`、`fronted/nginx.conf`、`docker-compose.yml`
- 前端测试与 e2e：`fronted/src/**/*.test.js`、`fronted/e2e/*.spec.js`

## Phase Plan

### P1: 后端 pad 产品讲解数据域与接口

- Objective:
  建立 pad 专用数据表、导入脚本、音频资产管理与 `/api/pad/*` 接口，确保按 `client_id` 返回当前展厅的数据与音频。
- Owned paths:
  `backend/app_deps.py`
  `backend/bootstrap.py`
  `backend/api/request_context.py`
  `backend/api/pad.py`
  `backend/services/pad_product_store.py`
  `backend/services/pad_product_audio_service.py`
  `scripts/import_pad_hall_products.py`
  `backend/tests/test_pad_product_store.py`
  `backend/tests/test_pad_api_blueprint_unit.py`
  `backend/tests/test_pad_import_script.py`
- Dependencies:
  现有 `TTSSvc`、现有请求头 `X-Client-ID`、Excel 产品源文件。
- Deliverables:
  新 SQLite 表、音频资产目录、导入脚本、后端接口、后端自动化测试。

### P2: 新 pad 前端、离线缓存与双前端部署

- Objective:
  实现新的 pad 首页前端与离线缓存机制，并将旧前端迁移至 `/ragint`，完成 nginx 双 SPA 托管。
- Owned paths:
  `pad-frontend/` 下的新前端资源
  `fronted/nginx.conf`
  `fronted/Dockerfile`
  `docker-compose.yml`
  `fronted/e2e/pad-frontend.spec.js`
- Dependencies:
  P1 的 `/api/pad/*` 接口稳定可用；现有 `clientId` 共享约定延续。
- Deliverables:
  pad 前端静态应用、service worker/离线缓存、部署改造、pad 前端 e2e。

### P3: 旧 RagInt 前端入口整合、双向导航与回归验证

- Objective:
  让旧前端适配 `/ragint` 子路径与 `?entry=tour` 启动参数，提供返回 pad 前端入口，并补齐相关单测/e2e 回归。
- Owned paths:
  `fronted/src/App.js`
  `fronted/src/app/AppShell.js`
  `fronted/src/components/HomeActions.js`
  `fronted/src/components/HomeActions.test.js`
  `fronted/src/app/AppShell.test.js`
  `fronted/e2e/app-shell.spec.js`
  `fronted/e2e/business-flows.spec.js`
- Dependencies:
  P2 的部署路径和 pad 首页入口已确定。
- Deliverables:
  旧前端入口改造、双向跳转、共享 `clientId` 验证、自动化回归通过。

## Phase Acceptance Criteria

### P1

- P1-AC1: 后端存在 pad 专用 SQLite 表 `pad_hall_bindings`、`hall_products`、`product_audio_assets`，并满足“一个 `client_id` 只绑定一个展厅”“一个产品任意时刻只有一个当前生效音频”的约束。
- P1-AC2: 导入脚本可从 `tobedeleted/上海展厅展品列表.xlsx` 导入 8 个展厅产品到 `hall_products`，保留排序与需求中指定字段。
- P1-AC3: `GET /api/pad/bootstrap`、`GET /api/pad/halls/current/products`、`GET /api/pad/offline/manifest` 只能按当前 `X-Client-ID` 返回本 pad 所属展厅数据。
- P1-AC4: `GET /api/pad/products/<product_id>/audio/current` 始终返回当前生效音频；上传录音与 TTS 重生成都能切换当前生效音频且不污染旧录音业务表。
- Evidence expectation:
  `execution-log.md` 记录表结构、接口与导入脚本验证；后端 pytest 结果覆盖 P1-AC1 至 P1-AC4。

### P2

- P2-AC1: 新 pad 前端作为 `/` 默认首页启动，读取共享 `localStorage.clientId`，调用 `/api/pad/bootstrap` 与 `/api/pad/halls/current/products` 后仅展示本厅产品。
- P2-AC2: pad 前端点击产品后可播放当前生效音频，并提供进入旧前端 `/ragint/?entry=tour` 的可见入口。
- P2-AC3: pad 前端实现“每台 pad 只缓存自己展厅完整资源”的离线能力；首次同步成功后断网仍可打开 `/`、查看列表并播放已缓存音频；若从未完成同步则明确报错而非静默降级。
- P2-AC4: nginx/Docker 构建同时托管 `/` pad 前端、`/ragint` 旧前端与 `/api/*` 后端代理，旧前端静态资源前缀与路由可在子路径下正常工作。
- Evidence expectation:
  `execution-log.md` 记录新前端与部署改造；Playwright/前端测试结果覆盖在线与离线场景。

### P3

- P3-AC1: 旧 RagInt 前端在 `/ragint` 下正常启动，并在 `?entry=tour` 时直接进入展厅讲解模式而不是普通问答初始态。
- P3-AC2: 旧前端提供返回 pad 产品讲解首页的入口，pad 前端也可跳转到旧前端，两者切换过程中 `localStorage.clientId` 保持不变。
- P3-AC3: 与本次改动耦合的旧前端单测与 e2e 回归完成，手动文本发送和原有问答主链路未因路径迁移而损坏。
- Evidence expectation:
  `execution-log.md` 记录旧前端改动与回归；前端单测和 Playwright e2e 结果覆盖 P3-AC1 至 P3-AC3。

## Done Definition

- P1、P2、P3 全部完成并有对应证据。
- `/api/pad/*` 后端接口、导入脚本、新 pad 前端、旧前端 `/ragint` 迁移、双向切换、离线缓存均已落地。
- 自动化验证至少包含后端 pytest、前端单测和 Playwright real-browser 场景。
- `execution-log.md` 与 `test-report.md` 对每个 acceptance id 都有可追溯证据。

## Blocking Conditions

- Excel 源文件缺失、列结构不满足导入要求，必须停止并记录阻塞。
- 当前环境无法运行前端构建或 Playwright real-browser 测试，必须明确记录为阻塞，不能用“理论正确”替代验证。
- 若现有 TTS 底座无法被 pad 产品讲解服务复用，必须停止并说明具体缺失点，不能偷偷改成只保存文本或伪造音频成功。
