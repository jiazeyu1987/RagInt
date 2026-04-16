# PRD

- Task ID: `docs-20260407T232251`
- Created: `2026-04-07T23:22:51`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `读取前后端代码，按照指定文档结构在仓库 docs/ 下编写并落地项目文档，覆盖前后端架构、设计、产品、计划、质量、可靠性与安全说明。`

## Goal

基于仓库当前真实实现，补齐一套可长期维护的项目文档体系，使新加入的开发者、测试人员和后续自动化代理能够快速理解 RagInt 的前后端架构、运行方式、关键用户流程、存储结构、验证入口、已知技术债和安全/可靠性约束。

## Scope

- 读取并归纳 `backend/`、`fronted/`、`docker-compose.yml`、`ragflow_demo/`、`backend/openapi.json`、`backend/data/*.db`、现有测试和现有文档。
- 新增或更新以下目标文档集合：`AGENTS.md`、`ARCHITECTURE.md`、`docs/DESIGN.md`、`docs/FRONTEND.md`、`docs/PLANS.md`、`docs/PRODUCT_SENSE.md`、`docs/QUALITY_SCORE.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`。
- 新增或更新以下结构化子目录文档：`docs/design-docs/index.md`、`docs/design-docs/core-beliefs.md`、`docs/design-docs/frontend-architecture.md`、`docs/design-docs/backend-architecture.md`、`docs/design-docs/interaction-flow.md`、`docs/product-specs/index.md`、`docs/product-specs/new-user-onboarding.md`、`docs/product-specs/voice-qa.md`、`docs/product-specs/guided-tour.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/exec-plans/completed/README.md`、`docs/generated/db-schema.md`。
- 新增或更新参考说明文档：`docs/references/design-system-reference-llms.txt`、`docs/references/nixpacks-llms.txt`、`docs/references/uv-llms.txt`、`docs/references/runtime-config-reference.md`。
- 保留并复用当前任务目录 `docs/exec-plans/active/docs-20260407T232251/`，不破坏其工件结构。

## Non-Goals

- 不修改前后端业务代码、接口契约、数据库结构、测试逻辑或部署脚本。
- 不为仓库当前未采用的工具链虚构实现细节，例如不存在的 `uv` 工作流或 `nixpacks` 配置；若文档结构要求保留对应文件，只记录当前未采用的事实和迁移注意点。
- 不把历史乱码内容原样复制进新文档；需要重新基于代码事实整理表达。
- 不借文档任务顺手修复已识别的安全问题、编码问题或架构缺陷，只在文档中如实记录现状与风险。

## Preconditions

- 工作区 `D:\ProjectPackage\RagInt` 可读写，且允许在 `docs/` 下新增文件。
- 可读取 `backend/openapi.json`、`backend/bootstrap.py`、`backend/app.py`、`fronted/src/app/AppShell.js`、`fronted/package.json`、`backend/requirements*.txt`、`docker-compose.yml`。
- 可读取 `backend/data/*.db` 以生成 `docs/generated/db-schema.md`；若数据库文件不可读，则必须停止并记录该阻塞。
- 本地可运行 `python`，用于提取 SQLite schema、验证文档交叉引用与代码事实。
- 不要求真实启动 Redis、后端或前端服务完成文档编写；如最终验证需要超出静态仓库事实的运行态证据，必须明确报告为额外前提，而不是伪造结果。

## Impacted Areas

- 仓库入口与运行方式：`backend/app.py`、`backend/bootstrap.py`、`backend/wsgi.py`、`fronted/src/App.js`、`fronted/src/app/AppShell.js`、`docker-compose.yml`、`start_ragint.cmd`。
- 后端能力面：`backend/api/`、`backend/services/`、`backend/orchestrators/`、`backend/infra/`、`backend/config/`、`backend/openapi.json`、`backend/tests/`。
- 前端能力面：`fronted/src/api/`、`fronted/src/components/`、`fronted/src/hooks/`、`fronted/src/managers/`、`fronted/src/voice/`、`fronted/e2e/`。
- 数据与持久化：`backend/data/*.db`、`backend/data/recordings/`、`backend/data/qa_audio_cache/`。
- 现有文档与参考：`fronted/docs/interaction-flow.md`、新增的 `docs/` 文档集合、当前任务工件。

## Phase Plan

### P1: 建立文档骨架与架构总览

- Objective: 基于真实代码补齐项目级总览文档、核心导航和设计文档索引，先让仓库具备可浏览的文档入口与架构主线。
- Owned paths: AGENTS.md, ARCHITECTURE.md, docs/DESIGN.md, docs/FRONTEND.md, docs/design-docs/index.md, docs/design-docs/core-beliefs.md, docs/design-docs/frontend-architecture.md, docs/design-docs/backend-architecture.md, docs/design-docs/interaction-flow.md
- Dependencies: backend/app.py, backend/bootstrap.py, backend/openapi.json, fronted/src/app/AppShell.js, fronted/src/api, fronted/src/hooks, fronted/src/managers, docker-compose.yml, fronted/docs/interaction-flow.md
- Deliverables: 根目录协作文档与架构总览, 设计文档索引, 前端/后端架构拆解文档, 讲解与问答交互流说明

### P2: 补齐产品、计划、质量与生成文档

