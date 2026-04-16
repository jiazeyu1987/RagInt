# Test Plan

- Task ID: `docs-20260407T232251`
- Created: `2026-04-07T23:22:51`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `读取前后端代码，按照指定文档结构在仓库 docs/ 下编写并落地项目文档，覆盖前后端架构、设计、产品、计划、质量、可靠性与安全说明。`

## Test Scope

验证新增文档是否完整落地到用户要求的目录结构，是否包含可导航的索引关系，是否准确映射仓库中可观察到的前端、后端、配置、数据库和测试事实。测试范围包含文档文件本身、基于数据库和代码的事实抽样核对，以及对敏感信息泄露的静态检查。不在本次范围内的是业务代码运行结果、UI 像素级表现和外部服务联调。

## Environment

- 仓库工作区：`D:\ProjectPackage\RagInt`
- Shell：PowerShell
- Required runtime: `python` 可执行，允许读取仓库文件和 `backend/data/*.db`
- Startup steps: 不要求启动 Redis、后端或前端服务；所有验证在仓库静态事实和本地脚本层完成
- Platform assumptions: 文档文件采用 UTF-8 编码；测试者可以读取 `backend/openapi.json`、`backend/bootstrap.py`、`fronted/src/app/AppShell.js`、SQLite 数据库文件与新增文档

## Accounts and Fixtures

- 无需账号登录。
- 需要现有仓库内的真实文件作为基准：`backend/openapi.json`、`backend/data/*.db`、`backend/tests/`、`fronted/e2e/`、`docker-compose.yml`、`fronted/package.json`、`backend/requirements.txt`。
- 如果任何关键文件缺失或数据库文件不可读，测试者必须立即判定为阻塞并在 `test-report.md` 中记录。

## Commands

- `Get-ChildItem -Path 'AGENTS.md','ARCHITECTURE.md','docs\\DESIGN.md','docs\\FRONTEND.md','docs\\PLANS.md','docs\\PRODUCT_SENSE.md','docs\\QUALITY_SCORE.md','docs\\RELIABILITY.md','docs\\SECURITY.md','docs\\design-docs','docs\\product-specs','docs\\generated','docs\\references','docs\\exec-plans\\tech-debt-tracker.md','docs\\exec-plans\\completed'`
  Expected success signal: 所有目标路径都存在，PowerShell 不报 `Cannot find path`
- `@'\nfrom pathlib import Path\nrequired = [\n    'AGENTS.md','ARCHITECTURE.md','docs/DESIGN.md','docs/FRONTEND.md','docs/PLANS.md','docs/PRODUCT_SENSE.md','docs/QUALITY_SCORE.md','docs/RELIABILITY.md','docs/SECURITY.md',\n    'docs/design-docs/index.md','docs/design-docs/core-beliefs.md','docs/design-docs/frontend-architecture.md','docs/design-docs/backend-architecture.md','docs/design-docs/interaction-flow.md',\n    'docs/product-specs/index.md','docs/product-specs/new-user-onboarding.md','docs/product-specs/voice-qa.md','docs/product-specs/guided-tour.md',\n    'docs/generated/db-schema.md','docs/references/design-system-reference-llms.txt','docs/references/nixpacks-llms.txt','docs/references/uv-llms.txt','docs/references/runtime-config-reference.md',\n    'docs/exec-plans/tech-debt-tracker.md','docs/exec-plans/completed/README.md'\n]\nmissing = [p for p in required if not Path(p).exists()]\nif missing:\n    raise SystemExit('missing:' + ','.join(missing))\nprint('all_required_docs_present')\n'@ | python -`
  Expected success signal: 输出 `all_required_docs_present`
- `@'\nfrom pathlib import Path\npairs = {\n    'ARCHITECTURE.md': ['docs/DESIGN.md', 'docs/FRONTEND.md', 'docs/design-docs/index.md', 'docs/product-specs/index.md'],\n    'docs/DESIGN.md': ['docs/design-docs/index.md'],\n    'docs/design-docs/index.md': ['core-beliefs.md', 'frontend-architecture.md', 'backend-architecture.md', 'interaction-flow.md'],\n    'docs/product-specs/index.md': ['new-user-onboarding.md', 'voice-qa.md', 'guided-tour.md']\n}\nfor file, expected_refs in pairs.items():\n    text = Path(file).read_text(encoding='utf-8')\n    for ref in expected_refs:\n        if ref not in text:\n            raise SystemExit(f'missing_ref:{file}:{ref}')\nprint('cross_links_ok')\n'@ | python -`
  Expected success signal: 输出 `cross_links_ok`
