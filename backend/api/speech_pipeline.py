from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol

from flask import Response

from backend.api.speech_rate_limit import maybe_rate_limited_response
from backend.api.speech_recording import AskRecordingSink
from backend.api.speech_telemetry import AskStreamTelemetry
from backend.orchestrators.stream_payloads import make_chunk


@dataclass
class AskContext:
    deps: object
    parsed: object
    data: dict | None
    t_submit: float

    cancel_event: object | None = None

    @property
    def request_id(self) -> str:
        return str(getattr(self.parsed, "request_id", "") or "")

    @property
    def client_id(self) -> str:
        return str(getattr(self.parsed, "client_id", "") or "")

    @property
    def kind(self) -> str:
        return str(getattr(self.parsed, "kind", "") or "")

    @property
    def agent_id(self) -> str:
        return str(getattr(self.parsed, "agent_id", "") or "")


class AskRequestMiddleware(Protocol):
    def before(self, ctx: AskContext) -> Response | None: ...


class AskStreamMiddleware(Protocol):
    def wrap(self, ctx: AskContext, stream: Iterable[dict]) -> Iterable[dict]: ...


class RateLimitMiddleware:
    def before(self, ctx: AskContext) -> Response | None:
        return maybe_rate_limited_response(
            deps=ctx.deps,
            client_id=ctx.client_id,
            kind=ctx.kind,
            request_id=ctx.request_id,
            t_submit=ctx.t_submit,
        )


class RegisterMiddleware:
    def before(self, ctx: AskContext) -> Response | None:
        cancel_previous = ctx.kind in ("ask", "chat", "agent")
        cancel_event = ctx.deps.request_registry.register(
            client_id=ctx.client_id,
            request_id=ctx.request_id,
            kind=ctx.kind,
            cancel_previous=cancel_previous,
        )
        ctx.cancel_event = cancel_event
        ctx.deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="ask",
            name="ask_registered",
            ask_kind=ctx.kind,
            cancel_previous=bool(cancel_previous),
        )
        return None


class RecordingStreamMiddleware:
    def wrap(self, ctx: AskContext, stream: Iterable[dict]) -> Iterable[dict]:
        sink = AskRecordingSink(
            recording_store=ctx.deps.recording_store,
            recording_id=getattr(ctx.parsed, "recording_id", None),
            stop_index=getattr(ctx.parsed, "stop_index", None),
            tour_action=getattr(ctx.parsed, "tour_action", None),
            request_id=ctx.request_id,
        )

        def _gen():
            for payload in stream:
                sink.on_payload(payload)
                yield payload

        return _gen()


class TelemetryStreamMiddleware:
    def wrap(self, ctx: AskContext, stream: Iterable[dict]) -> Iterable[dict]:
        telemetry = AskStreamTelemetry(
            event_store=ctx.deps.event_store,
            ask_timings=ctx.deps.ask_timings,
            request_id=ctx.request_id,
            client_id=ctx.client_id,
        )

        def _gen():
            for payload in stream:
                telemetry.on_payload(payload)
                yield payload

        return _gen()


class LifecycleStreamMiddleware:
    def wrap(self, ctx: AskContext, stream: Iterable[dict]) -> Iterable[dict]:
        deps = ctx.deps

        def _gen():
            try:
                deps.event_store.emit(request_id=ctx.request_id, client_id=ctx.client_id, kind="ask", name="ask_stream_start")
                for payload in stream:
                    yield payload
                deps.event_store.emit(request_id=ctx.request_id, client_id=ctx.client_id, kind="ask", name="ask_done")
                return
            except GeneratorExit:
                deps.logger.info(f"[{ctx.request_id}] ask_stream_generator_exit (client_disconnect?)")
                deps.request_registry.cancel(ctx.request_id, reason="client_disconnect")
                deps.event_store.emit(
                    request_id=ctx.request_id,
                    client_id=ctx.client_id,
                    kind="ask",
                    name="ask_client_disconnect",
                    level="warn",
                )
                return
            except Exception as e:
                deps.logger.error(f"[{ctx.request_id}] 流式响应异常: {e}", exc_info=True)
                deps.event_store.emit(
                    request_id=ctx.request_id,
                    client_id=ctx.client_id,
                    kind="ask",
                    name="ask_stream_failed",
                    level="error",
                    err=str(e),
                )
                if ctx.agent_id and "ragflow_agent_completion_no_data" in str(e):
                    msg = (
                        f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{ctx.agent_id}/completions 无输出）。\n"
                        f"请检查RAGFlow 服务日志/版本或接口权限。"
                    )
                    yield make_chunk(msg, done=True)
                else:
                    yield make_chunk(f"错误: {str(e)}", done=True)
            finally:
                deps.request_registry.clear_active(client_id=ctx.client_id, kind=ctx.kind, request_id=ctx.request_id)

        return _gen()


def run_request_middlewares(ctx: AskContext, middlewares: list[AskRequestMiddleware]) -> Response | None:
    for mw in middlewares:
        resp = mw.before(ctx)
        if resp is not None:
            return resp
    return None


def apply_stream_middlewares(ctx: AskContext, stream: Iterable[dict], middlewares: list[AskStreamMiddleware]) -> Iterable[dict]:
    out = stream
    for mw in middlewares:
        out = mw.wrap(ctx, out)
    return out

