# No-Fallback Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the main ask stream's fixed RAGFlow-unavailable fallback response and replace it with explicit fail-fast stream errors.

**Architecture:** Keep the existing `ConversationOrchestrator` flow and replace the fallback branch at the point where chat mode has no resolved RAGFlow session. The new helper emits an error chunk and returns an `AskStreamOutcome` that forbids persistence and cache writes.

**Tech Stack:** Python 3, Flask backend, pytest.

---

## BDD Scenarios

```gherkin
Feature: No-fallback request handling

  Scenario: Chat request stops when the RAGFlow session is missing
    Given the user sends a normal chat request
    And no RAGFlow chat session is available
    When the backend streams the answer
    Then the stream emits a structured `ragflow_session_required` error
    And no fixed fallback answer is returned
    And history and cache writes are not allowed for the failed request

  Scenario: Deleted RAGFlow unavailable fallback is not part of verification
    Given the legacy unavailable fallback test file has been removed
    When a worker verifies the RAGFlow no-fallback slice
    Then the worker runs the current orchestrator stream tests
    And the worker does not attempt to run `backend/tests/test_unavailable_fallback.py`

  Scenario: TTS provider prerequisites fail fast unless fallback is explicit
    Given a TTS request names a provider without its required configuration
    When the backend starts TTS streaming
    Then the request fails with the provider error
    And the backend does not silently switch to Edge, SAPI, ModelScope, or local TTS

  Scenario: Explicit TTS fallback chain remains an operator policy
    Given the operator configures `tts.fallback_chain` for a primary provider
    When that provider fails under the configured trigger
    Then the backend may use only the providers listed in that explicit chain
    And an absent chain means no provider downgrade occurs

  Scenario: QA audio and ASR behavior stays observable
    Given QA audio matching and ASR post-processing are enabled
    When matching or post-processing cannot produce the requested result
    Then classifier rejection is respected without a hidden similarity override
    And operator-facing ASR status text remains readable Simplified Chinese
```

---

## Files

- Modify: `backend/orchestrators/conversation_orchestrator.py`
- Modify: `backend/tests/test_conversation_orchestrator_input_block.py`
- Deleted in completed slice: `backend/tests/test_unavailable_fallback.py`
- Deleted in completed slice: `backend/orchestrators/ragflow_streaming_fallback.py`

## Task 1: Add Fail-Fast Missing Session Coverage

**Files:**
- Modify: `backend/tests/test_conversation_orchestrator_input_block.py`

- [x] **Step 1: Write the failing test**

Add a test that constructs `ConversationOrchestrator`, calls `_stream_with_session()` with `agent_id=""` and `rag_session=None`, drains the generator, and asserts:

```python
def test_stream_with_session_fails_fast_when_chat_session_missing():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._stream_with_session(
        request_id="r1",
        client_id="c1",
        question="普通问题",
        agent_id="",
        question_for_rag="普通问题",
        rag_session=None,
        cancel_event=_Cancel(False),
        t_submit=0.0,
        settings=_settings(),
        apply_qa_constraints=False,
        qa_max_answer_chars=0,
        safety_filter=_Safety(False, None),
        safety_block_msg="blocked",
    )
    yielded, outcome = _drain(gen)

    assert yielded[0]["chunk"] == "RAGFlow 会话不可用，已停止当前请求。"
    assert yielded[0]["error"]["code"] == "ragflow_session_required"
    assert yielded[-1]["done"] is True
    assert yielded[-1]["error"]["code"] == "ragflow_session_required"
    assert outcome.answer == ""
    assert outcome.done_sent is True
    assert outcome.save_allowed is False
    assert outcome.cache_put_allowed is False
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_conversation_orchestrator_input_block.py::test_stream_with_session_fails_fast_when_chat_session_missing -q`

Historical expected result before implementation: fail because the implementation still emitted the fixed fallback answer instead of `ragflow_session_required`. Do not use this as a current verification command after the completed slice.

- [x] **Step 3: Implement minimal fail-fast helper**

In `backend/orchestrators/conversation_orchestrator.py`, remove the fallback import and add a helper:

```python
    def _stream_missing_ragflow_session(self, *, request_id: str, client_id: str):
        error = {
            "code": "ragflow_session_required",
            "message": "RAGFlow 会话不可用，已停止当前请求。",
        }
        self._logger.warning(
            f"[{request_id}] ragflow_session_required client_id={client_id}"
        )
        yield make_chunk(error["message"], error=error)
        yield make_done(error=error)
        return AskStreamOutcome(
            answer="",
            cancelled=False,
            done_sent=True,
            save_allowed=False,
            cache_put_allowed=False,
        )
```

Then change `_stream_with_session()` to call this helper when `not agent_id and not rag_session`.

- [x] **Step 4: Run focused test to verify it passes**

Run: `pytest backend/tests/test_conversation_orchestrator_input_block.py::test_stream_with_session_fails_fast_when_chat_session_missing -q`

Expected: pass.

## Task 2: Remove Legacy Fallback Unit Expectations

**Files:**
- Deleted: `backend/tests/test_unavailable_fallback.py`
- Deleted: `backend/orchestrators/ragflow_streaming_fallback.py`

- [x] **Step 1: Confirm legacy fallback tests are removed**

Do not run `pytest backend/tests/test_unavailable_fallback.py -q`; the file is intentionally deleted and is no longer a verification target.

Expected: `backend/tests/test_unavailable_fallback.py` does not exist, and current verification uses orchestrator fail-fast tests instead.

- [x] **Step 2: Search for remaining fallback imports**

Run: `rg -n "_stream_ragflow_unavailable_fallback|ragflow_streaming_fallback" backend --glob '!backend/data/**' --glob '!**/__pycache__/**'`

Expected: no production caller remains before deletion.

- [x] **Step 3: Delete the legacy test and module if no production imports remain**

Deleted `backend/tests/test_unavailable_fallback.py` and `backend/orchestrators/ragflow_streaming_fallback.py` after the search confirmed no production caller remained.

- [x] **Step 4: Run targeted orchestrator tests**

Run: `pytest backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_ragflow_response.py -q`

Expected: pass.

## Task 3: Update Trace Naming

**Files:**
- Modify: `backend/orchestrators/conversation_orchestrator.py`

- [x] **Step 1: Confirm fail-fast trace labels**

The missing-session trace in `stream_ask()` uses fail-fast naming:

```python
answer_source="ragflow_error" if session_missing else "ragflow_stream",
trace_reason="ragflow_session_required" if session_missing else "main_ask_begin",
```

- [x] **Step 2: Search for stale fallback labels**

Run: `rg -n "ragflow_unavailable_fallback|rag_session_unavailable|using_fallback" backend fronted docs --glob '!backend/data/**' --glob '!fronted/build-ragint/**'`

