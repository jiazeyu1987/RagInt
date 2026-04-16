# Execution Log

- Task ID: `asr-e2e-wav-asr-20260411T234431`
- Created: `2026-04-11T23:44:31`

## Phase Entries

### Phase-P1

- Changed paths: `fronted/e2e/fixtures/asr-accuracy/manifest.js`, `fronted/src/app/AppShell.js`, `fronted/src/app/AppShell.test.js`
- Summary: Added three repository-backed wav fixtures for ASR accuracy validation and expanded the read-only E2E probe in `AppShell` so Playwright can observe final ASR text, input text, and recognition state without text injection hooks.
- Validation run:
  - `@' ... fixtures_ok check ... '@ | node -` -> `fixtures_ok:3`
  - `npm test -- --watchAll=false --runInBand src/app/AppShell.test.js` -> `PASS`
- Acceptance covered: `P1-AC1`, `P1-AC2`
- Evidence refs:
  - `fronted/e2e/fixtures/asr-accuracy/manifest.js`
  - `fronted/src/app/AppShell.js`
  - `fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
- Remaining risk: The probe surface is in place, but real wav accuracy still had to be validated in the browser against the real SAUC path.

### Phase-P2

- Changed paths: `fronted/playwright.asr-accuracy.config.js`, `fronted/e2e/asr-accuracy.real.spec.js`, `fronted/scripts/run_asr_accuracy_e2e.js`
- Summary: Built the real `wav -> fake mic -> SAUC WS` Playwright path, stabilized the press-to-talk automation using pointer events, added `%noloop` fake-mic playback, and fixed deterministic ASR settings for the test run.
- Validation run:
  - `node --check fronted/playwright.asr-accuracy.config.js`
  - `node --check fronted/e2e/asr-accuracy.real.spec.js`
  - `node --check fronted/scripts/run_asr_accuracy_e2e.js`
  - local backend + `node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short` -> `passed`
- Acceptance covered: `P2-AC1`, `P2-AC2`, `P2-AC3`
- Evidence refs:
  - `fronted/playwright.asr-accuracy.config.js`
  - `fronted/e2e/asr-accuracy.real.spec.js`
  - `fronted/scripts/run_asr_accuracy_e2e.js`
  - `fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/trace.zip`
- Remaining risk: The medium and long fixtures could still expose transcript-assembly problems or real SAUC recognition drift.

### Phase-P3

- Changed paths: `docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/execution-log.md`, `docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/test-report.md`
- Summary: Executed fixture integrity checks, fail-fast prerequisite validation, and the initial three-fixture browser run. The short fixture passed; the medium and long fixtures failed under the current exact-normalized comparison rule.
- Validation run:
  - `@' ... fixtures_ok check ... '@ | node -` -> `fixtures_ok:3`
  - `node scripts/run_asr_accuracy_e2e.js --check` with backend stopped -> `connect ECONNREFUSED 127.0.0.1:8000`
  - local backend + `node scripts/run_asr_accuracy_e2e.js` -> `no-answer-short passed`, `math-2x2 failed`, `coating-domain failed`
- Acceptance covered: `P3-AC1`, `P3-AC2`
- Evidence refs:
  - `fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
  - `fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
  - `fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
  - `fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png`
  - `fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/math-2x2.png`
  - `fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/coating-domain.png`
- Remaining risk / blockers:
  - `math-2x2`: initial browser result showed duplicated transcript assembly plus numeric-form mismatch
  - `coating-domain`: initial browser result showed duplicated prefix plus domain-term drift

## Follow-up Loop 2

- Changed paths: `backend/ws/sauc_proxy.py`, `backend/tests/test_sauc_proxy_unit.py`, `fronted/src/voice/AsrRecognitionSession.js`, `fronted/src/managers/RecordingWorkflowManager.js`, `fronted/src/managers/RecordingWorkflowManager.test.js`
- Summary: Diagnosed the failing fixtures against real SAUC upstream packets and confirmed that the upstream service emits cumulative full-text hypotheses without duplicate browser payload text. Updated the `sauc_ws` front-end flow to replace the current transcript on each partial/final update instead of appending every revision as a new segment.
- Validation run:
  - `python -m pytest backend/tests/test_sauc_proxy_unit.py -q` -> `7 passed`
  - `python -m pytest backend/tests/test_speech_api_routes_unit.py -q` -> `5 passed`
  - `npm test -- --watchAll=false --runInBand src/managers/RecordingWorkflowManager.test.js` -> `PASS`
  - `npm test -- --watchAll=false --runInBand src/voice/AsrRecognitionSession.test.js` -> `PASS`
  - direct upstream SAUC diagnostic with `pair_5_1772074812566.wav` -> raw `result.text` grows cumulatively and does not contain duplicate joined utterances
  - `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short` -> `passed`
  - `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture math-2x2` -> `failed` with remaining Arabic-digit vs Chinese-digit mismatch only
  - `cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture coating-domain` -> `failed` with remaining domain-term drift only
- Acceptance covered: `P2-AC1`, `P2-AC2`, `P2-AC3`, `P3-AC1`, `P3-AC2`
- Evidence refs:
  - `fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
  - `fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
  - `fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json`
- Remaining risk / blockers:
  - `math-2x2`: duplicate transcript assembly is fixed, but the fixture still fails strict exact-normalized comparison because the recognized output uses Arabic numeral `4` while the gold text uses Chinese numeral `四`
  - `coating-domain`: duplicate prefix is fixed, but the leading domain term is still recognized as `林仙妪`, which is a real ASR accuracy gap rather than a browser-side accumulation bug

## Outstanding Blockers

- No environment blocker remains. The unresolved gaps are now accuracy-level issues: numeric normalization equivalence for `math-2x2`, and domain-term recognition drift for `coating-domain`.
