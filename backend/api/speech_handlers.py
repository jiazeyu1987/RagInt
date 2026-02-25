from __future__ import annotations

from backend.api.sse_utils import SSEEncoder
from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator


def emit_ask_received_event(*, deps, parsed) -> None:
    deps.event_store.emit(
        request_id=parsed.request_id,
        client_id=parsed.client_id,
        kind="ask",
        name="ask_received",
        ask_kind=parsed.kind,
        agent_id=parsed.agent_id,
        chat_name=parsed.conversation_name,
        question_preview=str(parsed.question or "")[:120],
        stop_name=parsed.stop_name,
        stop_index=parsed.stop_index,
        stop_id=(f"stop_{parsed.stop_index}" if parsed.stop_index is not None else None),
        tour_action=parsed.tour_action,
        action_type=parsed.action_type,
    )


def resolve_conversation_name(*, deps, parsed) -> str:
    if parsed.agent_id:
        deps.logger.info(f"[{parsed.request_id}] 闂: {parsed.question} agent_id={parsed.agent_id}")
        return ""
    conversation_name = parsed.conversation_name
    deps.logger.info(f"[{parsed.request_id}] 闂: {parsed.question} chat={conversation_name or 'default'}")
    return conversation_name


def build_orchestrator(*, deps) -> ConversationOrchestrator:
    return ConversationOrchestrator(
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


def build_ask_input(*, parsed, conversation_name: str) -> AskInput:
    return AskInput(
        question=parsed.question,
        request_id=parsed.request_id,
        client_id=parsed.client_id,
        kind=parsed.kind,
        agent_id=parsed.agent_id,
        conversation_name=conversation_name,
        guide=parsed.guide,
        save_history=parsed.save_history,
    )


def stream_sse_response(
    *,
    orchestrator: ConversationOrchestrator,
    inp: AskInput,
    ragflow_config: dict | None,
    cancel_event,
    request_id: str,
    t_submit: float,
    payload_stream_builder,
):
    enc = SSEEncoder(request_id=request_id, t_submit=t_submit)
    raw_stream = orchestrator.stream_ask(
        inp=inp,
        ragflow_config=ragflow_config,
        cancel_event=cancel_event,
        t_submit=t_submit,
    )
    payload_stream = payload_stream_builder(raw_stream)
    for payload in payload_stream:
        yield enc.event(payload)