Expected: no production references remain. Historical docs may be updated in a later documentation slice.

- [x] **Step 3: Run targeted tests**

Run: `pytest backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_ragflow_response.py -q`

Expected: pass.

## Task 4: Remove Adjacent Implicit Downgrades Found In Review

**Files:**
- Modify: `backend/api/tts_streaming.py`
- Modify: `backend/tests/test_tts_streaming.py`
- Modify: `backend/services/qa_audio_matcher.py`
- Modify: `backend/services/qa_audio_pipeline_managers.py`
- Modify: `backend/tests/test_qa_audio_matcher_match.py`
- Modify: `fronted/src/app/useAppShellAsrInput.js`
- Modify: `fronted/src/app/useAppShellAsrInput.test.js`

- [x] Streaming TTS without a selected provider fails fast with `tts_provider_required` and does not implicitly attempt Edge.
- [x] QA audio cache cross-speed search is named as explicit cross-bucket recall, not fallback.
- [x] Classifier `match=false` is not overridden by a secondary similarity branch.
- [x] ASR post-processing status text is readable Simplified Chinese.

Verification:

- `pytest backend/tests/test_tts_streaming.py backend/tests/test_qa_audio_matcher_match.py -q`
- `npm test -- --runTestsByPath src/app/useAppShellAsrInput.test.js src/app/AppShell.test.js src/app/appShellState.test.js --watchAll=false`

## Task 5: Close Remaining Runtime Fallback/Swallow Paths

**Files:**
- Modify: `backend/api/system.py`
- Modify: `backend/api/system_utils.py`
- Modify: `backend/ws/sauc_proxy.py`
- Modify: `backend/tests/test_system_api_blueprint_unit.py`
- Modify: `backend/tests/test_system_utils.py`
- Modify: `backend/tests/test_sauc_proxy_unit.py`
- Modify: `fronted/src/hooks/useAppSettings.js`
- Modify: `fronted/src/hooks/useAppSettings.test.js`
- Modify: `fronted/src/managers/SaucWsRecorderManager.js`
- Modify: `fronted/src/managers/SaucWsRecorderManager.test.js`
- Modify: `fronted/src/managers/TourPipelineManager.js`
- Modify: `fronted/src/managers/TourPipelineManager.test.js`

- [x] `/api/openapi.json` fails fast with `openapi_spec_required` or `openapi_spec_invalid` instead of returning a default document.
- [x] Diagnostics zip records partial collection failures in `diagnostics_errors.json` instead of silently suppressing them.
- [x] Backend SAUC config rejects invalid or out-of-range explicit numeric/boolean values.
- [x] Frontend SAUC recorder rejects invalid explicit numeric/boolean config and invalid explicit base URLs; malformed websocket messages emit `sauc_proxy_message_parse_failed`.
- [x] `useAppSettings` exposes load/save failures via `settingsError` and does not save defaults after a failed load.
- [x] Tour prefetch replay and recording/text enqueue paths surface queue/start failures and do not mark failed prefetches ready.

Verification:

- `pytest backend/tests/test_system_utils.py backend/tests/test_system_api.py backend/tests/test_system_api_blueprint_unit.py backend/tests/test_sauc_proxy_unit.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useAppSettings.test.js src/managers/SaucWsRecorderManager.test.js src/managers/TourPipelineManager.test.js`
- `pytest backend/tests/test_nav_no_fallback.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_app_config.py backend/tests/test_system_utils.py backend/tests/test_system_api.py backend/tests/test_system_events.py backend/tests/test_system_api_blueprint_unit.py backend/tests/test_sauc_proxy_unit.py backend/tests/test_tts_recording.py backend/tests/test_tts_streaming.py backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_ragflow_response.py backend/tests/test_tts_registry_fail_fast.py backend/tests/test_qa_audio_matcher_match.py backend/tests/test_qa_audio_matcher_classifier.py backend/tests/test_qa_audio_shortcuts.py backend/tests/test_qa_audio_cache_store.py backend/tests/test_speech_api_blueprint_unit.py backend/tests/test_speech_api_routes_unit.py backend/tests/test_bootstrap.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/TourController.test.js src/audio/ttsAudio.test.js src/managers/TtsQueueManager.test.js src/managers/TourPipelineManager.test.js src/managers/SaucWsRecorderManager.test.js src/hooks/useAppSettings.test.js src/app/AppShell.test.js src/app/appShellState.test.js src/app/useAppShellAsrInput.test.js src/app/useAppShellUiMode.test.js src/app/useRagflowConnectionState.test.js`
- `npm run build`
- `git diff --check`

## Task 8: Close Offline, TTS Playback, RAGFlow Delete, PAD Catalog, And Stream Suppress Paths

**Files:**
- Modify: `backend/api/offline.py`
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/services/pad_product_store.py`
- Modify: `backend/orchestrators/ragflow_streaming_core.py`
- Modify: `fronted/src/audio/ttsAudio.js`
- Modify related focused tests.

- [x] Offline manifest load requires a valid manifest file; missing, invalid, or unreadable manifests return non-2xx `ok:false` errors without synthetic empty `items`.
- [x] Offline audio requests surface manifest precondition failures instead of translating them into ordinary `not_found`.
- [x] Streaming WebAudio refetch and element playback fallback are disabled by default and require explicit opt-in flags.
- [x] RAGFlow clear-session fails visibly when list/delete upstream payloads report failure and preserves cached session state until deletion succeeds.
- [x] Hall station catalog reads no longer synthesize entries from legacy station config rows when no catalog row exists.
- [x] RAGFlow streaming no longer falls back to non-streaming output on SDK `chunk_id` protocol mismatch.
- [x] RAGFlow streaming exposes timing completion and TTS tail-buffer failures instead of suppressing them; remaining suppress paths are limited to response close and temp-file cleanup.

Verification:

- `npm test -- --runInBand --watchAll=false src/audio/ttsAudio.test.js src/managers/TtsQueueManager.test.js src/managers/TourPipelineManager.test.js`
- `pytest backend/tests/test_ragflow_service.py backend/tests/test_ragflow_chat_manager.py backend/tests/test_offline_api_blueprint_unit.py backend/tests/test_pad_product_store.py -q`
- `pytest backend/tests/test_tts_recording.py backend/tests/test_stream_ragflow_response.py backend/tests/test_stream_ragflow_tail_flush.py -q`

## Task 9: Close Selling Points, Offline Script, RAGFlow JSON, Tour Control, And Telemetry Pseudo-Success Paths

**Files:**
- Modify: `backend/services/offline_script_service.py`
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/api/tour_control.py`
- Modify: `backend/api/speech_telemetry.py`
- Modify: `fronted/src/managers/OfflineScriptPlayer.js`
- Modify: `fronted/src/api/sellingPoints.js`
- Modify: `fronted/src/components/SellingPointsPanel.js`
- Modify related focused tests.

