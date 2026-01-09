from __future__ import annotations

import contextlib
import json
import time
import uuid

from flask import Blueprint, Response, jsonify, request

from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator
from backend.api.request_context import get_client_id, get_request_id


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

    @bp.route("/api/speech_to_text", methods=["POST"])
    def speech_to_text():
        if "audio" not in request.files:
            return jsonify({"error": "No audio file"}), 400

        audio_file = request.files["audio"]
        raw_bytes = audio_file.read()

        request_id = get_request_id(request, form=request.form, prefix="asr")
        client_id = get_client_id(request, form=request.form, default="-")
        deps.event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="asr",
            name="asr_received",
            bytes=len(raw_bytes),
            filename=getattr(audio_file, "filename", None),
            mimetype=getattr(audio_file, "mimetype", None),
        )

        if not deps.request_registry.rate_allow(client_id, "asr", limit=6, window_s=3.0):
            deps.logger.warning(f"[{request_id}] asr_rate_limited client_id={client_id}")
            deps.event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_rate_limited", level="warn")
            return jsonify({"text": ""})

        cancel_event = deps.request_registry.register(
            client_id=client_id,
            request_id=request_id,
            kind="asr",
            cancel_previous=True,
            cancel_reason="asr_replaced_by_new",
        )
        if cancel_event.is_set():
            deps.logger.info(f"[{request_id}] asr_cancelled_before_start client_id={client_id}")
            deps.event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_cancelled_before_start", level="info")
            deps.request_registry.clear_active(client_id=client_id, kind="asr", request_id=request_id)
            return jsonify({"text": ""})

        app_config = deps.ragflow_service.load_config() or {}
        t0 = time.perf_counter()
        try:
            deps.event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_start")
            text = deps.asr_service.transcribe(
                raw_bytes,
                app_config,
                cancel_event=cancel_event,
                src_filename=getattr(audio_file, "filename", None),
                src_mime=getattr(audio_file, "mimetype", None),
            )
            dt_s = time.perf_counter() - t0
            deps.logger.info(f"asr_done dt={dt_s:.3f}s chars={len(text)}")
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="asr",
                name="asr_done",
                dt_ms=int(dt_s * 1000.0),
                chars=len(text or ""),
            )
            return jsonify({"text": text})
        except Exception as e:
            deps.logger.error(f"asr_failed err={e}", exc_info=True)
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="asr",
                name="asr_failed",
                level="error",
                err=str(e),
            )
            return jsonify({"text": ""})
        finally:
            deps.request_registry.clear_active(client_id=client_id, kind="asr", request_id=request_id)

    @bp.route("/api/ask", methods=["POST"])
    def ask_question():
        t_submit = time.perf_counter()
        deps.logger.info("收到问答请求")
        data = request.get_json()
        deps.logger.info(f"请求数据: {data}")

        if not data or not data.get("question"):
            deps.logger.error("没有问题数据")
            return jsonify({"error": "No question"}), 400

        question = data.get("question", "")
        agent_id = (data.get("agent_id") or "").strip()
        conversation_name = (data.get("conversation_name") or data.get("chat_name") or deps.ragflow_default_chat_name or "").strip()
        guide = data.get("guide") or {}
        if not isinstance(guide, dict):
            guide = {}
        client_id = get_client_id(request, data=data, default="-")
        kind = str((data.get("kind") or "ask")).strip() or "ask"
        save_history = kind not in ("ask_prefetch", "prefetch", "prefetch_ask")
        request_id = get_request_id(request, data=data, prefix="ask")

        recording_id = str((data.get("recording_id") or request.headers.get("X-Recording-ID") or "")).strip() or None
        stop_name = str((guide.get("stop_name") or "")).strip() or None
        stop_index = guide.get("stop_index", None)
        try:
            stop_index = int(stop_index) if stop_index is not None and str(stop_index).strip() != "" else None
        except Exception:
            stop_index = None
        tour_action = str((guide.get("tour_action") or "")).strip() or None
        action_type = str((guide.get("action_type") or "")).strip() or None
        if not action_type:
            if tour_action in ("next", "prev", "jump"):
                action_type = "切站"
            elif tour_action:
                action_type = "讲解"
            else:
                action_type = "问答"

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
                payload = {"chunk": "请求过于频繁，请稍等 1-2 秒再提问。", "done": True, "request_id": request_id}
                return Response(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n", mimetype="text/event-stream")

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
            def sse_event(payload: dict) -> str:
                payload.setdefault("request_id", request_id)
                payload.setdefault("t_ms", int((time.perf_counter() - t_submit) * 1000))
                return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

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
                            if isinstance(payload, dict) and payload.get("done"):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="done",
                                    text=None,
                                )
                            elif isinstance(payload, dict) and payload.get("segment") and not payload.get("done"):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="segment",
                                    text=str(payload.get("segment") or ""),
                                )
                            elif isinstance(payload, dict) and payload.get("chunk") and not payload.get("done"):
                                deps.recording_store.add_ask_event(
                                    recording_id=recording_id,
                                    stop_index=int(stop_index),
                                    request_id=request_id,
                                    kind="chunk",
                                    text=str(payload.get("chunk") or ""),
                                )
                    except Exception:
                        pass

                    try:
                        if not seen_first_text and isinstance(payload, dict) and (payload.get("chunk") or "").strip():
                            seen_first_text = True
                            with contextlib.suppress(Exception):
                                deps.ask_timings.set(request_id, t_ragflow_first_text=time.perf_counter())
                            deps.event_store.emit(
                                request_id=request_id,
                                client_id=client_id,
                                kind="ask",
                                name="rag_first_text",
                                chars=len(str(payload.get("chunk") or "")),
                            )
                        if not seen_first_segment and isinstance(payload, dict) and (payload.get("segment") or "").strip():
                            seen_first_segment = True
                            seg = str(payload.get("segment") or "")
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
                    yield sse_event(payload)
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
                    yield sse_event({"chunk": msg, "done": True})
                else:
                    yield sse_event({"chunk": f"错误: {str(e)}", "done": True})
            finally:
                deps.request_registry.clear_active(client_id=client_id, kind=kind, request_id=request_id)

        deps.logger.info("返回流式响应")
        return Response(
            generate_response(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return bp
