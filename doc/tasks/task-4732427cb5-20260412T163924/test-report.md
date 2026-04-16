# Test Report

- Task ID: `task-4732427cb5-20260412T163924`
- Created: `2026-04-12T16:39:24`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `双前端展厅产品讲解系统正式方案`

## Environment Used

- Evaluation mode: blind-first-pass
- Validation surface: real-browser
- Tools: pytest; npm test; playwright
- Initial readable artifacts: prd.md; test-plan.md
- Initial withheld artifacts: execution-log.md; task-state.json
- Initial verdict before withheld inspection: yes

## Results

### T1: pad 数据表与客户端绑定解析

- Result: passed
- Covers: P1-AC1; P1-AC3
- Command run: python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py
- Environment proof: 在 D:\ProjectPackage\RagInt 的 Python 3.12.10 环境执行后端测试，同时在同一仓库的 Chromium Playwright 会话中通过 http://127.0.0.1:4981 验证双前端运行态。
- Evidence refs: test-results/task-4732427cb5/backend-pytest.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-loads-only-th-bf417-cts-for-the-bound-client-id-chromium/trace.zip
- Notes: backend/tests/test_pad_product_store.py 与 backend/tests/test_pad_api_blueprint_unit.py 中关于 client_id -> hall_id 绑定、/api/pad/bootstrap 和 /api/pad/halls/current/products 的断言均通过。

### T2: Excel 导入脚本导入 8 个展厅产品

- Result: passed
- Covers: P1-AC2
- Command run: python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py
- Environment proof: 同一 Python 3.12.10 测试会话读取仓库内 tobedeleted/上海展厅展品列表.xlsx，并在 Chromium Playwright 双前端会话中保留真实浏览器证据。
- Evidence refs: test-results/task-4732427cb5/backend-pytest.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-loads-only-th-bf417-cts-for-the-bound-client-id-chromium/trace.zip
- Notes: backend/tests/test_pad_import_script.py 通过，确认 Excel 导入后覆盖 8 个展厅并保留产品字段与排序。

### T3: 当前生效音频切换与获取

- Result: passed
- Covers: P1-AC4
- Command run: python -m pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py
- Environment proof: 在同一后端 pytest 会话验证上传录音、TTS 重生成与当前音频读取逻辑，并在同一仓库的 Chromium Playwright 会话中保留产品音频播放证据。
- Evidence refs: test-results/task-4732427cb5/backend-pytest.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-plays-product-aace9-eeping-the-shared-client-id-chromium/trace.zip
- Notes: backend/tests/test_pad_api_blueprint_unit.py 中 audio_current、upload、regenerate 相关断言通过，确认任一产品始终只返回当前生效音频。

### T4: pad 首页按设备展示本厅产品

- Result: passed
- Covers: P2-AC1
- Command run: cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js e2e/barge-in-flow.spec.js e2e/conversation-auto-submit.spec.js --workers=1 --trace on --output test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial
- Environment proof: Chromium 真实浏览器会话通过 npm run serve:dual:e2e 启动双前端，访问 http://127.0.0.1:4981/ 并使用共享 localStorage.clientId 与 mocked /api/pad/* 数据完成验证。
- Evidence refs: test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2020-serial.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-loads-only-th-bf417-cts-for-the-bound-client-id-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/pad-frontend-loads-only-th-bf417-cts-for-the-bound-client-id-chromium/trace.zip
- Notes: pad-frontend.spec.js 证明默认首页只渲染当前绑定展厅的产品列表，不会泄露其他展厅产品。2026-04-12 在当前仓库状态下做了串行全量 Playwright 复验，场景继续通过。

### T5: pad 产品音频播放与跳转旧前端

- Result: passed
- Covers: P2-AC2; P3-AC2
- Command run: cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js e2e/barge-in-flow.spec.js e2e/conversation-auto-submit.spec.js --workers=1 --trace on --output test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial
- Environment proof: Chromium 在 http://127.0.0.1:4981/ 真实点击产品并导航到 /ragint/?entry=tour，过程中复用同源 localStorage.clientId。
- Evidence refs: test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2020-serial.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-plays-product-aace9-eeping-the-shared-client-id-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/pad-frontend-plays-product-aace9-eeping-the-shared-client-id-chromium/trace.zip
- Notes: 产品点击后会请求当前生效音频，随后通过按钮进入 /ragint/?entry=tour，切换前后共享 clientId 不变。2026-04-12 的串行全量复验再次确认该跳转链路正常。

### T6: pad 离线缓存

