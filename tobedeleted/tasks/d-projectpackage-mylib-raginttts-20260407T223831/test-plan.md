# Test Plan

- Task ID: `d-projectpackage-mylib-raginttts-20260407T223831`
- Created: `2026-04-07T22:38:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `将当前系统的语音合成前后端代码提取出来，保存到 D:\ProjectPackage\MyLib\RagIntTTS\ 路径下，并验证准确性。`

## Test Scope

验证三类事实：

- 提取范围是否覆盖当前系统中约定的 TTS 前后端代码与对应测试文件
- 目标目录中的提取文件是否与源仓库文件逐一对应且字节一致
- 源仓库中当前 TTS 相关单元测试是否通过，从而证明被提取的是一份可验证的当前实现

以下内容不在本次测试范围内：

- 不验证整站 UI、整页 AppShell 行为或 ASR/VoiceKit 流程
- 不验证目标目录作为独立应用直接启动
- 不执行与 TTS 无关的全量回归

## Environment

- 操作系统：Windows（当前工作目录 `D:\ProjectPackage\RagInt`）
- Python：可执行 `python`
- Python 测试：可执行 `pytest`
- Node/npm：可执行 `npm`
- 前端依赖：`D:\ProjectPackage\RagInt\fronted\node_modules` 已存在
- 目标目录：`D:\ProjectPackage\MyLib\RagIntTTS`

## Accounts and Fixtures

- 不需要账号登录或远端凭证
- 后端测试使用仓库内现有测试替身与 fixture
- 前端测试使用 Jest/jsdom 环境与仓库内现有 mock
- 如 `python`、`pytest`、`npm` 或前端依赖不可用，测试必须立即失败并记录缺失前提

## Commands

- 工件校验  
  `python C:\Users\BJB110\.codex\skills\spec-driven-delivery\scripts\validate_artifacts.py --cwd D:\ProjectPackage\RagInt --task-id d-projectpackage-mylib-raginttts-20260407T223831`  
  期望：退出码 0，且没有模板残留或结构错误

- 提取准确性校验  
  `python D:\ProjectPackage\MyLib\RagIntTTS\tools\verify_extraction.py --source-root D:\ProjectPackage\RagInt --dest-root D:\ProjectPackage\MyLib\RagIntTTS --manifest D:\ProjectPackage\MyLib\RagIntTTS\manifest\extraction-manifest.json`  
  期望：退出码 0，所有文件 `status=matched`

- 后端定向回归  
  `python -m pytest -q backend/tests/test_tts_api_blueprint_unit.py backend/tests/test_tts_nonstream.py backend/tests/test_tts_recording.py backend/tests/test_tts_registry_fallback.py backend/tests/test_tts_resolver.py backend/tests/test_tts_speed_override.py backend/tests/test_tts_stream_request.py backend/tests/test_tts_streaming.py`  
  期望：退出码 0，所有用例通过

- 前端定向回归  
  `npm test -- --watchAll=false --runInBand src/audio/ttsAudio.test.js src/hooks/useTtsUiSync.test.js src/managers/LocalSpeechTtsManager.test.js src/managers/TtsBroadcastManager.test.js src/managers/TtsQueueManager.test.js src/managers/createTtsManager.test.js src/managers/createTtsOnStopIndexChange.test.js`  
  工作目录：`D:\ProjectPackage\RagInt\fronted`  
  期望：退出码 0，所有目标测试文件通过

## Test Cases

### T1: 任务工件结构校验

- Covers: P1-AC1, P1-AC2
- Level: artifact
- Command: `validate_artifacts.py`
- Expected: PRD 与 Test Plan 均无模板占位文本，phase/acceptance/test case id 稳定且覆盖完整

### T2: 提取清单与哈希一一对应

- Covers: P2-AC1, P2-AC2, P2-AC3, P3-AC1
- Level: integration
- Command: `python D:\ProjectPackage\MyLib\RagIntTTS\tools\verify_extraction.py --source-root D:\ProjectPackage\RagInt --dest-root D:\ProjectPackage\MyLib\RagIntTTS --manifest D:\ProjectPackage\MyLib\RagIntTTS\manifest\extraction-manifest.json`
- Expected: 清单中的每个文件都存在于目标目录，且与源文件 SHA256 一致；若有缺失/多余/不匹配则立即失败

### T3: 后端 TTS 定向回归

- Covers: P3-AC2
- Level: unit
- Command: `python -m pytest -q backend/tests/test_tts_api_blueprint_unit.py backend/tests/test_tts_nonstream.py backend/tests/test_tts_recording.py backend/tests/test_tts_registry_fallback.py backend/tests/test_tts_resolver.py backend/tests/test_tts_speed_override.py backend/tests/test_tts_stream_request.py backend/tests/test_tts_streaming.py`
- Expected: 所有后端 TTS 目标测试通过，证明被提取后端模块对应的是当前可验证实现

### T4: 前端 TTS 定向回归

- Covers: P3-AC3
- Level: unit
- Command: `npm test -- --watchAll=false --runInBand src/audio/ttsAudio.test.js src/hooks/useTtsUiSync.test.js src/managers/LocalSpeechTtsManager.test.js src/managers/TtsBroadcastManager.test.js src/managers/TtsQueueManager.test.js src/managers/createTtsManager.test.js src/managers/createTtsOnStopIndexChange.test.js`
- Expected: 所有前端 TTS 目标测试通过，证明被提取前端模块对应的是当前可验证实现

### T5: 证据与结论完整性检查

- Covers: P3-AC4
- Level: manual
- Command: review `execution-log.md` and `test-report.md`
- Expected: 文档中包含命令、结果、证据位置、限制说明和最终 verdict，且与清单/测试输出一致

## Coverage Matrix

| Case ID | Area | Scenario | Level | Acceptance IDs | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | Task artifacts | 校验 PRD 与测试计划结构、覆盖和模板清理 | artifact | P1-AC1, P1-AC2 | `validate_artifacts.py` 输出 |
| T2 | Extraction manifest | 校验源文件与目标文件一一对应且哈希一致 | integration | P2-AC1, P2-AC2, P2-AC3, P3-AC1 | `verify_extraction.py` 输出、manifest 文件 |
| T3 | Backend TTS | 校验后端 TTS API / provider / resolver / streaming 定向测试 | unit | P3-AC2 | `pytest` 输出 |
| T4 | Frontend TTS | 校验前端 TTS manager / audio / UI sync 定向测试 | unit | P3-AC3 | `npm test` 输出 |
| T5 | Reporting | 校验证据记录与最终结论完整性 | manual | P3-AC4 | `execution-log.md`, `test-report.md` |

## Evaluator Independence

- Mode: blind-first-pass
- Validation surface: real-runtime
- Required tools: `python`, `pytest`, `npm`
- First-pass readable artifacts: prd.md, test-plan.md
- Withheld artifacts: execution-log.md, task-state.json
- Real environment expectation: 在真实仓库和真实文件系统上运行命令，不允许使用 mock 提取结果代替目标目录实物
- Escalation rule: 首轮验证先基于任务目标、目标目录和测试命令得出 verdict；只有在需要解释差异时才回看执行日志或状态文件

## Pass / Fail Criteria

- Pass when:
  所有提取文件均在 manifest 中有唯一映射且哈希一致；后端与前端定向 TTS 测试全部通过；报告中有完整证据与限制说明
- Fail when:
  任一提取文件缺失、哈希不一致、目标目录结构错误、关键验证命令失败、或报告缺少能够支持结论的证据

## Regression Scope

- `backend/api/tts*` 与 `backend/services/tts*` 的定向单元测试
- `backend/config/tts_resolver.py` 的速度/voice/provider 解析测试
- `fronted/src/audio/ttsAudio.js` 的音频处理测试
- `fronted/src/managers/*Tts*`、`createTtsOnStopIndexChange.js`、`useTtsUiSync.js` 的定向单元测试

## Reporting Notes

将结果写入 `test-report.md`，至少记录：

- 实际运行的命令
- 每条命令的退出状态与核心结果
- manifest 与校验脚本路径
- 是否存在限制项
- 最终 verdict：`passed` 或 `failed`
