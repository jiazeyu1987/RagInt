from __future__ import annotations

import contextlib
import time

from flask import Blueprint, Response, jsonify, request

from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator
from backend.api.request_context import get_client_id
from backend.api.sse_utils import SSEEncoder
from backend.api.speech_request import parse_ask_request
from backend.orchestrators.stream_payloads import get_chunk, get_segment, has_nonempty_chunk, has_nonempty_segment, is_done


def create_blueprint(deps):
    bp = Blueprint("speech_api", __name__)

    @bp.route("/api/cancel", methods=["POST"])
    def api_cancel():
        data = request.get_json() or {}
        request_id = str((data.get("request_id") or "")).strip()
        client_id = get_client_id(request, data=data, default="-")
        reason = str((data.get("reason") or "client_cancel")).strip()

        cancelled = False
        cancelled_id = None
        if request_id:
            cancelled = deps.request_registry.cancel(request_id, reason=reason)
            cancelled_id = request_id if cancelled else None
        else:
            cancelled_id = deps.request_registry.cancel_active(client_id=client_id, kind="ask", reason=reason)
            cancelled = bool(cancelled_id)

        deps.logger.info(
            f"[{request_id or '-'}] cancel_request client_id={client_id} cancelled={cancelled} target={cancelled_id} reason={reason}"
        )
        if cancelled_id:
            deps.event_store.emit(
                request_id=cancelled_id,
                client_id=client_id,
                kind="cancel",
                name="cancel",
                level="info",
                reason=reason,
            )
        return jsonify({"ok": True, "cancelled": cancelled, "request_id": cancelled_id, "client_id": client_id})

    # NOTE: `/api/speech_to_text` (upload ASR) has been removed.
    # All realtime ASR is handled via VoiceKit WebSocket: `/voicekit/ws/asr`.

    @bp.route("/api/ask", methods=["POST"])
    def ask_question():
        t_submit = time.perf_counter()
        deps.logger.info("收到问答请求")
        data = request.get_json()
        deps.logger.info(f"请求数据: {data}")

        parsed, err = parse_ask_request(deps=deps, data=data if isinstance(data, dict) else None)
        if err is not None:
            deps.logger.error("没有问题数据")
            return err

        question = parsed.question
        agent_id = parsed.agent_id
        conversation_name = parsed.conversation_name
        guide = parsed.guide
        client_id = parsed.client_id
        kind = parsed.kind
        save_history = parsed.save_history
        request_id = parsed.request_id
        recording_id = parsed.recording_id
        stop_name = parsed.stop_name
        stop_index = parsed.stop_index
        tour_action = parsed.tour_action
        action_type = parsed.action_type

        deps.event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="ask",
            name="ask_received",
            ask_kind=kind,
            agent_id=agent_id,
            chat_name=conversation_name,
            question_preview=str(question or "")[:120],
            stop_name=stop_name,
            stop_index=stop_index,
            stop_id=(f"stop_{stop_index}" if stop_index is not None else None),
            tour_action=tour_action,
            action_type=action_type,
        )

        rl_limit = 3
        rl_window_s = 2.5
        if kind in ("ask_prefetch", "prefetch", "prefetch_ask"):
            rl_limit = 1
            rl_window_s = 2.5
        if not deps.request_registry.rate_allow(client_id, kind, limit=rl_limit, window_s=rl_window_s):
            deps.logger.warning(f"[{request_id}] ask_rate_limited client_id={client_id} kind={kind}")
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="ask",
                name="ask_rate_limited",
                level="warn",
                ask_kind=kind,
                limit=rl_limit,
                window_s=rl_window_s,
            )

            def _rl():
                enc = SSEEncoder(request_id=request_id, t_submit=t_submit)
                payload = {"chunk": "请求过于频繁，请稍等 1-2 秒再提问。", "done": True, "request_id": request_id}
                return Response(enc.event(payload), mimetype="text/event-stream")

            return _rl()

        cancel_previous = kind in ("ask", "chat", "agent")
        cancel_event = deps.request_registry.register(client_id=client_id, request_id=request_id, kind=kind, cancel_previous=cancel_previous)
        deps.event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="ask",
            name="ask_registered",
            ask_kind=kind,
            cancel_previous=bool(cancel_previous),
        )
        if agent_id:
            conversation_name = ""
            deps.logger.info(f"[{request_id}] 问题: {question} agent_id={agent_id}")
        else:
            deps.logger.info(f"[{request_id}] 问题: {question} chat={conversation_name or 'default'}")

        deps.ask_timings.set(request_id, t_submit=t_submit)

        orchestrator = ConversationOrchestrator(
            ragflow_service=deps.ragflow_service,
            ragflow_agent_service=deps.ragflow_agent_service,
            intent_service=deps.intent_service,
            history_store=deps.history_store,
            selling_points_store=getattr(deps, "selling_points_store", None),
            logger=deps.logger,
            timings_set=deps.ask_timings.set,
            timings_get=deps.ask_timings.get,
            default_session=deps.session,
        )
        ragflow_config = deps.ragflow_service.load_config() or {}
        inp = AskInput(
            question=question,
            request_id=request_id,
            client_id=client_id,
            kind=kind,
            agent_id=agent_id,
            conversation_name=conversation_name,
            guide=guide,
            save_history=save_history,
        )

        def generate_response():
            enc = SSEEncoder(request_id=request_id, t_submit=t_submit)

            try:
                deps.event_store.emit(request_id=request_id, client_id=client_id, kind="ask", name="ask_stream_start")
                seen_first_text = False
                seen_first_segment = False
                for payload in orchestrator.stream_ask(
                    inp=inp,
                    ragflow_config=ragflow_config,
                    cancel_event=cancel_event,
                    t_submit=t_submit,
                ):
                    try:
                        if recording_id and stop_index is not None and tour_action:
                            if isinstance(payload, dict) and is_done(payload):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="done",
                                    text=None,
                                )
                            elif isinstance(payload, dict) and has_nonempty_segment(payload) and not is_done(payload):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="segment",
                                    text=str(get_segment(payload) or ""),
                                )
                            elif isinstance(payload, dict) and has_nonempty_chunk(payload) and not is_done(payload):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="chunk",
                                    text=str(get_chunk(payload) or ""),
                                )
                    except Exception:
                        pass

                    try:
                        if not seen_first_text and isinstance(payload, dict) and has_nonempty_chunk(payload):
                            seen_first_text = True
                            with contextlib.suppress(Exception):
                                deps.ask_timings.set(request_id, t_ragflow_first_text=time.perf_counter())
                            deps.event_store.emit(
                                request_id=request_id,
                                client_id=client_id,
                                kind="ask",
                                name="rag_first_text",
                                chars=len(str(get_chunk(payload) or "")),
                            )
                        if not seen_first_segment and isinstance(payload, dict) and has_nonempty_segment(payload):
                            seen_first_segment = True
                            seg = str(get_segment(payload) or "")
                            deps.event_store.emit(
                                request_id=request_id,
                                client_id=client_id,
                                kind="ask",
                                name="first_tts_segment",
                                chars=len(seg),
                                segment_seq=payload.get("segment_seq"),
                            )
                    except Exception:
                        pass
                    yield enc.event(payload)
                deps.event_store.emit(request_id=request_id, client_id=client_id, kind="ask", name="ask_done")
                return
            except GeneratorExit:
                deps.logger.info(f"[{request_id}] ask_stream_generator_exit (client_disconnect?)")
                deps.request_registry.cancel(request_id, reason="client_disconnect")
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="ask",
                    name="ask_client_disconnect",
                    level="warn",
                )
                return
            except Exception as e:
                deps.logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
                deps.event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="ask",
                    name="ask_stream_failed",
                    level="error",
                    err=str(e),
                )
                if agent_id and "ragflow_agent_completion_no_data" in str(e):
                    msg = (
                        f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。\n"
                        f"请检查RAGFlow 服务日志/版本或接口权限。"
                    )
                    yield enc.event({"chunk": msg, "done": True})
                else:
                    yield enc.event({"chunk": f"错误: {str(e)}", "done": True})
            finally:
                deps.request_registry.clear_active(client_id=client_id, kind=kind, request_id=request_id)

        deps.logger.info("返回流式响应")
        return Response(
            generate_response(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return bp
