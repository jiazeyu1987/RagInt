from __future__ import annotations

import contextlib
import copy
import os
import time
import uuid
from pathlib import Path

from flask import Blueprint, Response, jsonify, request

from backend.services.config_utils import get_nested
from backend.api.request_context import get_client_id, get_request_id


def _get_nested(config: dict, path: list, default=None):
    return get_nested(config, path, default)


def _apply_tts_overrides(app_config: dict, *, provider: str, data: dict) -> dict:
    """
    Per-request overrides (do not mutate cached config dict from RagflowService).

    Supported:
    - tts_voice: override `tts.bailian.voice` when provider is modelscope/bailian/dashscope/flash.
    - tts_model: override `tts.bailian.model` when provider is modelscope/bailian/dashscope/flash.
    """
    cfg = app_config
    provider_norm = str(provider or "").strip().lower()
    tts_voice = ""
    tts_model = ""
    try:
        tts_voice = str((data or {}).get("tts_voice") or "").strip()
    except Exception:
        tts_voice = ""

    try:
        tts_model = str((data or {}).get("tts_model") or "").strip()
    except Exception:
        tts_model = ""

    # Provider-specific preset: "flash" means use cosyvoice-v3-flash with a reasonable default system voice.
    if provider_norm == "flash":
        if not tts_model:
            tts_model = "cosyvoice-v3-flash"
        if not tts_voice:
            tts_voice = "longanyang"

    if not tts_voice and not tts_model:
        return cfg
    if provider_norm not in ("modelscope", "bailian", "dashscope", "flash"):
        return cfg

    cfg = copy.deepcopy(app_config or {})
    if not isinstance(cfg, dict):
        cfg = {}
    if not isinstance(cfg.get("tts"), dict):
        cfg["tts"] = {}
    if not isinstance(cfg["tts"].get("bailian"), dict):
        cfg["tts"]["bailian"] = {}
    if tts_voice:
        cfg["tts"]["bailian"]["voice"] = tts_voice
    if tts_model:
        cfg["tts"]["bailian"]["model"] = tts_model
    return cfg


