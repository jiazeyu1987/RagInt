# No-Fallback Refactor Design

## Goal

Align the codebase with the repository policy: missing required runtime prerequisites must fail clearly instead of returning mock, fixed, or downgraded success responses.

## Scope

This refactor proceeds in small verified slices. The first slice removes the RAGFlow-unavailable fixed-answer path from the main ask stream.

In scope for slice 1:

- `ConversationOrchestrator` must not call a RAGFlow unavailable fallback when no chat session exists.
- The stream must emit a structured error payload that makes the missing precondition visible.
- The request outcome must prevent history writes, text cache writes, and QA audio cache writes.
- Tests must cover the fail-fast behavior.

Out of scope for slice 1:

- Large `AppShell.js` or `backend/api/pad.py` decomposition.

## BDD Scenarios

```gherkin
Feature: Explicit prerequisite failures

  Scenario: Missing RAGFlow chat session is visible to the client
    Given the user starts a normal chat request
    And no RAGFlow chat session can be resolved
    When the backend streams the response
    Then the client receives a `ragflow_session_required` error payload
    And the stream finishes without returning a fixed fallback answer
    And the failed response is not saved to history or caches

  Scenario: TTS provider selection does not silently downgrade
    Given the user requests streaming TTS with a selected provider
    And that provider is missing required configuration
    When the backend starts the TTS stream
    Then the provider failure is surfaced
    And no unconfigured provider is attempted as a replacement

  Scenario: Explicit TTS fallback chain is treated as configuration, not implicit fallback
    Given an operator has configured `tts.fallback_chain`
    When the configured primary provider fails under that policy
    Then the backend may attempt only the explicitly listed chain providers
    And requests without `tts.fallback_chain` continue to fail fast

  Scenario: QA audio matching preserves classifier rejection
    Given the QA audio matcher returns `match=false`
    When the backend evaluates recall candidates
    Then the request is not converted to success by a hidden lower-threshold similarity branch
```

## Architecture

The main ask flow keeps its current orchestration shape. A new small helper in `ConversationOrchestrator` handles the missing RAGFlow session case and returns an `AskStreamOutcome` with `save_allowed=False` and `cache_put_allowed=False`.

This avoids adding a new abstraction. It replaces one implicit success path with an explicit failure path at the same decision point.

## Data Flow

When `stream_ask()` resolves no `rag_session` for chat mode:

1. Emit trace metadata with `answer_source="ragflow_error"` and `trace_reason="ragflow_session_required"`.
2. Emit one chunk with an `error` object:
   - `code="ragflow_session_required"`
   - `message="RAGFlow 会话不可用，已停止当前请求。"`
3. Emit a done payload with the same error object.
4. Return `AskStreamOutcome(answer="", done_sent=True, save_allowed=False, cache_put_allowed=False)`.

Agent mode remains unchanged because it streams through the agent service path.

## Error Handling

The missing session is treated as a required precondition failure. The system does not substitute a fixed answer, does not pretend the request succeeded, and does not write derived artifacts.

The error is still delivered through the existing SSE payload format so current frontend stream consumers can display the failure without a transport-level crash.

`tts.fallback_chain` remains an explicit operator configuration strategy. It is not an implicit downgrade path: only configured chain entries may be attempted, and missing configuration must still fail fast.

## Testing

Add a focused backend unit test for `_stream_with_session()`:

- missing chat session emits an error chunk and done payload;
- returned outcome disables save/cache writes;
- no fallback answer text is produced.

Update or remove legacy tests that assert fixed fallback-answer behavior after the new fail-fast test is in place.

## Follow-Up Slices

After slice 1 passes, continue with:

1. TTS provider fallback review and removal where not explicitly configured.
2. VoiceKit missing dependency startup behavior.
3. ASR text-filter fallback behavior.
4. Documentation and tech-debt tracker cleanup.
5. Structural decomposition of oversized files once behavior cleanup is stable.

## Slice 2 Notes

The current refactor expanded after review to cover adjacent no-fallback paths:

- streaming TTS requests with no resolved provider fail with `tts_provider_required` instead of implicitly trying Edge;
- configured `tts.fallback_chain` remains the explicit policy for any permitted TTS provider chain;
- QA audio cache cross-speed lookup is retained as an explicit cross-bucket recall strategy, while classifier `match=false` is no longer overridden by a lower-threshold similarity branch;
- ASR post-processing operator status text is restored to readable Simplified Chinese instead of mojibake.
