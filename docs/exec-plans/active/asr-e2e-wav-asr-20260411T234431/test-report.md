# Test Report

- Task ID: `asr-e2e-wav-asr-20260411T234431`
- Created: `2026-04-11T23:44:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `ASR accuracy E2E testing with repository wav fixtures against the real browser and real ASR path`

## Environment Used

- Evaluation mode: blind-first-pass
- Validation surface: real-browser
- Tools: playwright, chromium, node, powershell, python
- Initial readable artifacts: prd.md, test-plan.md
- Initial withheld artifacts: execution-log.md, task-state.json
- Initial verdict before withheld inspection: yes

Record the tester's first-pass visibility honestly. In `blind-first-pass`, the tester should record `yes` only after writing an initial verdict before inspecting withheld artifacts.

## Results

### T1: Fixture manifest and wav fixture integrity

- Result: passed
- Covers: P1-AC1
- Command run: @' const fs = require('fs'); const manifest = require('./fronted/e2e/fixtures/asr-accuracy/manifest'); for (const item of manifest.fixtures) { if (!fs.existsSync(item.audioPath)) throw new Error(`missing_audio:${item.id}:${item.audioPath}`); if (!String(item.expectedText || '').trim()) throw new Error(`missing_expected:${item.id}`); if (!(Number(item.holdMs) > 0)) throw new Error(`missing_hold:${item.id}`); if (!(Number(item.maxFinalWaitMs) > 0)) throw new Error(`missing_timeout:${item.id}`); } console.log(`fixtures_ok:${manifest.fixtures.length}`); '@ | node -
- Environment proof: Workspace D:\ProjectPackage\RagInt; manifest fronted/e2e/fixtures/asr-accuracy/manifest.js resolves to existing repository wav files under backend/data/qa_audio_cache/audio; the same fixture set was later exercised in Chromium with fake microphone playback.
- Evidence refs: fronted/test-results/asr-accuracy/no-answer-short-probe/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png, fronted/test-results/asr-accuracy/no-answer-short-probe/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json
- Notes: Manifest integrity check returned fixtures_ok:3. All three planned fixtures have repository wav paths, expected transcript text, hold duration, and timeout metadata.

### T2: Read-only ASR probe is visible without write injection hooks

- Result: passed
- Covers: P1-AC2
- Command run: cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short --probe-only
- Environment proof: Frontend served at http://127.0.0.1:4981 in Chromium. The page exposed window.__RAGINT_E2E__.getAsrProbeState while emitAsrFinal and setConversationEnabled remained undefined.
- Evidence refs: fronted/test-results/asr-accuracy/no-answer-short-probe/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/no-answer-short-probe/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png
- Notes: Probe-only execution passed and confirmed that the E2E bridge is read-only for ASR state observation.

### T3: Short fixture matches the gold transcript

- Result: passed
- Covers: P2-AC1, P2-AC3
- Command run: Start local backend with python -m backend.app, then run cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture no-answer-short
- Environment proof: Backend http://127.0.0.1:8000 and frontend http://127.0.0.1:4981 were live. Chromium ran with fake media stream parameters and fake audio capture from backend/data/qa_audio_cache/audio/pair_26_1772285795055.wav.
- Evidence refs: fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png
- Notes: The short sample reached a final ASR result and matched the exact normalized gold transcript. This proves the real wav -> fake mic -> real SAUC path can pass end to end on at least one fixture.

### T4: Medium math fixture exact-match accuracy

- Result: failed
- Covers: P2-AC1, P2-AC3
- Command run: Start local backend with python -m backend.app, then run cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture math-2x2
- Environment proof: Same real backend and Chromium fake microphone path as T3, using backend/data/qa_audio_cache/audio/pair_5_1772074812566.wav.
- Evidence refs: fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/math-2x2.png, fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/trace.zip
- Notes: After the follow-up fix, the duplicate transcript assembly issue no longer reproduces for this fixture. The remaining failure is a strict exact-normalized mismatch between Arabic numeral `4` in the observed text and Chinese numeral `四` in the gold text.

### T5: Long domain fixture exact-match accuracy

- Result: failed
- Covers: P2-AC3
- Command run: Start local backend with python -m backend.app, then run cd fronted; node scripts/run_asr_accuracy_e2e.js --fixture coating-domain
- Environment proof: Same real backend and Chromium fake microphone path as T3, using backend/data/qa_audio_cache/audio/pair_32_1772602487561.wav.
- Evidence refs: fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/coating-domain.png, fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/trace.zip
- Notes: After the follow-up fix, the duplicated prefix no longer reproduces for this fixture. The remaining failure is real domain-term recognition drift at the leading term: expected `磷酰胆碱`, observed `林仙妪`.

### T6: Runner fails fast when backend prerequisites are missing

- Result: passed
- Covers: P2-AC2
- Command run: cd fronted; node scripts/run_asr_accuracy_e2e.js --check
- Environment proof: The command was executed with the backend intentionally stopped so that http://127.0.0.1:8000 was unavailable. The runner returned a direct connect ECONNREFUSED error instead of downgrading to text injection or mock ASR.
- Evidence refs: fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png
- Notes: This case validates fail-fast prerequisite handling. The observed failure mode was explicit and did not introduce any fallback path.

### T7: Execution and evidence artifacts form a closed loop

- Result: passed
- Covers: P3-AC1, P3-AC2
- Command run: Manual review of docs/exec-plans/active/asr-e2e-wav-asr-20260411T234431/execution-log.md, this test-report.md, and the referenced browser artifacts under fronted/test-results/asr-accuracy
- Environment proof: Three repository wav fixtures produced real-browser evidence artifacts. Passed browser cases have screenshot and result files, and failed browser cases have screenshot, result, and trace files.
- Evidence refs: fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/no-answer-short/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/no-answer-short.png, fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/math-2x2.png, fronted/test-results/asr-accuracy/math-2x2/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/trace.zip, fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/asr-result.json, fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/coating-domain.png, fronted/test-results/asr-accuracy/coating-domain/asr-accuracy.real-real-asr-18f59-icrophone-and-real-SAUC-ASR-chromium-asr-accuracy/trace.zip
- Notes: The task artifacts and non-task browser evidence are cross-linked and reproducible per fixture.

## Final Verdict

- Outcome: failed
- Verified acceptance ids: P1-AC1, P1-AC2, P2-AC1, P2-AC2, P2-AC3, P3-AC1, P3-AC2
- Blocking prerequisites: none
- Summary: The real wav E2E harness is implemented and reproducible. The browser-side duplicate transcript assembly issue was fixed in the follow-up loop, and the short fixture still passes. The remaining failures are now accuracy-level mismatches only: Arabic digit versus Chinese digit normalization in `math-2x2`, and domain-term recognition drift in `coating-domain`.

## Open Issues

- math-2x2: The duplicate assembly problem is fixed. The unresolved question is whether the acceptance rule should treat Arabic digit `4` and Chinese digit `四` as equivalent for exact-normalized comparison.
- coating-domain: The duplicate prefix is fixed. The unresolved failure is genuine domain-term recognition drift on `磷酰胆碱`.