def create_blueprint(deps):
    bp = Blueprint("tts_api", __name__)

    @bp.route("/api/text_to_speech", methods=["POST"])
    def text_to_speech():
        deps.logger.info("收到TTS请求")
        data = request.get_json()
        deps.logger.info(f"TTS请求数据: {data}")

        if not data or not data.get("text"):
            deps.logger.error("TTS请求缺少文本")
            return jsonify({"error": "No text"}), 400

        text = data.get("text", "")
        request_id = get_request_id(request, data=data, prefix="tts")
        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="tts",
            name="tts_request_received",
            endpoint="/api/text_to_speech",
            chars=len(text or ""),
            segment_index=data.get("segment_index", None),
        )
        cancel_event = deps.request_registry.get_cancel_event(request_id)
        if cancel_event.is_set():
            deps.logger.info(f"[{request_id}] tts_cancelled_before_start endpoint=/api/text_to_speech client_id={client_id}")
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_cancelled_before_start",
                level="info",
                endpoint="/api/text_to_speech",
            )
            app_cfg = deps.ragflow_service.load_config() or {}
            return Response(b"", status=204, mimetype=_get_nested(app_cfg, ["tts", "mimetype"], "audio/wav"))

        deps.logger.info(f"[{request_id}] tts_request_received endpoint=/api/text_to_speech chars={len(text)} preview={text[:60]!r}")

        app_config = deps.ragflow_service.load_config() or {}
        provider = data.get("tts_provider") or request.headers.get("X-TTS-Provider") or _get_nested(app_config, ["tts", "provider"], "modelscope")
        with contextlib.suppress(Exception):
            if request.headers.get("X-TTS-Voice") and not data.get("tts_voice"):
                data["tts_voice"] = request.headers.get("X-TTS-Voice")
        app_config = _apply_tts_overrides(app_config, provider=str(provider), data=data or {})
        deps.tts_service.tts_state_update(
            request_id,
            data.get("segment_index", None),
            provider=str(provider),
            endpoint="/api/text_to_speech",
        )
        deps.logger.info(
            f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')}"
        )

        def generate_audio():
            try:
                deps.logger.info(f"[{request_id}] 开始TTS音频生成 provider={provider}")
                yield from deps.tts_service.stream(
                    text=text,
                    request_id=request_id,
                    config=app_config,
                    provider=provider,
                    endpoint="/api/text_to_speech",
                    segment_index=data.get("segment_index", None),
                    cancel_event=cancel_event,
                )
            except GeneratorExit:
                deps.logger.info(f"[{request_id}] tts_generator_exit endpoint=/api/text_to_speech (client_disconnect?)")
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="tts",
                    name="tts_client_disconnect",
                    level="warn",
                    endpoint="/api/text_to_speech",
                )
                raise
            except Exception as e:
                deps.logger.error(f"[{request_id}] TTS音频生成异常: {e}", exc_info=True)
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="tts",
                    name="tts_failed",
                    level="error",
                    endpoint="/api/text_to_speech",
                    err=str(e),
                )

        return Response(
            generate_audio(),
            mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @bp.route("/api/text_to_speech_stream", methods=["GET", "POST"])
    @bp.route("/api/text_to_speech_saved", methods=["GET", "POST"])
    def text_to_speech_stream():
        t_received = time.perf_counter()
        deps.logger.info("收到流式TTS请求")
        if request.method == "GET":
            data = dict(request.args) if request.args else {}
            deps.logger.info(f"流式TTS请求数据(GET): {data}")
        else:
            data = request.get_json()
            deps.logger.info(f"流式TTS请求数据(POST): {data}")

        if not data or not data.get("text"):
            deps.logger.error("流式TTS请求缺少文本")
            return jsonify({"error": "No text"}), 400

        text = data.get("text", "")
        request_id = get_request_id(request, data=data, prefix="tts")
        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="tts",
            name="tts_request_received",
            endpoint="/api/text_to_speech_stream",
            method=request.method,
            chars=len(text or ""),
            segment_index=data.get("segment_index", None),
        )
        cancel_event = deps.request_registry.get_cancel_event(request_id)
        segment_index = data.get("segment_index", None)
        deps.logger.info(
            f"[{request_id}] tts_request_received endpoint=/api/text_to_speech_stream method={request.method} chars={len(text)} seg={segment_index} preview={text[:60]!r}"
        )
        if cancel_event.is_set():
            deps.logger.info(
                f"[{request_id}] tts_cancelled_before_start endpoint=/api/text_to_speech_stream client_id={client_id} seg={segment_index}"
            )
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_cancelled_before_start",
                level="info",
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
            )
            app_cfg = deps.ragflow_service.load_config() or {}
            return Response(b"", status=204, mimetype=_get_nested(app_cfg, ["tts", "mimetype"], "audio/wav"))

        ask_timing = deps.ask_timings.get(request_id)
        if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
            dt_since_submit = time.perf_counter() - float(ask_timing["t_submit"])
            deps.logger.info(f"[{request_id}] tts_request_received_since_submit dt={dt_since_submit:.3f}s")

        app_config = deps.ragflow_service.load_config() or {}
        provider = data.get("tts_provider") or request.headers.get("X-TTS-Provider") or _get_nested(app_config, ["tts", "provider"], "modelscope")
        with contextlib.suppress(Exception):
            if request.headers.get("X-TTS-Voice") and not data.get("tts_voice"):
                data["tts_voice"] = request.headers.get("X-TTS-Voice")
        app_config = _apply_tts_overrides(app_config, provider=str(provider), data=data or {})
        deps.tts_service.tts_state_update(
            request_id,
            segment_index,
            provider=str(provider),
            endpoint="/api/text_to_speech_stream",
        )
        deps.logger.info(
            f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')} remote={request.remote_addr} ua={(request.headers.get('User-Agent') or '')[:60]!r}"
        )

        recording_id = str((data.get("recording_id") or request.headers.get("X-Recording-ID") or "")).strip() or None
        stop_index_arg = data.get("stop_index", None)
        try:
            stop_index_arg = int(stop_index_arg) if stop_index_arg is not None and str(stop_index_arg).strip() != "" else None
        except Exception:
            stop_index_arg = None

        def generate_streaming_audio():
            audio_file = None
            tmp_path = None
            final_rel = None
            try:
                deps.logger.info(f"[{request_id}] 开始流式TTS音频生成 provider={provider}")

                total_size = 0
                chunk_count = 0
                first_audio_chunk_at = None
                first_emitted = False

                if recording_id and stop_index_arg is not None:
                    try:
                        audio_dir = deps.recording_store.audio_dir(recording_id)
                        seg_name = f"{request_id}_{segment_index if segment_index is not None else 'x'}.wav"
                        final_rel = seg_name
                        tmp_path = (audio_dir / f"{seg_name}.part").resolve()
                        audio_file = open(tmp_path, "wb")
                    except Exception as e:
                        deps.logger.warning(f"[REC] tts_open_failed recording_id={recording_id} err={e}")
                        audio_file = None
                        tmp_path = None
                        final_rel = None

                for chunk in deps.tts_service.stream(
                    text=text,
                    request_id=request_id,
                    config=app_config,
                    provider=provider,
                    endpoint="/api/text_to_speech_stream",
                    segment_index=segment_index,
                    cancel_event=cancel_event,
                ):
                    if cancel_event.is_set():
                        deps.logger.info(
                            f"[{request_id}] tts_cancelled_during_stream endpoint=/api/text_to_speech_stream client_id={client_id} seg={segment_index}"
                        )
                        deps.event_store.emit(
                            request_id=request_id,
                            client_id=client_id,
                            kind="tts",
                            name="tts_cancelled_during_stream",
                            level="info",
                            endpoint="/api/text_to_speech_stream",
                            segment_index=segment_index,
                        )
                        break
                    if not chunk:
                        continue
                    chunk_count += 1
                    total_size += len(chunk)
                    if audio_file is not None:
                        try:
                            audio_file.write(chunk)
                        except Exception:
                            audio_file = None
                    if first_audio_chunk_at is None:
                        first_audio_chunk_at = time.perf_counter()
                        with contextlib.suppress(Exception):
                            deps.ask_timings.set(request_id, t_tts_first_audio=first_audio_chunk_at)
                        if not first_emitted:
                            first_emitted = True
                            deps.event_store.emit(
                                request_id=request_id,
                                client_id=client_id,
                                kind="tts",
                                name="tts_first_audio_chunk",
                                endpoint="/api/text_to_speech_stream",
                                segment_index=segment_index,
                                bytes=len(chunk),
                            )
                        deps.logger.info(f"[{request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - t_received:.3f}s bytes={len(chunk)}")
                        ask_timing = deps.ask_timings.get(request_id)
                        if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
                            since_submit = first_audio_chunk_at - float(ask_timing["t_submit"])
                            deps.logger.info(f"[{request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                            if isinstance(ask_timing.get("t_first_tts_segment"), (int, float)):
                                since_first_segment = first_audio_chunk_at - float(ask_timing["t_first_tts_segment"])
                                deps.logger.info(
                                    f"[{request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                                )
                    yield chunk

                    if chunk_count <= 3:
                        deps.logger.info(f"[{request_id}] 流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

                deps.logger.info(
                    f"[{request_id}] 流式TTS音频生成完成 total_dt={time.perf_counter() - t_received:.3f}s 总大小: {total_size} bytes, chunk数量: {chunk_count}"
                )
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="tts",
                    name="tts_stream_done",
                    endpoint="/api/text_to_speech_stream",
                    segment_index=segment_index,
                    bytes=int(total_size),
                    chunks=int(chunk_count),
                )

                if audio_file is not None and tmp_path is not None and final_rel is not None and recording_id and stop_index_arg is not None:
                    try:
                        audio_file.flush()
                        audio_file.close()
                        audio_file = None
                    except Exception:
                        pass
                    try:
                        audio_dir = deps.recording_store.audio_dir(recording_id)
                        final_path = (audio_dir / final_rel).resolve()
                        os.replace(str(tmp_path), str(final_path))
                        deps.recording_store.add_tts_audio(
                            recording_id=recording_id,
                            stop_index=int(stop_index_arg),
                            request_id=request_id,
                            segment_index=segment_index if segment_index is not None else None,
                            text=text,
                            rel_path=final_rel,
                        )
                    except Exception as e:
                        deps.logger.warning(f"[REC] tts_save_failed recording_id={recording_id} err={e}")
                return

            except GeneratorExit:
                deps.logger.info(f"[{request_id}] tts_stream_generator_exit endpoint=/api/text_to_speech_stream (client_disconnect?)")
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="tts",
                    name="tts_client_disconnect",
                    level="warn",
                    endpoint="/api/text_to_speech_stream",
                    segment_index=segment_index,
                )
                raise
            except Exception as e:
                deps.logger.error(f"[{request_id}] tts_stream_exception {e} provider={provider}", exc_info=True)
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="tts",
                    name="tts_stream_failed",
                    level="error",
                    endpoint="/api/text_to_speech_stream",
                    segment_index=segment_index,
                    err=str(e),
                )
            finally:
                try:
                    if audio_file is not None:
                        with contextlib.suppress(Exception):
                            audio_file.close()
                    if tmp_path is not None:
                        with contextlib.suppress(Exception):
                            if Path(tmp_path).exists():
                                Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    pass

        return Response(
            generate_streaming_audio(),
            mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return bp
