# PRD

- Task ID: `d-projectpackage-mylib-raginttts-20260407T223831`
- Created: `2026-04-07T22:38:31`
- Workspace: `D:\ProjectPackage\RagInt`
- User Request: `将当前系统的语音合成前后端代码提取出来，保存到 D:\ProjectPackage\MyLib\RagIntTTS\ 路径下，并验证准确性。`

## Goal

从当前 `RagInt` 仓库中提取语音合成相关的前端与后端代码，保存到 `D:\ProjectPackage\MyLib\RagIntTTS`，并提供可重复执行的校验方式，证明提取出的代码与源仓库中的当前实现保持一致，没有遗漏关键调用链，也没有在提取过程中被手工改写。

## Scope

- 后端 TTS API 与流式/非流式请求处理链路：
  `backend/api/tts.py`、`backend/api/tts_nonstream.py`、`backend/api/tts_stream_request.py`、`backend/api/tts_streaming.py`、`backend/api/tts_recording.py`
- 后端 TTS 配置与 provider 解析链路：
  `backend/config/tts_resolver.py`、`backend/config/__init__.py`、`backend/config/env.py`、`backend/config/ragflow_app_config.py`
- 后端 TTS service 与 provider 实现链路：
  `backend/services/tts_service.py`、`backend/services/tts/**`、`backend/services/edge_tts_service.py`、`backend/services/sapi_tts.py`、`backend/services/config_utils.py`
- 后端 TTS 所需通用请求/配置依赖：
  `backend/api/request_context.py`、`backend/api/request_validators.py`、`backend/api/ragflow_config_cache.py`
- 前端在线 TTS 播放与调度链路：
  `fronted/src/audio/ttsAudio.js`、`fronted/src/managers/TtsQueueManager.js`、`fronted/src/managers/createTtsManager.js`
- 前端 TTS glue / UI 同步链路：
  `fronted/src/managers/createTtsOnStopIndexChange.js`、`fronted/src/hooks/useTtsUiSync.js`
- 前端仓库内现有的本地/广播式 TTS 实现：
  `fronted/src/managers/LocalSpeechTtsManager.js`、`fronted/src/managers/TtsBroadcastManager.js`
- 与上述模块直接对应的现有单元测试文件
- 目标目录中的提取说明、文件清单、哈希清单和校验脚本

## Non-Goals

- 不提取 ASR、VoiceKit、录音上传、语音问答编排、整页 `AppShell` UI 或整仓业务代码
- 不重构现有 TTS 代码，不修复已有 fallback 逻辑，不改变实现行为
- 不把 `node_modules`、Python 虚拟环境、构建产物、运行缓存、离线音频文件打包进目标目录
- 不承诺把 `D:\ProjectPackage\MyLib\RagIntTTS` 直接做成可独立启动的完整应用；本任务目标是“精确提取当前实现 + 提供校验”

## Preconditions

- 源仓库 `D:\ProjectPackage\RagInt` 可读，且目标目录 `D:\ProjectPackage\MyLib` 可写
- 当前会话可运行 `python`、`pytest`、`npm`
- 前端依赖已在 `D:\ProjectPackage\RagInt\fronted\node_modules` 中可用，以便运行原仓库定向测试
- 目标路径下不存在会阻止创建/覆盖 `RagIntTTS` 的权限或文件锁
- 若任何关键源文件缺失、不可读，或测试工具不可执行，必须停止并记录为阻塞前提

## Impacted Areas

