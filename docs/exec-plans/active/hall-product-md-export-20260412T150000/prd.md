# PRD

- Task ID: `hall-product-md-export-20260412T150000`
- Created: `2026-04-12T15:16:43`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `从上海展厅展品列表.xlsx提取每个展厅的产品名称、英文名称、产品介绍（/优势特点）、注册证名称、注册证号、生效时间、所属公司并生成独立Markdown表格文件`

## Goal

把 [上海展厅展品列表.xlsx](D:/ProjectPackage/RagInt/tobedeleted/上海展厅展品列表.xlsx) 中 8 个产品展厅的展品信息整理为可直接复用的独立 Markdown 表格文件，每个展厅一个文件，并保留用户指定字段与源表顺序。

## Scope

- 读取 [上海展厅展品列表.xlsx](D:/ProjectPackage/RagInt/tobedeleted/上海展厅展品列表.xlsx) 中的展品数据。
- 按展厅生成独立 Markdown 文件，覆盖以下展厅：心内介植入展厅、心脏植入展厅、外周介植入展厅、神经介植入展厅、外泌体与超声聚焦展厅、骨科与泌尿产品展厅、非介入类产品展厅、医疗标准件展厅。
- 生成一个总览索引文件，方便查看输出目录和每个展厅的条目数。
- 为导出流程提供可复跑的脚本，避免手工复制整理。

## Non-Goals

- 不修改后端、前端或数据库中的现有知识库配置。
- 不补写 Excel 中缺失的字段，不推断不存在的注册信息。
- 不重新命名或重组源数据中的产品内容，只做结构化导出与必要的 Markdown 转义。
- 不处理“公司与孵化转化平台介绍”“企业荣誉展厅”等非产品清单来源，因为该 Excel 当前只覆盖 8 个产品展厅。

## Preconditions

- [上海展厅展品列表.xlsx](D:/ProjectPackage/RagInt/tobedeleted/上海展厅展品列表.xlsx) 在本地存在且可读。
- 本地 Python 环境可运行 `pandas` 与 `openpyxl`。
- 输出目录 [docs/generated/hall-product-tables](D:/ProjectPackage/RagInt/docs/generated/hall-product-tables) 可写。
- 源表字段至少包含：所在展柜、产品序号、中文名称、英文名称、产品介绍（/优势特点）、注册证名称、注册证号、生效时间、所属公司。

If any item is missing, stop and record it in `task-state.json.blocking_prereqs`.

## Impacted Areas

- [scripts/export_hall_product_tables.py](D:/ProjectPackage/RagInt/scripts/export_hall_product_tables.py)
- [docs/generated/hall-product-tables](D:/ProjectPackage/RagInt/docs/generated/hall-product-tables)
- [docs/exec-plans/active/hall-product-md-export-20260412T150000/prd.md](D:/ProjectPackage/RagInt/docs/exec-plans/active/hall-product-md-export-20260412T150000/prd.md)
- [docs/exec-plans/active/hall-product-md-export-20260412T150000/test-plan.md](D:/ProjectPackage/RagInt/docs/exec-plans/active/hall-product-md-export-20260412T150000/test-plan.md)
- [docs/exec-plans/active/hall-product-md-export-20260412T150000/execution-log.md](D:/ProjectPackage/RagInt/docs/exec-plans/active/hall-product-md-export-20260412T150000/execution-log.md)
- [docs/exec-plans/active/hall-product-md-export-20260412T150000/test-report.md](D:/ProjectPackage/RagInt/docs/exec-plans/active/hall-product-md-export-20260412T150000/test-report.md)

## Phase Plan

Use stable phase ids. Do not renumber ids after execution has started.

### P1: Implement the hall export pipeline

- Objective: 新增一个可重复执行的导出脚本，稳定读取源 Excel、过滤无效尾注行、按展厅归并产品，并输出统一格式的 Markdown 表格文件与总览索引。
- Owned paths: `scripts/export_hall_product_tables.py`, `docs/generated/hall-product-tables/*`, `docs/exec-plans/active/hall-product-md-export-20260412T150000/execution-log.md`
- Dependencies: `tobedeleted/上海展厅展品列表.xlsx`, `pandas`, `openpyxl`, 已确认的 8 个展厅序号范围
- Deliverables: 可复跑导出脚本、8 个展厅 Markdown 文件、1 个索引文件

### P2: Validate generated hall tables against the source workbook

- Objective: 执行导出命令并校验生成结果，确认文件数量、展厅覆盖、表头字段、条目顺序和代表性样例行都与源表一致。
- Owned paths: `docs/generated/hall-product-tables/*`, `docs/exec-plans/active/hall-product-md-export-20260412T150000/execution-log.md`, `docs/exec-plans/active/hall-product-md-export-20260412T150000/test-report.md`
- Dependencies: P1 deliverables, `python`, 本地工作区中的生成结果
- Deliverables: 成功的导出执行记录、结构化验证结果、带 acceptance id 证据的测试报告

## Phase Acceptance Criteria

List criteria under the matching phase id. Every criterion must use a stable acceptance id.

### P1

- P1-AC1: 导出脚本能够从源 Excel 中读取有效产品行，只保留用户指定的 7 个字段，并对空值、换行和 Markdown 特殊字符做稳定处理，不引入臆测字段。
- P1-AC2: 导出脚本基于稳定的展厅归并规则把所有有效产品行映射到 8 个产品展厅之一，且不会把尾注说明行误导出为产品记录。
- P1-AC3: 导出结果会在 `docs/generated/hall-product-tables` 下生成 8 个独立展厅 Markdown 文件和 1 个索引文件，每个展厅文件只包含该展厅的表格内容并保留源表顺序。
- Evidence expectation: `execution-log.md` 记录脚本路径、输出目录、生成文件清单和关键命令结果，并能直接引用已生成的 Markdown 文件。

### P2

- P2-AC1: 实际运行导出命令后，输出目录中存在且仅存在 8 个展厅 Markdown 文件与 1 个索引文件，展厅名称与 PRD 范围一致。
- P2-AC2: 每个展厅 Markdown 表格的表头严格包含“产品名称、英文名称、产品介绍（/优势特点）、注册证名称、注册证号、生效时间、所属公司”，且源表中的代表性样例行在导出文件中字段值一致。
- P2-AC3: 验证结果明确记录每个展厅的条目数与源表归并后的条目数一致，并将结果写入 `test-report.md`，形成可审计证据。
- Evidence expectation: `test-report.md` 记录执行命令、环境证明、文件路径证据与最终 verdict；`execution-log.md` 记录源表汇总与生成摘要。

## Done Definition

- P1、P2 均完成并在 `task-state.json` 中标记为 `completed`。
- 所有 acceptance ids 都有 `execution-log.md` 或 `test-report.md` 证据。
- [docs/generated/hall-product-tables](D:/ProjectPackage/RagInt/docs/generated/hall-product-tables) 中存在最终的 8 个展厅 Markdown 文件和索引文件。
- `test-report.md` 给出通过结论，并覆盖所有 acceptance ids。

At minimum, completion requires all phases completed and evidence for each acceptance id in `execution-log.md` or `test-report.md`.

## Blocking Conditions

- 源 Excel 无法读取、字段缺失或数据为空。
- 本地 Python 缺少 `pandas` 或 `openpyxl` 且无法执行导出脚本。
- 展厅归并规则无法从现有源文件和仓库上下文中明确确定。
- 导出文件数量、字段或条目数与源表不一致。
