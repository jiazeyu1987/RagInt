from __future__ import annotations

import time

from flask import Blueprint, Response, jsonify, request

from backend.api.ragflow_config_cache import get_ragflow_config
from backend.api.request_validators import json_body_dict
from backend.api.tts_nonstream import emit_tts_request_received, parse_tts_request_context, stream_tts_audio
from backend.api.tts_stream_request import emit_tts_stream_request_received, parse_tts_stream_request
from backend.api.tts_streaming import TtsStreamContext, generate_streaming_tts_audio
from backend.config import resolve_tts_request
from backend.services.config_utils import get_nested


def _get_nested(config: dict, path: list, default=None):
    return get_nested(config, path, default)


def _empty_audio_response(deps) -> Response:
    app_cfg = get_ragflow_config(deps=deps)
    return Response(b"", status=204, mimetype=_get_nested(app_cfg, ["tts", "mimetype"], "audio/wav"))


def _read_request_data() -> dict:
    if request.method == "GET":
        return dict(request.args) if request.args else {}
    return json_body_dict(request, silent=True)


def create_blueprint(deps):
    bp = Blueprint("tts_api", __name__)

    @bp.route("/api/text_to_speech", methods=["POST"])
    def text_to_speech():
        deps.logger.info("收到TTS请求")
        data = json_body_dict(request, silent=True)
        deps.logger.info(f"TTS请求数据: {data}")

        ctx, err = parse_tts_request_context(deps=deps, req=request, data=data)
        if err is not None:
            deps.logger.error("TTS请求缺少文本")
            return jsonify(err), 400

        emit_tts_request_received(deps=deps, ctx=ctx, endpoint="/api/text_to_speech")
        if ctx.cancel_event.is_set():
            deps.logger.info(f"[{ctx.request_id}] tts_cancelled_before_start endpoint=/api/text_to_speech client_id={ctx.client_id}")
            deps.event_store.emit(
                request_id=ctx.request_id,
                client_id=ctx.client_id,
                kind="tts",
                name="tts_cancelled_before_start",
                level="info",
                endpoint="/api/text_to_speech",
            )
            return _empty_audio_response(deps)

        deps.logger.info(
            f"[{ctx.request_id}] tts_request_received endpoint=/api/text_to_speech chars={len(ctx.text)} preview={ctx.text[:60]!r}"
        )

        app_config = get_ragflow_config(deps=deps)
        provider, app_config = resolve_tts_request(app_config, data=data, headers=request.headers)
        deps.tts_service.tts_state_update(
            ctx.request_id,
            ctx.segment_index,
            provider=str(provider),
            endpoint="/api/text_to_speech",
        )
        deps.logger.info(
            f"[{ctx.request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')}"
        )

        def generate_audio():
            yield from stream_tts_audio(
                deps=deps,
                ctx=ctx,
                app_config=app_config,
                provider=str(provider),
                endpoint="/api/text_to_speech",
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
        data = _read_request_data()
        deps.logger.info(f"流式TTS请求数据({request.method}): {data}")

        parsed, err = parse_tts_stream_request(deps=deps, req=request, data=data)
        if err is not None:
            deps.logger.error("流式TTS请求缺少文本")
            return jsonify(err), 400

        emit_tts_stream_request_received(deps=deps, req=request, parsed=parsed, endpoint="/api/text_to_speech_stream")
        request_id = parsed.request_id
        client_id = parsed.client_id
        text = parsed.text
        segment_index = parsed.segment_index
        cancel_event = parsed.cancel_event
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
            return _empty_audio_response(deps)

        ask_timing = deps.ask_timings.get(request_id)
        if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
            dt_since_submit = time.perf_counter() - float(ask_timing["t_submit"])
            deps.logger.info(f"[{request_id}] tts_request_received_since_submit dt={dt_since_submit:.3f}s")

        app_config = get_ragflow_config(deps=deps)
        provider, app_config = resolve_tts_request(app_config, data=data, headers=request.headers)
        deps.tts_service.tts_state_update(
            request_id,
            segment_index,
            provider=str(provider),
            endpoint="/api/text_to_speech_stream",
        )
        deps.logger.info(
            f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')} remote={request.remote_addr} ua={(request.headers.get('User-Agent') or '')[:60]!r}"
        )

        def generate_streaming_audio():
            stream_ctx = TtsStreamContext(
                deps=deps,
                request_id=request_id,
                client_id=client_id,
                text=text,
                app_config=app_config,
                provider=str(provider),
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
                cancel_event=cancel_event,
                t_received=t_received,
                recording_id=parsed.recording_id,
                stop_index=parsed.stop_index,
            )
            yield from generate_streaming_tts_audio(stream_ctx)

        return Response(
            generate_streaming_audio(),
            mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return bp
