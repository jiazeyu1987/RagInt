from __future__ import annotations

import contextlib
import time
from dataclasses import dataclass
from typing import Iterable

from backend.api.tts_recording import StreamingTtsRecorder


@dataclass(frozen=True)
class TtsStreamContext:
    deps: object
    request_id: str
    client_id: str
    text: str
    app_config: dict
    provider: str
    endpoint: str
    segment_index: int | str | None
    cancel_event: object
    t_received: float
    recording_id: str | None = None
    stop_index: int | None = None


def _fallback_tts_providers(*, primary: str, app_config: dict) -> list[str]:
    primary_norm = str(primary or "").strip().lower()
    tts_cfg = app_config.get("tts") if isinstance(app_config, dict) else {}
    tts_cfg = tts_cfg if isinstance(tts_cfg, dict) else {}

    # Fallback is opt-in: only use explicitly configured chain.
    # Supported config:
    # tts.fallback_chain = {"flash": ["edge"], "modelscope": ["edge"]}
    fallback_chain = tts_cfg.get("fallback_chain")
    if not isinstance(fallback_chain, dict):
        return []
    raw_list = fallback_chain.get(primary_norm)
    if not isinstance(raw_list, list):
        return []

    out: list[str] = []
    for item in raw_list:
        provider = str(item or "").strip().lower()
        if not provider or provider == primary_norm:
            continue
        if provider in out:
            continue
        out.append(provider)
    return out


def _should_skip_provider(*, ctx: TtsStreamContext, provider: str) -> bool:
    svc = getattr(ctx.deps, "tts_service", None)
    if svc is None or not hasattr(svc, "should_skip_provider"):
        return False
    try:
        return bool(svc.should_skip_provider(ctx.request_id, provider))
    except Exception:
        return False


def _mark_provider_failed(*, ctx: TtsStreamContext, provider: str) -> None:
    svc = getattr(ctx.deps, "tts_service", None)
    if svc is None or not hasattr(svc, "mark_provider_failed"):
        return
    try:
        svc.mark_provider_failed(ctx.request_id, provider)
    except Exception:
        return