- 源仓库任务工件：
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/*`
- 目标提取目录：
  `D:\ProjectPackage\MyLib\RagIntTTS`
- 后端回归测试：
  `backend/tests/test_tts_*.py`
- 前端回归测试：
  `fronted/src/audio/ttsAudio.test.js`
  `fronted/src/hooks/useTtsUiSync.test.js`
  `fronted/src/managers/*Tts*.test.js`
  `fronted/src/managers/createTtsOnStopIndexChange.test.js`
- 提取准确性验证命令与结果记录

## Phase Plan

### P1: 明确提取边界与验证标准

- Objective:
  基于当前仓库实际入口与导入关系，确认语音合成前后端的精确提取范围、排除项、目标目录结构与验证策略。
- Owned paths:
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/prd.md`
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/test-plan.md`
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/task-state.json`
- Dependencies:
  源仓库 TTS 模块、测试文件、`spec-driven-delivery` 校验脚本
- Deliverables:
  完整 PRD
  完整测试计划
  同步后的阶段状态

### P2: 提取 TTS 前后端代码到目标目录

- Objective:
  将确定范围内的源码与测试文件原样复制到 `D:\ProjectPackage\MyLib\RagIntTTS`，保留相对目录结构，并生成提取说明、清单和哈希信息。
- Owned paths:
  `D:\ProjectPackage\MyLib\RagIntTTS`
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/execution-log.md`
- Dependencies:
  P1 确认的文件范围
  源仓库文件可读
  目标目录可写
- Deliverables:
  提取后的 `backend/**` 与 `fronted/**` 子集
  清单文件
  哈希清单
  校验脚本
  目标目录 README

### P3: 验证提取准确性并记录证据

- Objective:
  通过哈希一致性、结构检查和原仓库定向 TTS 测试，证明提取结果准确对应当前系统实现。
- Owned paths:
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/execution-log.md`
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/test-report.md`
  `doc/tasks/d-projectpackage-mylib-raginttts-20260407T223831/task-state.json`
- Dependencies:
  P2 提取结果
  `python` / `pytest`
  `npm` 与前端现有依赖
- Deliverables:
  哈希校验结果
  后端定向测试结果
  前端定向测试结果
  最终测试报告与完成状态

## Phase Acceptance Criteria

### P1

- P1-AC1: `prd.md` 明确列出提取范围、非目标、前提条件、目标目录和验证策略，且与仓库实际 TTS 结构一致。
- P1-AC2: `test-plan.md` 为每个验收项定义可执行的验证命令或明确的失败条件，不保留模板占位文本。
- Evidence expectation:
  `validate_artifacts.py` 通过，`task-state.json` 已同步出稳定 phase/acceptance id。

### P2

- P2-AC1: `D:\ProjectPackage\MyLib\RagIntTTS` 中包含约定范围内的后端 TTS 源码、前端 TTS 源码及其对应测试文件，且目录结构与源仓库相对路径一致。
- P2-AC2: 所有被提取的源码与测试文件均以“原样复制”方式落地，没有手工改写内容。
- P2-AC3: 目标目录包含至少一个可重复执行的清单/校验资产，用于把目标文件与源文件建立一一对应关系并记录哈希。
- Evidence expectation:
  `execution-log.md` 记录提取脚本、提取文件数、代表性路径、清单位置和哈希校验资产位置。

### P3

- P3-AC1: 目标目录中的每个被提取文件都能在清单中找到唯一对应的源文件，且哈希比对通过。
- P3-AC2: 原仓库中针对 TTS 的后端定向测试通过，证明被提取后端模块对应的是当前可验证实现。
- P3-AC3: 原仓库中针对 TTS 的前端定向测试通过，证明被提取前端模块对应的是当前可验证实现。
- P3-AC4: `test-report.md` 记录每项验证命令、结果、证据位置和最终结论，并明确任何剩余限制。
- Evidence expectation:
  `test-report.md` 中有哈希验证结果、后端测试结果、前端测试结果与最终 verdict。

## Done Definition

- `D:\ProjectPackage\MyLib\RagIntTTS` 已生成并包含约定范围内的 TTS 前后端代码与测试文件
- 目标目录内存在可读取的 README/清单/校验资产，说明提取方法与验证方式
- P1、P2、P3 全部完成，且所有 acceptance id 都有执行证据
- `test_status` 为 `passed`
- `check_completion.py --apply` 成功

## Blocking Conditions

- 关键 TTS 源文件、测试文件或其依赖入口不可读
- 目标目录不可写，无法创建或更新 `D:\ProjectPackage\MyLib\RagIntTTS`
- `python`、`pytest` 或 `npm` 中任一关键工具不可执行，导致无法完成承诺的验证
- 提取后发现无法建立源文件到目标文件的一一映射
- 任何校验命令失败且无法定位到明确原因时，必须停止并报告，不允许以“跳过验证”或“假定一致”收尾