- `@'\nfrom pathlib import Path\nchecks = {\n    'ARCHITECTURE.md': ['backend/app.py', 'backend/bootstrap.py', 'fronted/src/app/AppShell.js', 'docker-compose.yml'],\n    'docs/FRONTEND.md': ['React 18', 'AppShell', 'hooks', 'managers', 'voice'],\n    'docs/RELIABILITY.md': ['Redis', 'SQLite', 'RAGINT_STATE_BACKEND', 'backend/tests'],\n    'docs/SECURITY.md': ['RAGINT_OPS_ADMIN_TOKEN', 'RAGINT_DIAGNOSTICS_KEY', 'ragflow_demo/ragflow_config.json']\n}\nfor file, needles in checks.items():\n    text = Path(file).read_text(encoding='utf-8')\n    for needle in needles:\n        if needle not in text:\n            raise SystemExit(f'missing_fact:{file}:{needle}')\nprint('fact_alignment_ok')\n'@ | python -`
  Expected success signal: 输出 `fact_alignment_ok`
- `@'\nimport sqlite3\nfrom pathlib import Path\nschema_doc = Path('docs/generated/db-schema.md').read_text(encoding='utf-8')\nchecks = {\n    'backend/data/app_settings.db': ['app_settings'],\n    'backend/data/breakpoints.db': ['breakpoints'],\n    'backend/data/ops.db': ['devices', 'device_configs', 'device_tokens', 'ops_audit'],\n    'backend/data/qa_audio_cache.db': ['qa_audio_pairs', 'qa_audio_embeddings'],\n    'backend/data/qa_history.db': ['qa_history', 'qa_cache'],\n    'backend/data/ragflow_config.db': ['ragflow_config'],\n    'backend/data/selling_points.db': ['selling_points'],\n    'backend/data/tour_control.db': ['tour_control_commands', 'tour_control_state'],\n    'backend/data/recordings/recordings.db': ['recordings', 'recording_ask_events', 'recording_tts_audio'],\n}\nfor db_path, tables in checks.items():\n    conn = sqlite3.connect(db_path)\n    try:\n        existing = {row[0] for row in conn.execute(\"select name from sqlite_master where type='table' and name not like 'sqlite_%'\")}\n    finally:\n        conn.close()\n    for table in tables:\n        if table not in existing:\n            raise SystemExit(f'missing_table:{db_path}:{table}')\n        if table not in schema_doc:\n            raise SystemExit(f'missing_table_in_doc:{table}')\nprint('db_schema_ok')\n'@ | python -`
  Expected success signal: 输出 `db_schema_ok`
- `@'\nfrom pathlib import Path\ntext = '\\n'.join(Path(p).read_text(encoding='utf-8') for p in [\n    'AGENTS.md','ARCHITECTURE.md','docs/DESIGN.md','docs/FRONTEND.md','docs/PLANS.md','docs/PRODUCT_SENSE.md','docs/QUALITY_SCORE.md','docs/RELIABILITY.md','docs/SECURITY.md',\n    'docs/design-docs/index.md','docs/design-docs/core-beliefs.md','docs/design-docs/frontend-architecture.md','docs/design-docs/backend-architecture.md','docs/design-docs/interaction-flow.md',\n    'docs/product-specs/index.md','docs/product-specs/new-user-onboarding.md','docs/product-specs/voice-qa.md','docs/product-specs/guided-tour.md',\n    'docs/generated/db-schema.md','docs/references/design-system-reference-llms.txt','docs/references/nixpacks-llms.txt','docs/references/uv-llms.txt','docs/references/runtime-config-reference.md',\n    'docs/exec-plans/tech-debt-tracker.md','docs/exec-plans/completed/README.md'])\nblocked = ['sk-', 'ghp_', 'github_pat_', 'AKIA', 'api_key\": \"', 'api_key = ']\nfor needle in blocked:\n    if needle in text:\n        raise SystemExit(f'secret_like_content:{needle}')\nprint('no_secret_leak_in_docs')\n'@ | python -`
  Expected success signal: 输出 `no_secret_leak_in_docs`

## Test Cases

### T1: 文档结构与入口文件完整性

