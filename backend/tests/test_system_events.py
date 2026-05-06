from __future__ import annotations

from types import SimpleNamespace

from backend.api.system_events import build_status_payload, ingest_client_event, parse_client_event, parse_status_request_id


class _Events:
    def __init__(self):
        self.emitted: list[dict] = []

    def emit(self, **kwargs):
        self.emitted.append(dict(kwargs))

    def last_error(self, request_id: str):  # noqa: ARG002
        return None

    def list_events(self, request_id: str, limit: int):  # noqa: ARG002
        return [{"name": "ask_received", "fields": {"stop_name": "S1", "stop_id": "stop_1", "action_type": "guide"}}]


class _FailingEvents(_Events):
    def emit(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("event_store_down")


class _Timings:
    def __init__(self):
        self.v = {"t_submit": 1.0, "t_play_end": 2.0}
        self.set_calls: list[tuple] = []

    def get(self, rid: str):  # noqa: ARG002
        return dict(self.v)

    def set(self, rid: str, **kwargs):
        self.set_calls.append((rid, dict(kwargs)))


class _FailingTimings(_Timings):
    def set(self, rid: str, **kwargs):
        raise RuntimeError("timings_down")


class _Registry:
    def get_info(self, rid: str):  # noqa: ARG002
        return {}

    def is_cancelled(self, rid: str):  # noqa: ARG002
        return False


class _Tts:
    def tts_state_get(self, rid: str):  # noqa: ARG002
        return {"x": 1}


class _Deps:
    def __init__(self):
        self.event_store = _Events()
        self.ask_timings = _Timings()
        self.request_registry = _Registry()
        self.tts_service = _Tts()


def _req(args=None, headers=None):
    return SimpleNamespace(args=dict(args or {}), headers=dict(headers or {}))


def test_parse_client_event_and_ingest():
    deps = _Deps()
    event = parse_client_event(
        req=_req(headers={"X-Request-ID": "r1", "X-Client-ID": "c1"}),
        data={"name": "play_end", "fields": {"a": 1}},
    )
    assert event.request_id == "r1"
    assert event.client_id == "c1"
    assert ingest_client_event(deps=deps, event=event) is True
    assert deps.event_store.emitted[-1]["name"] == "play_end"
    assert deps.ask_timings.set_calls[-1][0] == "r1"


def test_ingest_client_event_maps_wall_clock_timing_fields():
    deps = _Deps()
    event = parse_client_event(
        req=_req(headers={"X-Request-ID": "r2"}),
        data={"name": "asr_filtering_finished", "fields": {"t_client_wall_ms": 1760000000123}},
    )
    assert ingest_client_event(deps=deps, event=event) is True
    assert ("r2", {"t_asr_filter_end_ms": 1760000000123}) in deps.ask_timings.set_calls

    event2 = parse_client_event(
        req=_req(headers={"X-Request-ID": "r2"}),
        data={"name": "ask_client_start", "fields": {"t_client_wall_ms": 1760000000222}},
    )
    assert ingest_client_event(deps=deps, event=event2) is True
    assert ("r2", {"t_ask_client_start_ms": 1760000000222}) in deps.ask_timings.set_calls


def test_ingest_client_event_fails_when_event_store_write_fails():
    deps = _Deps()
    deps.event_store = _FailingEvents()
    event = parse_client_event(
        req=_req(headers={"X-Request-ID": "r3"}),
        data={"name": "play_end", "fields": {"t_client_wall_ms": 1760000000123}},
    )

    assert ingest_client_event(deps=deps, event=event) is False


def test_ingest_client_event_fails_when_required_timing_write_fails():
    deps = _Deps()
    deps.ask_timings = _FailingTimings()
    event = parse_client_event(
        req=_req(headers={"X-Request-ID": "r4"}),
        data={"name": "play_end", "fields": {"t_client_wall_ms": 1760000000123}},
    )

    assert ingest_client_event(deps=deps, event=event) is False


def test_parse_status_request_id_from_header_or_query():
    assert parse_status_request_id(_req(args={"request_id": "r2"})) == "r2"
    assert parse_status_request_id(_req(headers={"X-Request-ID": "r3"})) == "r3"


def test_build_status_payload_contains_context_and_metrics():
    deps = _Deps()
    payload = build_status_payload(deps=deps, request_id="r1")
    assert payload["request_id"] == "r1"
    assert payload["context"]["stop_id"] == "stop_1"
    assert payload["tts_state"]["x"] == 1
