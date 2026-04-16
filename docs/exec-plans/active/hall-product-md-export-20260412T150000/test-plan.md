# Test Plan

- Task ID: `hall-product-md-export-20260412T150000`
- Created: `2026-04-12T15:16:43`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `从上海展厅展品列表.xlsx提取每个展厅的产品名称、英文名称、产品介绍（/优势特点）、注册证名称、注册证号、生效时间、所属公司并生成独立Markdown表格文件`

## Test Scope

验证导出脚本是否能基于真实源 Excel 生成 8 个独立展厅 Markdown 文件，并校验文件集合、表头字段、条目数和代表性样例行。测试范围不包括前后端运行时接入，也不包括对 Excel 原始内容的业务修订。

## Environment

- 工作区：`D:\ProjectPackage\RagInt`
- 运行环境：本地 Windows PowerShell + Python 3.12
- 依赖：`pandas`, `openpyxl`
- 输入文件：[tobedeleted/上海展厅展品列表.xlsx](D:/ProjectPackage/RagInt/tobedeleted/上海展厅展品列表.xlsx)
- 输出目录：[docs/generated/hall-product-tables](D:/ProjectPackage/RagInt/docs/generated/hall-product-tables)

## Accounts and Fixtures

- 不需要账号或远程服务。
- 固定使用本地源文件 [上海展厅展品列表.xlsx](D:/ProjectPackage/RagInt/tobedeleted/上海展厅展品列表.xlsx)。
- 若依赖缺失、源文件不可读或输出目录不可写，测试必须直接失败并记录阻塞项。

If any required item is missing, the tester must fail fast and record the missing prerequisite.

## Commands

- `python scripts/export_hall_product_tables.py --input "D:\ProjectPackage\RagInt\tobedeleted\上海展厅展品列表.xlsx" --output-dir "D:\ProjectPackage\RagInt\docs\generated\hall-product-tables"`
  Success signal: 命令退出码为 0，并打印生成摘要。
- `@' ... '@ | python -`
  Success signal: 校验脚本退出码为 0，并输出 8 个展厅的条目统计、文件存在性和表头一致性结论。
- `@' ... '@ | python -`
  Success signal: 样例抽查脚本退出码为 0，并确认代表性产品行在对应 Markdown 文件中可定位。

## Test Cases

Use stable test case ids. Every acceptance id from the PRD should appear in at least one `Covers` field.

### T1: Run the exporter on the real workbook

- Covers: P1-AC1, P1-AC2, P1-AC3, P2-AC1
- Level: integration
- Command: `python scripts/export_hall_product_tables.py --input "D:\ProjectPackage\RagInt\tobedeleted\上海展厅展品列表.xlsx" --output-dir "D:\ProjectPackage\RagInt\docs\generated\hall-product-tables"`
- Expected: 导出脚本成功结束，生成 8 个展厅 Markdown 文件和 1 个索引文件，不包含尾注说明行。

### T2: Verify file set, headers, and hall counts

- Covers: P1-AC2, P1-AC3, P2-AC1, P2-AC3
- Level: integration
- Command: `@' using pandas + pathlib to compare workbook-derived hall counts, output files, and markdown headers '@ | python -`
- Expected: 8 个展厅都存在对应 Markdown 文件；每个文件表头完全一致；每个展厅的导出条目数与源表归并后的条目数一致。

### T3: Spot-check representative product rows

- Covers: P1-AC1, P2-AC2
- Level: manual
- Command: `@' using pandas + pathlib to assert selected source rows appear in the expected hall markdown files '@ | python -`
- Expected: 抽样产品的中文名称、英文名称、注册证号或介绍片段能在对应展厅文件中命中，证明字段未错位或丢失。

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | export pipeline | 真实执行 Excel -> Markdown 导出 | integration | P1-AC1, P1-AC2, P1-AC3, P2-AC1 | `test-report.md#T1` |
| T2 | generated docs | 校验文件集合、表头和展厅条目数 | integration | P1-AC2, P1-AC3, P2-AC1, P2-AC3 | `test-report.md#T2` |
| T3 | data fidelity | 抽查代表性行的字段保真度 | manual | P1-AC1, P2-AC2 | `test-report.md#T3` |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-runtime
- Required tools: python, pandas, openpyxl
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: Run against the real local workbook and generated Markdown outputs in the current repo workspace.
- Escalation rule: Do not inspect withheld artifacts until the tester has written an initial verdict or the main agent explicitly asks for discrepancy analysis.

## Pass / Fail Criteria

- Pass when: 8 个展厅 Markdown 文件和索引文件全部生成；表头字段严格匹配；源表归并后的条目数与输出一致；代表性样例行在对应文件中命中。
- Fail when: 生成文件缺失、展厅映射错误、表头不一致、条目数不一致、尾注被误导出、或抽样字段出现缺失/错位。

## Regression Scope

- [tobedeleted/展厅产品清单.md](D:/ProjectPackage/RagInt/tobedeleted/展厅产品清单.md) 中既有的 8 展厅分组命名。
- [docs/generated](D:/ProjectPackage/RagInt/docs/generated) 下新增文件不会覆盖其他已有生成内容。
- 新增脚本不会依赖前后端运行时或数据库状态。

## Reporting Notes

Write results to `test-report.md`.

The tester must remain independent from the executor and should prefer blind-first-pass unless the task explicitly needs full-context evaluation.