- [x] Backend offline script service requires a real object manifest; missing manifest, invalid root shape, and invalid `items` shape fail instead of becoming an empty script.
- [x] Frontend offline player rejects invalid manifest schema and backend `ok:false` responses, clears playback state on manifest load failure, and preserves real empty scripts as explicit `manifest_empty`.
- [x] RAGFlow low-level API requests treat JSON parse failures as `ok:false` `ragflow_api_response_json_parse_failed`, not text-only success.
- [x] Tour control query parameters reject explicit invalid `since_id` or `limit` instead of silently using defaults.
- [x] Speech telemetry no longer suppresses timing or event store write failures.
- [x] Selling points list requires a stop name and the panel surfaces API/fetch failures instead of rendering them as an empty list.

Verification:

- `pytest backend/tests/test_offline_script_service.py backend/tests/test_offline_api_blueprint_unit.py backend/tests/test_ragflow_service.py backend/tests/test_ragflow_chat_manager.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/OfflineScriptPlayer.test.js`
- `pytest backend/tests/test_speech_telemetry.py backend/tests/test_tour_control_api_blueprint_unit.py backend/tests/test_tour_control_api.py -q`
- `npm test -- --watchAll=false --runTestsByPath src/api/sellingPoints.test.js src/components/SellingPointsPanel.test.js`

## Task 10: Close Store Corruption, History Shape, QA Cache, Breakpoint, And Recording Pseudo-Success Paths

**Files:**
- Modify: `backend/services/app_settings_store.py`
- Modify: `backend/api/app_settings.py`
- Modify: `backend/services/breakpoint_store.py`
- Modify: `backend/api/breakpoint.py`
- Modify: `backend/api/ragflow_tour_history_utils.py`
- Modify: `backend/api/ragflow_tour_history.py`
- Modify: `backend/api/qa_audio_cache.py`
- Modify: `backend/api/recordings.py`
- Modify related focused tests.

- [x] App settings store rejects corrupt or non-object persisted settings JSON; API reports read failure instead of returning defaults.
- [x] Breakpoint store rejects corrupt or non-object state JSON and exposes read/save/delete store failures; true missing state remains a distinct `state:null` success.
- [x] RAGFlow history API requires history store list responses to be lists; invalid store responses no longer become empty history success.
- [x] Tour/config APIs require RAGFlow config to be a dict and require configured tour stops instead of falling back to built-in stops.
- [x] QA audio cache audio endpoint lets dependency/store failures surface as 500 instead of turning them into `not_found`.
- [x] Recording start rejects whitespace-only stops; regenerate distinguishes missing recordings from missing segments; old audio cleanup failures no longer return `ok:true`.

Verification:

- `pytest backend/tests/test_app_settings_store.py backend/tests/test_app_settings_api.py backend/tests/test_breakpoint_store.py backend/tests/test_breakpoint_api.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_tour_history_utils.py backend/tests/test_qa_audio_cache_api_unit.py backend/tests/test_qa_audio_cache_ops_unit.py backend/tests/test_qa_audio_cache_store.py backend/tests/test_ops_blueprint_unit.py -q`
- `pytest backend/tests/test_recordings_api_routes_unit.py backend/tests/test_recordings_api_blueprint_unit.py backend/tests/test_recordings_api_regenerate_failures_unit.py -q`

## Task 11: Close Remaining JSON Corruption And Frontend Empty-List Pseudo-Success Paths

**Files:**
- Modify: `backend/services/config_service.py`
- Modify: `backend/services/ops_store.py`
- Modify: `backend/services/recording_store.py`
- Modify: `backend/services/selling_points_store.py`
- Modify: `backend/services/tour_control_store.py`
- Modify: `fronted/src/hooks/useTourTemplates.js`
- Modify: `fronted/src/components/QaAudioCachePanel.js`
- Modify related focused tests.

- [x] Config service rejects non-object config JSON and no longer skips unreadable backup metadata.
- [x] Ops store rejects malformed or non-object audit payload, device metadata, and device config JSON.
- [x] Recording store rejects corrupt or incorrectly shaped metadata/stops JSON instead of returning empty metadata, zero stop counts, or blank stop names.
- [x] Selling points store rejects corrupt or non-list `tags_json` instead of returning empty tags through an `ok:true` API response.
- [x] Tour control store rejects corrupt or non-object command payload JSON instead of returning `{}` through an `ok:true` API response.
- [x] Frontend tour templates loader surfaces backend failures and invalid response shapes instead of rendering empty templates.
- [x] Frontend QA audio cache panel surfaces backend failures and invalid response shapes instead of rendering empty cache entries.

Verification:

- `pytest backend/tests/test_config_service_no_fallback.py backend/tests/test_nav_no_fallback.py -q`
- `pytest backend/tests/test_speech_recording.py backend/tests/test_recordings_api_blueprint_unit.py backend/tests/test_recordings_api_regenerate_failures_unit.py backend/tests/test_recordings_api_routes_unit.py -q`
- `pytest backend/tests/test_ops_api.py backend/tests/test_ops_blueprint_unit.py backend/tests/test_ops_auth.py backend/tests/test_qa_audio_cache_ops_unit.py -q`
- `pytest backend/tests/test_selling_points_store_and_api.py backend/tests/test_tour_control_store_unit.py backend/tests/test_tour_control_api.py backend/tests/test_tour_control_api_blueprint_unit.py backend/tests/test_tour_control_state_machine.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useTourTemplates.test.js src/components/QaAudioCachePanel.test.js`

## Task 6: Close Final Residual Pseudo-Success Paths

**Files:**
- Modify: `backend/api/ops.py`
- Modify: `backend/api/request_validators.py`
- Modify: `backend/api/speech.py`
- Modify: `backend/services/asr_text_filter.py`
- Modify: `backend/orchestrators/ask_shortcuts.py`
- Modify: `backend/orchestrators/ask_policies.py`
- Modify: `backend/orchestrators/conversation_orchestrator.py`
- Modify: `backend/services/qa_audio_pipeline_managers.py`
- Modify: `fronted/src/hooks/useLocalStorageState.js`
- Modify: `fronted/src/managers/TtsQueueManager.js`
- Modify: `fronted/src/managers/TourPipelineManager.js`
- Modify related focused tests.

