from __future__ import annotations

from backend.orchestrators.ragflow_streaming import _stream_ragflow_response


class RagflowChunkManager:
    def __init__(self, *, ragflow_agent_service):
        self._ragflow_agent_service = ragflow_agent_service

    def stream_response(
        self,
        *,
        request_id: str,
        client_id: str,
        agent_id: str,
        question_for_rag: str,
        rag_session,
        cancel_event,
        t_submit: float,
        logger,
        timings_set,
        settings,
    ):
        return _stream_ragflow_response(
            request_id=request_id,
            client_id=client_id,
            agent_id=agent_id,
            question_for_rag=question_for_rag,
            rag_session=rag_session,
            ragflow_agent_service=self._ragflow_agent_service,
            cancel_event=cancel_event,
            t_submit=t_submit,
            logger=logger,
            timings_set=timings_set,
            settings=settings,
        )