- Objective: 将产品视角、计划视角、质量/可靠性/安全视角和数据库结构文档化，并把文档结构补到用户要求的目录级别。
- Owned paths: docs/PLANS.md, docs/PRODUCT_SENSE.md, docs/QUALITY_SCORE.md, docs/RELIABILITY.md, docs/SECURITY.md, docs/product-specs/index.md, docs/product-specs/new-user-onboarding.md, docs/product-specs/voice-qa.md, docs/product-specs/guided-tour.md, docs/exec-plans/tech-debt-tracker.md, docs/exec-plans/completed/README.md, docs/generated/db-schema.md, docs/references/design-system-reference-llms.txt, docs/references/nixpacks-llms.txt, docs/references/uv-llms.txt, docs/references/runtime-config-reference.md
- Dependencies: backend/data/app_settings.db, backend/data/breakpoints.db, backend/data/ops.db, backend/data/qa_audio_cache.db, backend/data/qa_history.db, backend/data/ragflow_config.db, backend/data/selling_points.db, backend/data/tour_control.db, backend/data/recordings/recordings.db, backend/.env.example, fronted/.env.example, backend/tests, fronted/e2e, backend/requirements.txt, fronted/package.json
- Deliverables: 产品与用户流程文档, 计划与技术债文档, 质量/可靠性/安全文档, 基于 SQLite 的 schema 文档, 工具链参考文档

### P3: 交叉引用校对与代码事实对齐

- Objective: 检查新增文档是否完整覆盖目标结构、索引互链是否闭环、关键代码事实是否准确映射，并记录执行证据。
- Owned paths: AGENTS.md, ARCHITECTURE.md, docs, docs/exec-plans/active/docs-20260407T232251/execution-log.md
- Dependencies: P1 deliverables, P2 deliverables, python, backend/openapi.json, backend/bootstrap.py, fronted/src/app/AppShell.js
- Deliverables: 经校对的最终文档集合, 可复查的执行日志与证据引用

## Phase Acceptance Criteria

### P1

- P1-AC1: 根目录 `AGENTS.md` 与 `ARCHITECTURE.md` 建立完成，能够描述仓库协作约束、运行入口、前后端边界、关键服务与核心数据流。
- P1-AC2: `docs/design-docs/` 至少包含可导航的 `index.md`、`core-beliefs.md`、前端/后端架构文档和交互流文档，且内容直接引用真实模块、目录或接口。
- P1-AC3: `docs/DESIGN.md` 与 `docs/FRONTEND.md` 能从项目总览跳转到设计细节，并准确反映 React 18 + AppShell + hooks/managers 组织方式。
- Evidence expectation: 通过文件存在校验、索引互链校验和关键词对齐校验，证明文档入口齐全且架构描述与代码模块名称一致。

### P2

- P2-AC1: `docs/product-specs/`、`docs/exec-plans/`、`docs/generated/`、`docs/references/` 下的目标文件均已创建，并使用项目真实能力描述产品流程、计划与参考信息。
- P2-AC2: `docs/generated/db-schema.md` 基于当前 `backend/data/*.db` 中的真实表结构生成，至少覆盖 `app_settings`、`breakpoints`、`devices`、`qa_audio_pairs`、`qa_history`、`recordings`、`tour_control_commands` 等核心表。
- P2-AC3: `docs/QUALITY_SCORE.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md` 明确记录测试入口、运行时依赖、已知风险与当前防护现状，且不泄露真实密钥值。
- P2-AC4: `docs/references/nixpacks-llms.txt` 与 `docs/references/uv-llms.txt` 不杜撰现有实现，而是明确说明仓库当前使用 Dockerfile / requirements.txt / npm 的事实与未采用原因。
- Evidence expectation: 通过目录结构校验、数据库 schema 关键表名校验、敏感信息扫描和文档内容关键词校验，证明文档集合覆盖完整且内容基于真实仓库。

### P3

- P3-AC1: 顶层文档与子目录索引形成闭环导航，至少从 `ARCHITECTURE.md`、`docs/DESIGN.md`、`docs/product-specs/index.md`、`docs/design-docs/index.md` 能互相定位到对应主题文档。
- P3-AC2: 文档中的关键事实与代码一致，包括后端 Flask + blueprint 组织、前端 React AppShell 架构、Redis/SQLite/RAGFlow/VoiceKit/SAUC 相关能力、前后端端口与启动方式。
- P3-AC3: `execution-log.md` 记录本次文档编写覆盖的文件、使用的验证命令、对应验收项和剩余风险。
- Evidence expectation: 通过自动化校验脚本与人工抽样核对，证明文档结构、交叉引用和关键事实映射均可复查。

## Done Definition

- P1、P2、P3 均被评审为完成，且所有 acceptance id 都在 `execution-log.md` 或 `test-report.md` 中有证据。
- `docs/` 目录达到用户要求的结构层级，且目录中新增文件具备可读内容而非模板占位。
- 最终测试计划中的所有必要测试用例执行完毕，`test-report.md` 给出独立验证通过结论。
- 文档不包含未遮蔽的密钥、模板残留或与代码明显冲突的叙述。

## Blocking Conditions

- 无法读取关键代码入口、配置文件、OpenAPI 定义或 SQLite 数据库文件。
- 无法在仓库中创建 `docs/` 目标文件或当前任务工件持续被外部进程破坏。
- 验证阶段发现文档结构缺失、索引断链、关键代码事实无法对齐，且在本任务范围内无法修正。
- 需要依赖不存在的服务、凭据或外部系统才能证明文档内容正确，但仓库内又没有对应事实来源。