def generate_streaming_tts_audio(ctx: TtsStreamContext) -> Iterable[bytes]:
    deps = ctx.deps
    recorder = StreamingTtsRecorder(
        recording_store=deps.recording_store,
        logger=deps.logger,
        recording_id=ctx.recording_id,
        stop_index=ctx.stop_index,
        request_id=ctx.request_id,
        segment_index=ctx.segment_index,
        text=ctx.text,
    )
    try:
        deps.logger.info(f"[{ctx.request_id}] tts_stream_start provider={ctx.provider}")
        total_size = 0
        chunk_count = 0
        first_audio_chunk_at = None
        first_emitted = False

        recorder.open()

        attempt_providers = [str(ctx.provider)]
        attempt_providers.extend(_fallback_tts_providers(primary=ctx.provider, app_config=ctx.app_config))
        # Keep order while removing duplicates.
        dedup_attempt_providers: list[str] = []
        for p in attempt_providers:
            p_norm = str(p or "").strip().lower()
            if p_norm and p_norm not in dedup_attempt_providers:
                dedup_attempt_providers.append(p_norm)
        dedup_attempt_providers = [p for p in dedup_attempt_providers if not _should_skip_provider(ctx=ctx, provider=p)]
        if not dedup_attempt_providers:
            dedup_attempt_providers = [str(ctx.provider or "").strip().lower() or "edge"]

        last_err: Exception | None = None
        selected_provider = dedup_attempt_providers[0] if dedup_attempt_providers else str(ctx.provider or "")
        for idx, provider in enumerate(dedup_attempt_providers):
            selected_provider = provider
            per_provider_chunks = 0
            per_provider_bytes = 0
            deps.logger.info(f"[{ctx.request_id}] tts_provider_attempt provider={provider} attempt={idx + 1}")
            try:
                for chunk in deps.tts_service.stream(
                    text=ctx.text,
                    request_id=ctx.request_id,
                    config=ctx.app_config,
                    provider=provider,
                    endpoint=ctx.endpoint,
                    segment_index=ctx.segment_index,
                    cancel_event=ctx.cancel_event,
                ):
                    if ctx.cancel_event.is_set():
                        deps.logger.info(
                            f"[{ctx.request_id}] tts_cancelled_during_stream endpoint={ctx.endpoint} client_id={ctx.client_id} seg={ctx.segment_index}"
                        )
                        deps.event_store.emit(
                            request_id=ctx.request_id,
                            client_id=ctx.client_id,
                            kind="tts",
                            name="tts_cancelled_during_stream",
                            level="info",
                            endpoint=ctx.endpoint,
                            segment_index=ctx.segment_index,
                        )
                        break
                    if not chunk:
                        continue
                    per_provider_chunks += 1
                    per_provider_bytes += len(chunk)
                    chunk_count += 1
                    total_size += len(chunk)
                    recorder.write(chunk)
                    if first_audio_chunk_at is None:
                        first_audio_chunk_at = time.perf_counter()
                        with contextlib.suppress(Exception):
                            deps.ask_timings.set(ctx.request_id, t_tts_first_audio=first_audio_chunk_at)
                        if not first_emitted:
                            first_emitted = True
                            deps.event_store.emit(
                                request_id=ctx.request_id,
                                client_id=ctx.client_id,
                                kind="tts",
                                name="tts_first_audio_chunk",
                                endpoint=ctx.endpoint,
                                segment_index=ctx.segment_index,
                                bytes=len(chunk),
                            )
                        deps.logger.info(
                            f"[{ctx.request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - ctx.t_received:.3f}s bytes={len(chunk)} provider={provider}"
                        )
                        ask_timing = deps.ask_timings.get(ctx.request_id)
                        if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
                            since_submit = first_audio_chunk_at - float(ask_timing["t_submit"])
                            deps.logger.info(f"[{ctx.request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                            if isinstance(ask_timing.get("t_first_tts_segment"), (int, float)):
                                since_first_segment = first_audio_chunk_at - float(ask_timing["t_first_tts_segment"])
                                deps.logger.info(
                                    f"[{ctx.request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                                )
                    yield chunk
                    if chunk_count <= 3:
                        deps.logger.info(f"[{ctx.request_id}] tts_chunk #{chunk_count} bytes={len(chunk)} provider={provider}")
                if ctx.cancel_event.is_set():
                    break
                if per_provider_chunks > 0:
                    break
                _mark_provider_failed(ctx=ctx, provider=provider)
                if idx + 1 < len(dedup_attempt_providers):
                    deps.logger.warning(
                        f"[{ctx.request_id}] tts_provider_empty_output provider={provider} bytes={per_provider_bytes} -> fallback={dedup_attempt_providers[idx + 1]}"
                    )
                    deps.event_store.emit(
                        request_id=ctx.request_id,
                        client_id=ctx.client_id,
                        kind="tts",
                        name="tts_provider_fallback",
                        level="warn",
                        endpoint=ctx.endpoint,
                        segment_index=ctx.segment_index,
                        from_provider=provider,
                        to_provider=dedup_attempt_providers[idx + 1],
                        reason="empty_output",
                    )
                    continue
            except Exception as e:  # noqa: BLE001
                last_err = e
                _mark_provider_failed(ctx=ctx, provider=provider)
                deps.logger.error(f"[{ctx.request_id}] tts_provider_attempt_failed provider={provider} err={e}", exc_info=True)
                if idx + 1 < len(dedup_attempt_providers):
                    deps.event_store.emit(
                        request_id=ctx.request_id,
                        client_id=ctx.client_id,
                        kind="tts",
                        name="tts_provider_fallback",
                        level="warn",
                        endpoint=ctx.endpoint,
                        segment_index=ctx.segment_index,
                        from_provider=provider,
                        to_provider=dedup_attempt_providers[idx + 1],
                        reason="exception",
                        err=str(e),
                    )
                    continue
                raise

        if chunk_count == 0:
            if last_err is not None:
                raise last_err
            raise RuntimeError(f"tts_provider_empty_output:{selected_provider}")

        deps.logger.info(
            f"[{ctx.request_id}] tts_stream_done total_dt={time.perf_counter() - ctx.t_received:.3f}s bytes={total_size} chunks={chunk_count} provider={selected_provider}"
        )
        deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="tts",
            name="tts_stream_done",
            endpoint=ctx.endpoint,
            segment_index=ctx.segment_index,
            bytes=int(total_size),
            chunks=int(chunk_count),
        )
        recorder.finalize()
        return
    except GeneratorExit:
        deps.logger.info(f"[{ctx.request_id}] tts_stream_generator_exit endpoint={ctx.endpoint} (client_disconnect?)")
        deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="tts",
            name="tts_client_disconnect",
            level="warn",
            endpoint=ctx.endpoint,
            segment_index=ctx.segment_index,
        )
        raise
    except Exception as e:  # noqa: BLE001
        deps.logger.error(f"[{ctx.request_id}] tts_stream_exception {e} provider={ctx.provider}", exc_info=True)
        deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="tts",
            name="tts_stream_failed",
            level="error",
            endpoint=ctx.endpoint,
            segment_index=ctx.segment_index,
            err=str(e),
        )
        raise
    finally:
        recorder.cleanup()