- Result: passed
- Covers: P2-AC3
- Command run: cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js e2e/barge-in-flow.spec.js e2e/conversation-auto-submit.spec.js --workers=1 --trace on --output test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial
- Environment proof: Chromium 先在联网状态完成 /api/pad/offline/manifest 同步，再切换离线模式重开首页；同一套 spec 还覆盖了“从未同步过资源”的失败路径。
- Evidence refs: test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2020-serial.log; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-supports-offl-ab71c-ces-after-a-successful-sync-chromium/trace.zip; fronted/test-results/task-4732427cb5-p2p3/pad-frontend-shows-an-expl-8eb30-n-no-successful-sync-exists-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/pad-frontend-supports-offl-ab71c-ces-after-a-successful-sync-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/pad-frontend-shows-an-expl-8eb30-n-no-successful-sync-exists-chromium/trace.zip
- Notes: 成功同步后断网仍可打开 /、显示缓存产品并播放音频；未完成同步时明确显示离线资源未就绪，没有静默降级。2026-04-12 的串行全量复验继续覆盖了在线同步后离线可用与未同步时报错两条路径。

### T7: 双 SPA 部署与旧前端 /ragint 启动

- Result: passed
- Covers: P2-AC4; P3-AC1
- Command run: cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js e2e/barge-in-flow.spec.js e2e/conversation-auto-submit.spec.js --workers=1 --trace on --output test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial
- Environment proof: Chromium 通过 http://127.0.0.1:4981/ 命中新 pad 首页，再访问 http://127.0.0.1:4981/ragint/?entry=tour 验证旧前端子路径与启动参数行为。
- Evidence refs: test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2020-serial.log; fronted/test-results/task-4732427cb5-p2p3/app-shell-ragint-subpath-e-ccb86-return-to-product-explainer-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/app-shell-ragint-subpath-e-ccb86-return-to-product-explainer-chromium/trace.zip
- Notes: / 与 /ragint 均由双前端服务正确托管，?entry=tour 会直接打开旧前端的极简展厅讲解模式。2026-04-12 的串行全量复验再次确认子路径部署与入口参数均正常。

### T8: 旧前端问答回归

- Result: passed
- Covers: P3-AC3
- Command run: cd fronted; npm test -- --runInBand --watch=false --runTestsByPath src/app/AppShell.test.js src/components/HomeActions.test.js src/managers/AskWorkflowManager.test.js; cd fronted; npx playwright test e2e/pad-frontend.spec.js e2e/app-shell.spec.js e2e/business-flows.spec.js e2e/barge-in-flow.spec.js e2e/conversation-auto-submit.spec.js --workers=1 --trace on --output test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial
- Environment proof: Jest 在本地 CRA 测试环境执行 11 条前端单测，Chromium 在双前端 webServer 上执行 20 条 e2e，覆盖旧前端的讲解、问答、ASR 自动提交和错误恢复。
- Evidence refs: test-results/task-4732427cb5/fronted-jest.log; test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2010.log; test-results/task-4732427cb5/fronted-playwright-playback-single.log; test-results/task-4732427cb5/fronted-playwright-e2e-recheck-20260412T2020-serial.log; fronted/test-results/task-4732427cb5-p2p3/business-flows-error-recov-f914f-and-next-ask-still-succeeds-chromium/trace.zip; fronted/test-results/task-4732427cb5-p2p3/business-flows-playback-ar-d0b68-reads-archived-stop-payload-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/business-flows-error-recov-f914f-and-next-ask-still-succeeds-chromium/trace.zip; fronted/test-results/task-4732427cb5-e2e-recheck-20260412T2020-serial/business-flows-playback-ar-d0b68-reads-archived-stop-payload-chromium/trace.zip
- Notes: 既有 11 条 Jest 测试保持通过。2026-04-12 的并行 Playwright 复验中，`playback archive flow` 曾出现一次 context teardown 超时，但业务断言并未先失败；随后对该用例单独复跑通过，并且串行全量 Playwright 复验 20/20 通过。当前可判断旧前端问答与讲解主链路在现仓库状态下可稳定工作，但并行执行时存在一次浏览器清理阶段抖动记录。

## Final Verdict

- Outcome: passed
- Verified acceptance ids: P1-AC1; P1-AC2; P1-AC3; P1-AC4; P2-AC1; P2-AC2; P2-AC3; P2-AC4; P3-AC1; P3-AC2; P3-AC3
- Blocking prerequisites:
- Summary: 后端 pad 产品数据域、Excel 导入、当前生效音频切换链路通过 pytest 验证；新 pad 首页、离线同步、/ragint 子路径托管、双向切换与共享 clientId 通过 Chromium Playwright 验证；旧 RagInt 前端的关键单测保持通过。2026-04-12 在当前仓库状态下追加了一轮 Playwright E2E 复验，其中一次并行执行出现 `playback archive flow` 的 teardown 级瞬时抖动，但该用例单独复跑通过，随后串行全量复验 20/20 通过，因此当前正式结论仍为通过，同时保留该并行清理抖动作为残余观察项。

## Open Issues

- None yet.