- [x] ASR filter invalid model output returns `asr_filter_invalid_response`; no parser API accepts `fallback_text`.
- [x] Ops numeric query parameters use defaults only when absent; explicit invalid or out-of-range values return `invalid_query_parameter`.
- [x] QA text cache and QA audio cache dependency failures are not treated as misses.
- [x] QA audio classifier dependency failures are not treated as no-match.
- [x] Guide selling-point lookup/ranking failures fail fast instead of generating answers without required context.
- [x] Ask finalization exposes history/cache/QA-audio upsert failures instead of suppressing them.
- [x] `useLocalStorageState` keeps missing-key defaults but fails on storage read/write or deserialize errors.
- [x] `TtsQueueManager` rejects invalid configured base URLs and no longer retries hidden playback alternatives after prefetched/recorded/saved WAV playback failures.
- [x] `TourPipelineManager` replays only real prefetched segments; answer text is not used as a synthetic segment fallback.

Verification:

- `pytest backend/tests/test_speech_api_blueprint_unit.py backend/tests/test_speech_api_routes_unit.py backend/tests/test_request_validators.py backend/tests/test_ops_blueprint_unit.py backend/tests/test_ops_api.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useLocalStorageState.test.js src/managers/TtsQueueManager.test.js src/managers/TourPipelineManager.test.js`
- `pytest backend/tests/test_qa_audio_shortcuts.py backend/tests/test_qa_audio_matcher_classifier.py backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_question_prompting.py backend/tests/test_stream_ragflow_response.py -q`
- `pytest backend/tests/test_nav_no_fallback.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_app_config.py backend/tests/test_system_utils.py backend/tests/test_system_api.py backend/tests/test_system_events.py backend/tests/test_system_api_blueprint_unit.py backend/tests/test_sauc_proxy_unit.py backend/tests/test_tts_recording.py backend/tests/test_tts_streaming.py backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_ragflow_response.py backend/tests/test_tts_registry_fail_fast.py backend/tests/test_qa_audio_matcher_match.py backend/tests/test_qa_audio_matcher_classifier.py backend/tests/test_qa_audio_shortcuts.py backend/tests/test_qa_audio_cache_store.py backend/tests/test_speech_api_blueprint_unit.py backend/tests/test_speech_api_routes_unit.py backend/tests/test_bootstrap.py backend/tests/test_question_prompting.py backend/tests/test_request_validators.py backend/tests/test_ops_blueprint_unit.py backend/tests/test_ops_api.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/TourController.test.js src/audio/ttsAudio.test.js src/managers/TtsQueueManager.test.js src/managers/TourPipelineManager.test.js src/managers/SaucWsRecorderManager.test.js src/hooks/useAppSettings.test.js src/hooks/useLocalStorageState.test.js src/app/AppShell.test.js src/app/appShellState.test.js src/app/useAppShellAsrInput.test.js src/app/useAppShellUiMode.test.js src/app/useRagflowConnectionState.test.js`
- `npm run build`
- `git diff --check`

## Task 7: Close Tour, RAGFlow Bootstrap, TTS Resolver, And PAD Pseudo-Success Paths

**Files:**
- Modify: `backend/config/tts_resolver.py`
- Modify: `backend/api/request_context.py`
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/services/tour_planner.py`
- Modify: `backend/api/recordings.py`
- Modify: `backend/services/pad_product_store.py`
- Modify: `backend/api/pad.py`
- Modify: `fronted/src/hooks/useAppSettings.js`
- Modify: `fronted/src/hooks/useTourBootstrap.js`
- Modify: `fronted/src/managers/TourController.js`
- Modify related focused tests.

- [x] TTS resolver no longer injects a default ModelScope/Bailian voice when none is configured; invalid request speed raises `invalid_tts_speed`.
- [x] Request context helpers keep true missing-value defaults but no longer swallow payload/form/header/remote address access failures.
- [x] RAGFlow chat/agent listing fails fast for uninitialized service, invalid credentials, fetch failures, and malformed responses; real empty lists remain valid.
- [x] Persisted app settings fail load with `settingsError` when explicit invalid values are present; missing fields still use product defaults.
- [x] Tour bootstrap reports `/api/tour/meta` or `/api/tour/stops` load failures instead of replacing stops with an empty success state.
- [x] Tour controller recording startup and resume playback failures throw explicit tour errors instead of continuing a new ask.
- [x] Tour planner requires configured route stops or explicit stops; it no longer creates hard-coded default routes for missing configuration.
- [x] Recording finish/rename/delete returns `not_found` for missing recordings instead of `ok: true`.
- [x] PAD station read paths no longer synthesize `station_a`/`station_b` or default station configs; missing configured station returns 404 while creation/upsert paths retain explicit defaults as initial values.

Verification:

- `pytest backend/tests/test_tts_resolver.py backend/tests/test_tts_streaming.py backend/tests/test_tts_api_blueprint_unit.py backend/tests/test_request_context.py backend/tests/test_speech_request.py backend/tests/test_tts_nonstream.py backend/tests/test_tts_stream_request.py backend/tests/test_ragflow_service.py backend/tests/test_ragflow_chat_manager.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useAppSettings.test.js`
- `pytest backend/tests/test_tour_planner.py backend/tests/test_recordings_api_routes_unit.py backend/tests/test_recordings_api_blueprint_unit.py backend/tests/test_recordings_api_regenerate_failures_unit.py backend/tests/test_speech_recording.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useTourBootstrap.test.js src/managers/TourController.test.js`
- `pytest backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py -q`
- `pytest backend/tests/test_nav_no_fallback.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_app_config.py backend/tests/test_system_utils.py backend/tests/test_system_api.py backend/tests/test_system_events.py backend/tests/test_system_api_blueprint_unit.py backend/tests/test_sauc_proxy_unit.py backend/tests/test_tts_recording.py backend/tests/test_tts_streaming.py backend/tests/test_tts_resolver.py backend/tests/test_tts_api_blueprint_unit.py backend/tests/test_tts_nonstream.py backend/tests/test_tts_stream_request.py backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_ragflow_response.py backend/tests/test_tts_registry_fail_fast.py backend/tests/test_qa_audio_matcher_match.py backend/tests/test_qa_audio_matcher_classifier.py backend/tests/test_qa_audio_shortcuts.py backend/tests/test_qa_audio_cache_store.py backend/tests/test_speech_api_blueprint_unit.py backend/tests/test_speech_api_routes_unit.py backend/tests/test_speech_request.py backend/tests/test_request_context.py backend/tests/test_bootstrap.py backend/tests/test_question_prompting.py backend/tests/test_request_validators.py backend/tests/test_ops_blueprint_unit.py backend/tests/test_ops_api.py backend/tests/test_ragflow_service.py backend/tests/test_ragflow_chat_manager.py backend/tests/test_tour_planner.py backend/tests/test_recordings_api_routes_unit.py backend/tests/test_recordings_api_blueprint_unit.py backend/tests/test_recordings_api_regenerate_failures_unit.py backend/tests/test_speech_recording.py backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_pad_import_script.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/TourController.test.js src/hooks/useTourBootstrap.test.js src/audio/ttsAudio.test.js src/managers/TtsQueueManager.test.js src/managers/TourPipelineManager.test.js src/managers/SaucWsRecorderManager.test.js src/hooks/useAppSettings.test.js src/hooks/useLocalStorageState.test.js src/app/AppShell.test.js src/app/appShellState.test.js src/app/useAppShellAsrInput.test.js src/app/useAppShellUiMode.test.js src/app/useRagflowConnectionState.test.js`
- `npm run build`
- `git diff --check`

## Task 12: Close RAGFlow Config And Frontend Bootstrap Empty-State Pseudo-Success Paths

**Files:**
- Modify: `backend/services/ragflow_config_store.py`
- Modify: `backend/api/ragflow_config_cache.py`
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/services/ragflow_agent_service.py`
- Modify: `fronted/src/managers/RagflowChatManager.js`
- Modify: `fronted/src/hooks/useRagflowBootstrap.js`
- Modify: `fronted/src/hooks/useHistoryPanel.js`
- Modify: `fronted/src/hooks/useTourRecordingOptions.js`
- Modify related focused tests.

