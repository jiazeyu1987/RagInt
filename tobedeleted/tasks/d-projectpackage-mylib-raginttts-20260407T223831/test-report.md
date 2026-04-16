# Test Report

- Task ID: `d-projectpackage-mylib-raginttts-20260407T223831`
- Created: `2026-04-07T22:38:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `将当前系统的语音合成前后端代码提取出来，保存到 D:\ProjectPackage\MyLib\RagIntTTS\ 路径下，并验证准确性。`

## Environment Used

- Evaluation mode: blind-first-pass
- Validation surface: real-runtime
- Tools: python, pytest, npm
- Initial readable artifacts: prd.md, test-plan.md
- Initial withheld artifacts: execution-log.md, task-state.json
- Initial verdict before withheld inspection: yes

## Results

### T1: Artifact structure validation

- Result: passed
- Covers: P1-AC1, P1-AC2
- Command run: `python C:\Users\BJB110\.codex\skills\spec-driven-delivery\scripts\validate_artifacts.py --cwd D:\ProjectPackage\RagInt --task-id d-projectpackage-mylib-raginttts-20260407T223831`
- Environment proof: local workspace `D:\ProjectPackage\RagInt`, task dir `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831`
- Evidence refs: prd.md, test-plan.md
- Notes: validator returned `status: ok` after fixing evaluator-artifact references

### T2: Extraction manifest parity

- Result: passed
- Covers: P2-AC1, P2-AC2, P2-AC3, P3-AC1
- Command run: `python D:\ProjectPackage\MyLib\RagIntTTS\tools\verify_extraction.py --source-root D:\ProjectPackage\RagInt --dest-root D:\ProjectPackage\MyLib\RagIntTTS --manifest D:\ProjectPackage\MyLib\RagIntTTS\manifest\extraction-manifest.json`
- Environment proof: source repo and extraction root both present on the local filesystem
- Evidence refs: `evidence/verify-extraction.json`, `D:\ProjectPackage\MyLib\RagIntTTS\manifest\extraction-manifest.json`
- Notes: summary reported `total_files=52`, `matched_files=52`, `mismatched_files=0`

### T3: Backend TTS targeted regression

- Result: passed
- Covers: P3-AC2
- Command run: `python -m pytest -q backend/tests/test_tts_api_blueprint_unit.py backend/tests/test_tts_nonstream.py backend/tests/test_tts_recording.py backend/tests/test_tts_registry_fallback.py backend/tests/test_tts_resolver.py backend/tests/test_tts_speed_override.py backend/tests/test_tts_stream_request.py backend/tests/test_tts_streaming.py`
- Environment proof: Python local runtime in `D:\ProjectPackage\RagInt`
- Evidence refs: `evidence/backend-tts-pytest.txt`
- Notes: pytest finished `28 passed`; one `RequestsDependencyWarning` was emitted from the Python environment

### T4: Frontend TTS targeted regression

- Result: passed
- Covers: P3-AC3
- Command run: `npm test -- --watchAll=false --runInBand src/audio/ttsAudio.test.js src/hooks/useTtsUiSync.test.js src/managers/LocalSpeechTtsManager.test.js src/managers/TtsBroadcastManager.test.js src/managers/TtsQueueManager.test.js src/managers/createTtsManager.test.js src/managers/createTtsOnStopIndexChange.test.js`
- Environment proof: local frontend workspace `D:\ProjectPackage\RagInt\fronted` with existing `node_modules`
- Evidence refs: `evidence/frontend-tts-jest.txt`
- Notes: Jest finished `7` passing suites and `24` passing tests

### T5: Evidence and conclusion completeness review

- Result: passed
- Covers: P3-AC4
- Command run: review `execution-log.md` and `test-report.md`
- Environment proof: task artifact review in local workspace
- Evidence refs: `execution-log.md#phase-p3`, `evidence/verify-extraction.json`, `evidence/backend-tts-pytest.txt`, `evidence/frontend-tts-jest.txt`
- Notes: execution log, evidence files, and final verdict align on commands, outputs, and residual warning status

## Final Verdict

- Outcome: passed
- Verified acceptance ids: P1-AC1, P1-AC2, P2-AC1, P2-AC2, P2-AC3, P3-AC1, P3-AC2, P3-AC3, P3-AC4
- Blocking prerequisites:
- Summary: Extraction created `D:\ProjectPackage\MyLib\RagIntTTS` with 52 copied source/test/metadata files plus generated README and verification tooling. Manifest parity matched `52/52` files. Backend TTS regression checks passed with `28` tests, frontend TTS regression checks passed with `24` tests. No blocking issues remain.

## Open Issues

- Python environment emitted a `RequestsDependencyWarning` during pytest; this did not cause test failures.