- Covers: P1-AC1, P2-AC1
- Level: integration
- Command: `@'\nfrom pathlib import Path\nrequired = [\n    'AGENTS.md','ARCHITECTURE.md','docs/DESIGN.md','docs/FRONTEND.md','docs/PLANS.md','docs/PRODUCT_SENSE.md','docs/QUALITY_SCORE.md','docs/RELIABILITY.md','docs/SECURITY.md',\n    'docs/design-docs/index.md','docs/design-docs/core-beliefs.md','docs/design-docs/frontend-architecture.md','docs/design-docs/backend-architecture.md','docs/design-docs/interaction-flow.md',\n    'docs/product-specs/index.md','docs/product-specs/new-user-onboarding.md','docs/product-specs/voice-qa.md','docs/product-specs/guided-tour.md',\n    'docs/generated/db-schema.md','docs/references/design-system-reference-llms.txt','docs/references/nixpacks-llms.txt','docs/references/uv-llms.txt','docs/references/runtime-config-reference.md',\n    'docs/exec-plans/tech-debt-tracker.md','docs/exec-plans/completed/README.md'\n]\nmissing = [p for p in required if not Path(p).exists()]\nif missing:\n    raise SystemExit('missing:' + ','.join(missing))\nprint('all_required_docs_present')\n'@ | python -`
- Expected: 所有目标文件存在，并输出 `all_required_docs_present`

### T2: 索引互链与导航闭环

- Covers: P1-AC2, P3-AC1
- Level: integration
- Command: `@'\nfrom pathlib import Path\npairs = {\n    'ARCHITECTURE.md': ['docs/DESIGN.md', 'docs/FRONTEND.md', 'docs/design-docs/index.md', 'docs/product-specs/index.md'],\n    'docs/DESIGN.md': ['docs/design-docs/index.md'],\n    'docs/design-docs/index.md': ['core-beliefs.md', 'frontend-architecture.md', 'backend-architecture.md', 'interaction-flow.md'],\n    'docs/product-specs/index.md': ['new-user-onboarding.md', 'voice-qa.md', 'guided-tour.md']\n}\nfor file, expected_refs in pairs.items():\n    text = Path(file).read_text(encoding='utf-8')\n    for ref in expected_refs:\n        if ref not in text:\n            raise SystemExit(f'missing_ref:{file}:{ref}')\nprint('cross_links_ok')\n'@ | python -`
- Expected: 关键入口文档与索引文档中的预期引用全部存在，并输出 `cross_links_ok`

### T3: 架构事实与代码模块对齐

- Covers: P1-AC3, P3-AC2
- Level: integration
- Command: `@'\nfrom pathlib import Path\nchecks = {\n    'ARCHITECTURE.md': ['backend/app.py', 'backend/bootstrap.py', 'fronted/src/app/AppShell.js', 'docker-compose.yml'],\n    'docs/FRONTEND.md': ['React 18', 'AppShell', 'hooks', 'managers', 'voice'],\n    'docs/DESIGN.md': ['RAGFlow', 'VoiceKit', 'SAUC', 'tour'],\n    'docs/RELIABILITY.md': ['Redis', 'SQLite', 'RAGINT_STATE_BACKEND', 'backend/tests']\n}\nfor file, needles in checks.items():\n    text = Path(file).read_text(encoding='utf-8')\n    for needle in needles:\n        if needle not in text:\n            raise SystemExit(f'missing_fact:{file}:{needle}')\nprint('fact_alignment_ok')\n'@ | python -`
- Expected: 文档中可找到与真实代码组织相匹配的关键事实，并输出 `fact_alignment_ok`

### T4: 数据库 schema 文档真实性