- [x] Persisted RAGFlow `config_json` rows reject malformed, empty, or non-object JSON instead of becoming `{}`; true missing records remain `None`.
- [x] RAGFlow config cache requires `load_config()` to return a dict and raises explicit type errors for missing or invalid cache payloads.
- [x] RAGFlow service config file reads fail fast on unreadable files, invalid JSON, or non-object JSON; only a genuinely missing optional file remains an empty config.
- [x] RAGFlow agent service rejects non-object config files, malformed SSE JSON, invalid SSE payloads, and empty completion streams.
- [x] Frontend RAGFlow chat/agent bootstrap rejects `ok:false`, non-object payloads, and non-array `chats`/`agents`; failed loads no longer reset existing options to empty arrays.
- [x] Frontend history and tour recording option loaders surface backend `ok:false` and invalid `items` shapes through explicit hook error state.

Verification:

- `pytest backend/tests/test_ragflow_config_store.py backend/tests/test_ragflow_config_cache.py backend/tests/test_ragflow_config_model.py backend/tests/test_ragflow_app_config.py -q`
- `pytest backend/tests/test_ragflow_agent_service.py backend/tests/test_ragflow_service.py backend/tests/test_ragflow_chat_manager.py -q`
- `npm test -- --runInBand --watchAll=false src/hooks/useHistoryPanel.test.js src/hooks/useTourRecordingOptions.test.js`
- `npm test -- --watchAll=false --runInBand src/managers/RagflowChatManager.test.js src/hooks/useRagflowBootstrap.test.js`

## Task 13: Close Workflow, Event Store, And Runtime Config Pseudo-Success Paths

**Files:**
- Modify: `backend/infra/event_store.py`
- Modify: `backend/orchestrators/ragflow_config.py`
- Modify: `backend/tests/test_event_store.py`
- Modify: `backend/tests/test_ragflow_config_model.py`
- Modify: `fronted/src/components/SettingsPanel.js`
- Modify: `fronted/src/components/SettingsPanel.test.js`
- Modify: `fronted/src/managers/AskWorkflowManager.js`
- Modify: `fronted/src/managers/AskWorkflowManager.test.js`
- Modify: `fronted/src/managers/RecordingWorkflowManager.js`
- Modify: `fronted/src/managers/RecordingWorkflowManager.test.js`

- [x] Redis event store write/read failures and corrupt event records are surfaced instead of becoming silent success or empty event lists; real empty event lists remain valid.
- [x] RAGFlow runtime config rejects non-object root/sub-configs and invalid numeric fields instead of reverting to defaults.
- [x] Settings stop prompt schema rejects invalid explicit stop lists and override maps instead of rendering empty prompts.
- [x] Ask workflow stream event failures and streams ending without explicit `done` are exposed as failed asks instead of returning partial answers as success.
- [x] Recording workflow exposes state/input write failures and recorder start/stop failures instead of treating capture as started or stopped.

Verification:

- `python -m pytest backend\tests\test_event_store.py backend\tests\test_system_api_blueprint_unit.py backend\tests\test_system_events.py -q`
- `python -m pytest backend\tests\test_ragflow_config_model.py backend\tests\test_qa_cache.py::test_orchestrator_short_circuits_on_cache_hit -q`
- `npm test -- --runInBand --watchAll=false src/components/SettingsPanel.test.js`
- `npm test -- --runInBand --watchAll=false src/managers/AskWorkflowManager.test.js`
- `npm test -- --runInBand --watchAll=false src/managers/RecordingWorkflowManager.test.js`

## Task 14: Close Config, Cancellation, Template, And Browser State Pseudo-Success Paths

**Files:**
- Modify: `backend/config/env.py`
- Modify: `backend/config/ragflow_app_config.py`
- Modify: `backend/infra/cancellation.py`
- Add/Modify: `backend/tests/test_env_config.py`
- Add/Modify: `backend/tests/test_cancellation_no_fallback.py`
- Modify: `backend/tests/test_ragflow_app_config.py`
- Modify: `fronted/src/app/appShellState.js`
- Modify: `fronted/src/app/appShellState.test.js`
- Modify: `fronted/src/app/useTransientQueueStatus.js`
- Modify: `fronted/src/app/useTransientQueueStatus.test.js`
- Modify: `fronted/src/managers/TourTemplateManager.js`
- Modify: `fronted/src/managers/TourTemplateManager.test.js`
- Modify: `fronted/src/managers/LocalSpeechTtsManager.js`
- Modify: `fronted/src/managers/LocalSpeechTtsManager.test.js`

- [x] Env integer/float/boolean helpers keep defaults only when variables are absent; explicit invalid values fail fast.
- [x] RAGFlow app config rejects invalid numeric/boolean fields and wrong object/list shapes instead of silently reverting to defaults.
- [x] Redis cancellation registry exposes read/write failures, invalid info timestamps, and rate-limit storage failures instead of treating them as not-cancelled or allowed.
- [x] AppShell state exposes localStorage and URL parameter parsing failures; invalid stored UI mode no longer becomes `full`.
- [x] Transient queue status rejects invalid explicit durations instead of relying on browser timer coercion.
- [x] Tour template normalization rejects malformed template and stop schema while keeping a real empty template list valid.
- [x] Local browser speech TTS exposes `getVoices`, `speak`, and `cancel` failures instead of treating them as no-voice, playback success, or cancelled success.

Verification:

- `python -m pytest backend/tests/test_cancellation_no_fallback.py backend/tests/test_request_registry.py backend/tests/test_env_config.py backend/tests/test_ragflow_app_config.py -q`
- `npm test -- --runInBand --watchAll=false src/app/appShellState.test.js src/app/useTransientQueueStatus.test.js`
- `npm test -- --runInBand --watchAll=false src/managers/TourTemplateManager.test.js`
- `npm test -- --runInBand --watchAll=false src/managers/LocalSpeechTtsManager.test.js`

