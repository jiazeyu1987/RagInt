from __future__ import annotations

import time

from flask import Blueprint, Response, jsonify, request

from backend.api.http_responses import bad_request_json
from backend.api.ragflow_config_cache import get_ragflow_config
from backend.api.request_validators import json_body_dict
from backend.api.speech_cancel import handle_cancel_request
from backend.api.speech_handlers import (
    build_ask_input,
    build_orchestrator,
    emit_ask_received_event,
    resolve_conversation_name,
    stream_sse_response,
)
from backend.api.speech_pipeline import (
    AskContext,
    LifecycleStreamMiddleware,
    RateLimitMiddleware,
    RecordingStreamMiddleware,
    RegisterMiddleware,
    TelemetryStreamMiddleware,
    apply_stream_middlewares,
    run_request_middlewares,
)
from backend.api.speech_request import parse_ask_request
from backend.services.asr_text_filter import (
    DEFAULT_ASR_FILTER_CHAT_NAME,
    build_asr_filter_prompt,
    parse_asr_filter_response,
    stringify_domain_terms,
)


def create_blueprint(deps):
    bp = Blueprint("speech_api", __name__)

    @bp.route("/api/cancel", methods=["POST"])
    def api_cancel():
        data = json_body_dict(request)
        return jsonify(handle_cancel_request(deps=deps, req=request, data=data))

    # NOTE: `/api/speech_to_text` (upload ASR) has been removed.
    # All realtime ASR is handled via VoiceKit WebSocket: `/voicekit/ws/asr`.

    @bp.route("/api/asr/filter", methods=["POST"])
    def api_asr_filter():
        data = json_body_dict(request, silent=False)
        text = str(data.get("text") or "").strip()
        if not text:
            return bad_request_json(error="text_required")

        prompt_template = str(data.get("prompt") or "").strip()
        if not prompt_template:
            return jsonify(
                {
                    "ok": True,
                    "text": text,
                    "original_text": text,
                    "filtered": False,
                    "used_fallback": True,
                    "reason": "prompt_empty",
                }
            )

        chat_name = str(data.get("chat_name") or "").strip() or DEFAULT_ASR_FILTER_CHAT_NAME
        domain_terms_text = stringify_domain_terms(data.get("domain_terms"))
        prompt = build_asr_filter_prompt(
            prompt_template=prompt_template,
            asr_text=text,
            domain_terms_text=domain_terms_text,
        )

        try:
            raw_output = deps.ragflow_service.ask_chat(
                chat_name=chat_name,
                question=prompt,
            )
            parsed_text = parse_asr_filter_response(raw_text=raw_output, fallback_text="")
            corrected_text = parsed_text or text
            return jsonify(
                {
                    "ok": True,
                    "text": corrected_text,
                    "original_text": text,
                    "filtered": corrected_text != text,
                    "used_fallback": not bool(parsed_text),
                    "chat_name": chat_name,
                }
            )
        except Exception as e:
            deps.logger.warning("asr_filter_failed chat=%s err=%s", chat_name, e, exc_info=True)
            return jsonify(
                {
                    "ok": True,
                    "text": text,
                    "original_text": text,
                    "filtered": False,
                    "used_fallback": True,
                    "chat_name": chat_name,
                    "error": str(e),
                }
            )

    @bp.route("/api/ask", methods=["POST"])
    def ask_question():
        t_submit = time.perf_counter()
        deps.logger.info("received ask request")
        data = json_body_dict(request, silent=False)
        deps.logger.info(f"ask payload: {data}")

        parsed, err = parse_ask_request(deps=deps, data=data)
        if err is not None:
            deps.logger.error("ask payload missing question")
            return err

        emit_ask_received_event(deps=deps, parsed=parsed)

        ctx = AskContext(deps=deps, parsed=parsed, data=data, t_submit=t_submit)
        early = run_request_middlewares(ctx, [RateLimitMiddleware(), RegisterMiddleware()])
        if early is not None:
            return early

        conversation_name = resolve_conversation_name(deps=deps, parsed=parsed)
        deps.ask_timings.set(parsed.request_id, t_submit=t_submit)

        orchestrator = build_orchestrator(deps=deps)
        ragflow_config = get_ragflow_config(deps=deps)
        inp = build_ask_input(parsed=parsed, conversation_name=conversation_name)

        def generate_response():
            yield from stream_sse_response(
                orchestrator=orchestrator,
                inp=inp,
                ragflow_config=ragflow_config,
                cancel_event=ctx.cancel_event,
                request_id=parsed.request_id,
                t_submit=t_submit,
                payload_stream_builder=lambda raw_stream: apply_stream_middlewares(
                    ctx,
                    raw_stream,
                    [
                        RecordingStreamMiddleware(),
                        TelemetryStreamMiddleware(),
                        LifecycleStreamMiddleware(),
                    ],
                ),
            )

        deps.logger.info("returning streaming ask response")
        return Response(
            generate_response(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return bp