- Covers: P2-AC2
- Level: integration
- Command: `@'\nimport sqlite3\nfrom pathlib import Path\nschema_doc = Path('docs/generated/db-schema.md').read_text(encoding='utf-8')\nchecks = {\n    'backend/data/app_settings.db': ['app_settings'],\n    'backend/data/breakpoints.db': ['breakpoints'],\n    'backend/data/ops.db': ['devices', 'device_configs', 'device_tokens', 'ops_audit'],\n    'backend/data/qa_audio_cache.db': ['qa_audio_pairs', 'qa_audio_embeddings'],\n    'backend/data/qa_history.db': ['qa_history', 'qa_cache'],\n    'backend/data/ragflow_config.db': ['ragflow_config'],\n    'backend/data/selling_points.db': ['selling_points'],\n    'backend/data/tour_control.db': ['tour_control_commands', 'tour_control_state'],\n    'backend/data/recordings/recordings.db': ['recordings', 'recording_ask_events', 'recording_tts_audio'],\n}\nfor db_path, tables in checks.items():\n    conn = sqlite3.connect(db_path)\n    try:\n        existing = {row[0] for row in conn.execute(\"select name from sqlite_master where type='table' and name not like 'sqlite_%'\")}\n    finally:\n        conn.close()\n    for table in tables:\n        if table not in existing:\n            raise SystemExit(f'missing_table:{db_path}:{table}')\n        if table not in schema_doc:\n            raise SystemExit(f'missing_table_in_doc:{table}')\nprint('db_schema_ok')\n'@ | python -`
- Expected: 数据库中的核心表在文档中均有覆盖，并输出 `db_schema_ok`

### T5: 风险与参考文档的现状表达

- Covers: P2-AC3, P2-AC4
- Level: manual
- Command: `人工阅读 docs/SECURITY.md、docs/RELIABILITY.md、docs/references/nixpacks-llms.txt、docs/references/uv-llms.txt，并确认文档明确说明现有风险与当前未采用的工具链事实，不出现伪造实现。`
- Expected: 安全文档记录真实风险但不泄露密钥；参考文档明确说明仓库当前使用 Dockerfile / requirements.txt / npm，而非虚构的 nixpacks/uv 现状

### T6: 执行证据与剩余风险记录

- Covers: P3-AC3
- Level: manual
- Command: `人工阅读 docs/exec-plans/active/docs-20260407T232251/execution-log.md，确认至少有一节使用真实 phase id，且记录 changed paths、validation、acceptance ids 和 remaining risks。`
- Expected: `execution-log.md` 存在可复查的阶段记录，并能映射到 P1/P2/P3 的验收项

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | 文档结构 | 目标文件与目录完整创建 | integration | P1-AC1, P2-AC1 | `test-report.md` 中的文件存在命令结果 |
| T2 | 文档导航 | 架构与索引文档形成互链闭环 | integration | P1-AC2, P3-AC1 | `test-report.md` 中的 cross-link 检查结果 |
| T3 | 代码事实 | 文档中的架构事实与真实模块对齐 | integration | P1-AC3, P3-AC2 | `test-report.md` 中的关键词对齐检查结果 |
| T4 | 数据结构 | 生成的 schema 文档覆盖真实核心表 | integration | P2-AC2 | `test-report.md` 中的 SQLite 校验结果 |
| T5 | 风险与参考 | 安全/可靠性/工具链参考不杜撰现状 | manual | P2-AC3, P2-AC4 | `test-report.md` 中的人工复核说明 |
| T6 | 执行证据 | 执行日志映射完整 phase 与 AC | manual | P3-AC3 | `test-report.md` 中的 execution-log 复核说明 |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-runtime
- Required tools: python, powershell
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 在真实仓库目录和真实数据库文件上执行检查命令，不依赖聊天总结替代结果；若命令无法访问关键文件，必须按阻塞处理。
- Escalation rule: 测试者必须先仅依据 `prd.md`、`test-plan.md` 和仓库现状完成首轮判断，写出初始结论后，才能查看 `execution-log.md` 或 `task-state.json` 做差异分析。

## Pass / Fail Criteria

- Pass when: 所有目标文档存在，交叉引用与索引校验通过，关键代码事实与数据库结构核对通过，安全/可靠性/参考文档未泄露敏感值且未杜撰未采用工具链，执行日志完整记录各 phase 证据。
- Fail when: 任一目标文件缺失，索引断链，文档与代码事实冲突，schema 文档遗漏核心表，安全文档泄露真实密钥值，或执行日志无法映射验收项。

## Regression Scope

- 检查当前任务目录 `docs/exec-plans/active/docs-20260407T232251/` 是否仍保留全部五个必需工件。
- 检查新增文档是否没有误覆盖 `fronted/docs/interaction-flow.md` 以外的现有文档资产。
- 检查根目录与 `docs/` 下链接使用的相对路径是否适配仓库真实层级。
- 检查 `docs/generated/db-schema.md` 与当前 SQLite 文件保持一致，不引用不存在的表或字段。

## Reporting Notes

测试结果写入 `test-report.md`。测试者必须保持独立，不修正文档内容，只记录命令、环境证据、覆盖的 acceptance ids 和最终结论。