## Task 15: Close TTS, PAD Audio, Run Coordination, Reset, And Safety Config Pseudo-Success Paths

**Files:**
- Modify: `backend/config/tts_resolver.py`
- Modify: `backend/services/pad_product_audio_service.py`
- Modify: `backend/services/safety_filter.py`
- Modify: `backend/tests/test_tts_resolver.py`
- Add/Modify: `backend/tests/test_pad_product_audio_service_no_fallback.py`
- Modify: `backend/tests/test_safety_filter.py`
- Modify: `fronted/src/app/useAppShellReset.js`
- Modify: `fronted/src/app/useAppShellReset.test.js`
- Modify: `fronted/src/app/useAppShellUiMode.js`
- Modify: `fronted/src/app/useAppShellUiMode.test.js`
- Modify: `fronted/src/managers/RunCoordinator.js`
- Modify: `fronted/src/managers/RunCoordinator.test.js`

- [x] TTS request resolution rejects invalid speed, Edge/SAPI base rate, and Bailian speech rate instead of ignoring them or defaulting silently.
- [x] PAD product audio generation rejects invalid sample-rate config and propagates Edge config access failures instead of producing assets with implicit defaults.
- [x] Sensitive-word filter config rejects invalid root, safety section, blacklist, and term shapes instead of becoming disabled or stringifying objects.
- [x] AppShell reset exposes interrupt, tour reset, and TTS stop failures instead of clearing UI state after a failed reset dependency.
- [x] AppShell UI mode exposes localStorage persistence and URL cleanup failures instead of pretending the mode changed cleanly.
- [x] RunCoordinator exposes preprocessing, queued auto-ask/takeover, and tour-command failures instead of falling back to raw ask success.

Verification:

- `python -m pytest backend/tests/test_tts_resolver.py backend/tests/test_pad_product_audio_service_no_fallback.py backend/tests/test_generate_pad_default_tts_script.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_safety_filter.py -q`
- `npm test -- --runInBand --watchAll=false src/app/useAppShellReset.test.js src/app/useAppShellUiMode.test.js src/managers/RunCoordinator.test.js`

## Task 16: Close Env Override, History Metadata, Text Cleaning, And Stop-Index Pseudo-Success Paths

**Files:**
- Modify: `backend/services/env_overrides.py`
- Modify: `backend/api/ragflow_tour_history_utils.py`
- Modify: `backend/orchestrators/text_cleaning.py`
- Modify: `backend/tests/test_env_overrides.py`
- Modify: `backend/tests/test_ragflow_tour_history_utils.py`
- Modify: `backend/tests/test_ragflow_config_model.py`
- Add/Modify: `backend/tests/test_text_cleaning_no_fallback.py`
- Modify: `fronted/src/managers/createTtsOnStopIndexChange.js`
- Modify: `fronted/src/managers/createTtsOnStopIndexChange.test.js`
- Modify: `fronted/src/managers/VoiceInputManager.js`
- Modify: `fronted/src/managers/VoiceInputManager.test.js`

- [x] Env override numeric casts fail fast when explicit env values are invalid instead of writing raw strings into runtime config.
- [x] RAGFlow history query and tour-plan metadata reject invalid limits, override durations, and malformed plan fields instead of defaulting or returning partial name-only metadata.
- [x] Text-cleaning config rejects invalid shapes/numeric fields, and enabled text-cleaning dependency failures are no longer downgraded to disabled cleaning.
- [x] Stop-index TTS prefetch/state/cache update failures are surfaced instead of being swallowed after a route change.
- [x] VoiceInputManager disposal failures are surfaced instead of silently ignoring module cleanup errors.

Verification:

- `python -m pytest backend/tests/test_env_overrides.py backend/tests/test_ragflow_tour_history_utils.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_config_model.py backend/tests/test_text_cleaning_no_fallback.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/createTtsOnStopIndexChange.test.js src/managers/VoiceInputManager.test.js`

## Task 17: Close RAGFlow Service, Chat Mutation, And Selling Points Contract Pseudo-Success Paths

**Files:**
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/tests/test_ragflow_service.py`
- Modify: `fronted/src/managers/RagflowChatManager.js`
- Modify: `fronted/src/managers/RagflowChatManager.test.js`
- Modify: `backend/api/selling_points.py`
- Modify: `backend/services/selling_points_store.py`
- Modify: `backend/tests/test_selling_points_store_and_api.py`

- [x] RAGFlow API non-JSON responses now fail with `ragflow_api_response_json_parse_failed` instead of returning a fabricated payload.
- [x] RAGFlow config DB read/bootstrap failures now surface instead of falling through to file/env config paths.
- [x] Temporary RAGFlow session cleanup failures now surface instead of returning an answer after failed cleanup.
- [x] Frontend RAGFlow chat mutations require a chat name and explicit `{ ok: true }` mutation success.
- [x] Selling points explicit invalid query/upsert fields fail fast instead of silently defaulting `limit`, `n`, `duration_s`, `weight`, `tags`, `level`, or `status`.
- [x] Corrupt persisted selling points tags produce a visible read failure instead of returning `ok: true` with degraded items.

Verification:

- `python -m pytest backend/tests/test_selling_points_store_and_api.py -q`
- `python -m pytest backend/tests/test_selling_points_store_and_api.py backend/tests/test_ragflow_service.py -q`
- `npm test -- --runInBand --watchAll=false src/managers/RagflowChatManager.test.js src/hooks/useRagflowBootstrap.test.js src/app/useRagflowConnectionState.test.js src/app/appShellRagflowModel.test.js`
- `git diff --check`

## Task 18: Close Recordings, Tour, And Request/Ops Contract Pseudo-Success Paths

**Files:**
- Modify: `backend/api/recordings.py`
- Modify: `backend/services/recording_store.py`
- Modify: `backend/api/tour_control.py`
- Modify: `backend/services/tour_control_store.py`
- Modify: `backend/services/tour_planner.py`
- Modify: `backend/api/request_validators.py`
- Modify: `backend/api/speech_request.py`
- Modify: `backend/api/ops.py`
- Modify: `backend/tests/test_recordings_api_blueprint_unit.py`
- Modify: `backend/tests/test_recordings_api_regenerate_failures_unit.py`
- Modify: `backend/tests/test_recordings_api_routes_unit.py`
- Modify: `backend/tests/test_tour_control_api.py`
- Modify: `backend/tests/test_tour_control_api_blueprint_unit.py`
- Modify: `backend/tests/test_tour_control_store_unit.py`
- Modify: `backend/tests/test_tour_planner.py`
- Modify: `backend/tests/test_request_validators.py`
- Modify: `backend/tests/test_speech_request.py`
- Modify: `backend/tests/test_ops_api.py`
- Modify: `backend/tests/test_ops_auth.py`
- Modify: `backend/tests/test_ops_blueprint_unit.py`

- [x] Recordings API and store now fail fast on malformed JSON, missing recordings, bad limits, out-of-range writes, and invalid TTS sample-rate/file-part data instead of defaulting or swallowing errors.
- [x] Tour planner and tour-control store/API now reject malformed route, duration, payload, and timing inputs instead of synthesizing defaults or empty payloads.
- [x] Request validators, speech request parsing, and ops endpoints now reject malformed JSON, non-object payloads, invalid ints/floats/bools, and audit failures instead of turning them into success paths.

Verification:

- `python -m pytest backend/tests/test_request_validators.py backend/tests/test_speech_request.py backend/tests/test_ops_blueprint_unit.py backend/tests/test_ops_api.py backend/tests/test_ops_auth.py backend/tests/test_recordings_api_blueprint_unit.py backend/tests/test_recordings_api_regenerate_failures_unit.py backend/tests/test_recordings_api_routes_unit.py @tourFiles -q`
- `git diff --check`

## Task 19: Close System Events, QA Audio Cache, PAD Store, And Offline Contract Paths

**Files:**
- Modify: `backend/api/system.py`
- Modify: `backend/api/system_utils.py`
- Modify: `backend/tests/test_system_api_blueprint_unit.py`
- Modify: `backend/tests/test_system_utils.py`
- Modify: `backend/services/qa_audio_cache_store.py`
- Modify: `backend/tests/test_qa_audio_cache_store.py`
- Modify: `backend/services/pad_product_store.py`
- Modify: `backend/tests/test_pad_product_store.py`

- [x] System event queries now reject explicit invalid `limit` and `since_ms` instead of reverting to defaults; system/offline tests confirm offline manifest failure contracts remain explicit.
- [x] QA audio cache store rejects invalid `tts_speed`, unsupported audio extensions, unreadable WAV metadata, and failed invalid-audio cleanup instead of converting them to cache miss or success.
- [x] PAD product store path parts and asset cleanup now fail fast for bad ids/paths and cleanup errors instead of relying on fallback path fragments or swallowed delete failures.

Verification:

- `python -m pytest backend/tests/test_system_utils.py backend/tests/test_system_api_blueprint_unit.py -q`
- `python -m pytest backend/tests/test_offline_api_blueprint_unit.py backend/tests/test_offline_script_service.py -q`
- `python -m pytest backend/tests/test_system_utils.py backend/tests/test_system_api_blueprint_unit.py backend/tests/test_offline_api_blueprint_unit.py backend/tests/test_offline_script_service.py backend/tests/test_qa_audio_cache_store.py backend/tests/test_qa_audio_cache_api_unit.py backend/tests/test_qa_audio_cache_ops_unit.py backend/tests/test_pad_product_store.py -q`
- `git diff --check`

## Task 20: Close TTS Provider, QA Audio Matcher, And Frontend JSON Client Pseudo-Success Paths

**Files:**
- Modify: `backend/api/tts_nonstream.py`
- Modify: `backend/api/tts_streaming.py`
- Modify: `backend/services/tts_service.py`
- Modify: `backend/services/tts/providers/local_gpt_sovits.py`
- Modify: `backend/services/qa_audio_matcher.py`
- Modify: `backend/services/qa_audio_pipeline_managers.py`
- Modify: `backend/tests/test_tts_nonstream.py`
- Modify: `backend/tests/test_tts_streaming.py`
- Add/Modify: `backend/tests/test_tts_local_gpt_sovits.py`
- Modify: `backend/tests/test_qa_audio_matcher_audio.py`
- Modify: `backend/tests/test_qa_audio_matcher_classifier.py`
- Modify: `backend/tests/test_qa_audio_matcher_match.py`
- Modify: `backend/tests/test_qa_audio_shortcuts.py`
- Modify: `fronted/src/api/backendClient.js`
- Modify: `fronted/src/api/backendClient.test.js`

- [x] TTS generation failures, empty provider, provider state failures, and local GPT-SoVITS endpoint/empty-output failures now surface instead of succeeding or probing implicit alternatives.
- [x] TTS streaming fallback remains available only through explicit `tts.fallback_chain`; unconfigured provider failures no longer switch provider.
- [x] QA audio matcher distinguishes real no-candidate/no-match from classifier dependency failures and removes similarity fallback after classifier no-match.
- [x] QA audio write pipeline surfaces TTS empty output, invalid sample rate, and store write failures instead of warning and continuing.
- [x] Frontend `fetchJson` rejects non-JSON text responses instead of wrapping them as `{ ok: true }`.

Verification:

- `$ttsFiles = Get-ChildItem -Path .\backend\tests -Filter 'test_tts_*' | ForEach-Object { $_.FullName }; python -m pytest @ttsFiles backend/tests/test_qa_audio_matcher_audio.py backend/tests/test_qa_audio_matcher_classifier.py backend/tests/test_qa_audio_matcher_match.py backend/tests/test_qa_audio_shortcuts.py -q`
- `npm test -- --runInBand --watchAll=false src/api/backendClient.test.js`
- `git diff --check`

## Task 21: Close History Cache, Speech Stream, RAGFlow Chunk, And Frontend API Wrapper Pseudo-Success Paths

**Files:**
- Modify: `backend/services/history_store.py`
- Modify: `backend/tests/test_qa_cache.py`
- Modify: `backend/api/speech.py`
- Modify: `backend/api/speech_pipeline.py`
- Modify: `backend/tests/test_speech_api_routes_unit.py`
- Modify: `backend/tests/test_speech_pipeline.py`
- Modify: `backend/orchestrators/ragflow_streaming_helpers.py`
- Modify: `backend/orchestrators/stream_payloads.py`
- Modify: `backend/tests/test_stream_helpers.py`
- Modify: `backend/tests/test_stream_ragflow_response.py`
- Modify: `fronted/src/api/tourCommand.js`
- Modify: `fronted/src/api/tourCommand.test.js`
- Modify: `fronted/src/api/tourControl.js`
- Modify: `fronted/src/api/tourControl.test.js`
- Modify: `fronted/src/api/sellingPoints.js`
- Modify: `fronted/src/api/sellingPoints.test.js`

- [x] History cache persisted rows now validate non-empty `answer` and integer `expires_at_ms`; corrupted rows and storage read failures surface instead of becoming cache miss or unexpired success.
- [x] Speech `/api/ask` streaming failures now record `ask_stream_failed` and re-raise the original exception; SAUC dependency inspection and payload summary logging failures surface explicitly.
- [x] RAGFlow streaming chunk/schema parsing now fails fast on missing, `None`, or unknown text schemas while preserving true empty output as observable no-output.
- [x] Frontend tour command/control and selling-point API wrappers reject invalid text, stops, payload, limit, weight, and tags before issuing backend requests.

Verification:

- `python -m pytest backend/tests/test_qa_cache.py backend/tests/test_conversation_orchestrator_input_block.py backend/tests/test_stream_helpers.py backend/tests/test_stream_ragflow_response.py backend/tests/test_stream_ragflow_tail_flush.py @speechFiles -q` (`77 passed, 1 warning`)
- `npm test -- --runInBand --watchAll=false src/api/tourCommand.test.js src/api/tourControl.test.js src/api/sellingPoints.test.js` (`3 suites passed, 11 tests passed`)
- `git diff --check`

## Task 22: Close RAGFlow Service/API And Frontend Playback Manager Pseudo-Success Paths

**Files:**
- Modify: `backend/services/ragflow_service.py`
- Modify: `backend/services/ragflow_agent_service.py`
- Modify: `backend/api/ragflow_config_cache.py`
- Modify: `backend/api/ragflow_tour_history.py`
- Modify: `backend/api/ragflow_tour_history_utils.py`
- Modify: `backend/tests/test_ragflow_service.py`
- Modify: `backend/tests/test_ragflow_config_cache.py`
- Modify: `backend/tests/test_ragflow_tour_history_api_blueprint_unit.py`
- Modify: `backend/tests/test_ragflow_tour_history_utils.py`
- Modify: `fronted/src/managers/AskWorkflowManager.js`
- Modify: `fronted/src/managers/AskWorkflowManager.test.js`
- Modify: `fronted/src/managers/TtsQueueManager.js`
- Modify: `fronted/src/managers/TtsQueueManager.test.js`
- Modify: `fronted/src/hooks/useTourRecordings.js`
- Modify: `fronted/src/hooks/useTourRecordings.test.js`
- Modify: `fronted/src/hooks/useStagePanelProps.js`
- Modify: `fronted/src/hooks/useStagePanelProps.test.js`

- [x] RAGFlow service and agent config paths now surface invalid SDK response shapes, missing `base_url`, invalid API key, failed JSON parsing, and config-file stat/read errors instead of returning empty lists or localhost defaults.
- [x] RAGFlow tour/history APIs now reject invalid JSON bodies, explicit bad history limits, invalid tour-plan duration overrides, invalid config payloads, and non-list history store results instead of using `{}`, default limits, fallback stops, or empty histories.
- [x] Frontend recorded-tour playback now rejects bad recording schemas and missing TTS playback dependencies instead of treating bad `chunks/segments` or missing enqueue/runner hooks as empty success.
- [x] TTS queue now propagates generator, prefetch, and playback decode failures through `waitForIdle()` instead of falling back to streaming/audio-element playback or resolving idle successfully.
- [x] Frontend recording archive and stage command hooks now reject missing recording ids/stops, refresh dependency failures, and tour-control command failures instead of returning empty/null or updating success UI state.

Verification:

- `python -m pytest backend/tests/test_ragflow_service.py backend/tests/test_ragflow_agent_service.py backend/tests/test_ragflow_config_cache.py backend/tests/test_ragflow_tour_history_api_blueprint_unit.py backend/tests/test_ragflow_tour_history_utils.py -q` (`74 passed`)
- `npm test -- --runInBand --watchAll=false src/managers/TtsQueueManager.test.js src/managers/AskWorkflowManager.test.js src/managers/RagflowChatManager.test.js src/hooks/useTourRecordings.test.js src/hooks/useStagePanelProps.test.js` (`5 suites passed, 32 tests passed`)
- `git diff --check`

## Task 23: Close PAD Media Naming, Runtime Config, TTS Audio, And Backend Polling Pseudo-Success Paths

**Files:**
- Modify: `backend/services/pad_product_image_service.py`
- Modify: `backend/services/pad_hall_scene_service.py`
- Modify: `backend/services/pad_hall_station_service.py`
- Modify: `backend/tests/test_pad_image_services_no_fallback.py`
- Modify: `backend/tests/test_pad_api_blueprint_unit.py`
- Modify: `backend/orchestrators/ragflow_config.py`
- Modify: `backend/orchestrators/text_cleaning.py`
- Modify: `backend/services/edge_tts_service.py`
- Modify: `backend/services/config_service.py`
- Modify: `backend/config/ragflow_app_config.py`
- Modify: `backend/tests/test_ragflow_config_model.py`
- Modify: `backend/tests/test_ragflow_app_config.py`
- Modify: `backend/tests/test_config_service_no_fallback.py`
- Modify: `backend/tests/test_edge_tts_service_no_fallback.py`
- Modify: `fronted/src/audio/ttsAudio.js`
- Modify: `fronted/src/audio/ttsAudio.test.js`
- Modify: `fronted/src/managers/TtsQueueManager.js`
- Modify: `fronted/src/managers/TtsQueueManager.test.js`
- Modify: `fronted/src/hooks/useBackendEvents.js`
- Modify: `fronted/src/hooks/useBackendEvents.test.js`
- Modify: `fronted/src/hooks/useBackendStatus.js`
- Modify: `fronted/src/hooks/useBackendStatus.test.js`

- [x] PAD image upload paths now reject empty/invalid product, scene, and station ids and unsupported image bytes instead of falling back to generic file parts, request MIME type, uploaded extension, or `.bin`.
- [x] Runtime config parsing now rejects explicit bad `qa_cache`, `qa_audio_cache`, text-cleaning, Edge TTS, and config-service numeric fields instead of defaulting, clamping, or warning through import.
- [x] Frontend TTS audio playback now rejects WebAudio, `decodeAudioData`, invalid WAV, and missing `AudioContext` failures instead of refetching, retrying default contexts, or falling through to `<audio>`.
- [x] Backend polling hooks now reject invalid status/events response schemas instead of converting null or malformed payloads into empty state.
- [x] PAD API tests now close `send_file` responses before replacing/deleting files so Windows file-lock failures stay meaningful fail-fast signals rather than test fixture noise.

Verification:

- `python -m pytest backend/tests/test_pad_image_services_no_fallback.py backend/tests/test_pad_product_store.py backend/tests/test_pad_api_blueprint_unit.py backend/tests/test_ragflow_config_model.py backend/tests/test_ragflow_app_config.py backend/tests/test_config_service_no_fallback.py backend/tests/test_text_cleaning_no_fallback.py backend/tests/test_edge_tts_service_no_fallback.py -q` (`76 passed`)
- `npm test -- --runInBand --watchAll=false src/audio/ttsAudio.test.js src/managers/TtsQueueManager.test.js src/hooks/useBackendEvents.test.js src/hooks/useBackendStatus.test.js` (`4 suites passed, 32 tests passed`)
- `git diff --check`
