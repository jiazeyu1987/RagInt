from __future__ import annotations

from pathlib import Path
import pytest

from backend.api.tts_streaming import TtsStreamContext, _fallback_tts_providers, generate_streaming_tts_audio


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.errors: list[str] = []
        self.warns: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))

    def error(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.errors.append(str(msg))

    def warning(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.warns.append(str(msg))


class _Events:
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, **kw):
        self.events.append(dict(kw))


class _Timings:
    def __init__(self):
        self.data: dict = {"t_submit": 0.0}

    def set(self, request_id: str, **kwargs):
        self.data.update(kwargs)

    def get(self, request_id: str):
        return self.data


class _Store:
    def __init__(self, base: Path):
        self.base = base
        self.calls: list[dict] = []

    def audio_dir(self, recording_id: str):
        p = self.base / recording_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def add_tts_audio(self, **kwargs):
        self.calls.append(dict(kwargs))


class _Tts:
    def __init__(self, chunks):
        self._chunks = list(chunks)
        self.calls: list[str] = []

    def stream(self, **kwargs):  # noqa: ANN003
        self.calls.append(str(kwargs.get("provider") or ""))
        for c in self._chunks:
            yield c


class _FailingTts:
    def __init__(self):
        self.calls: list[str] = []

    def stream(self, **kwargs):  # noqa: ANN003
        provider = str(kwargs.get("provider") or "")
        self.calls.append(provider)
        raise RuntimeError(f"upstream_failed:{provider}")


class _Cancel:
    def __init__(self, seq=None):
        self.seq = list(seq or [False])
        self.i = 0

    def is_set(self):
        idx = min(self.i, len(self.seq) - 1)
        v = bool(self.seq[idx])
        self.i += 1
        return v


class _Deps:
    def __init__(self, tmp_path: Path, chunks, cancel_seq=None):
        self.logger = _Logger()
        self.event_store = _Events()
        self.ask_timings = _Timings()
        self.recording_store = _Store(tmp_path)
        self.tts_service = _Tts(chunks)
        self.cancel_event = _Cancel(cancel_seq)


def test_tts_streaming_generator_emits_done_and_records_audio(tmp_path):
    deps = _Deps(tmp_path, chunks=[b"a", b"b"], cancel_seq=[False, False, False])
    ctx = TtsStreamContext(
        deps=deps,
        request_id="r1",
        client_id="c1",
        text="hello",
        app_config={},
        provider="edge",
        endpoint="/api/text_to_speech_stream",
        segment_index=0,
        cancel_event=deps.cancel_event,
        t_received=0.0,
        recording_id="rec1",
        stop_index=1,
    )

    out = list(generate_streaming_tts_audio(ctx))
    assert out == [b"a", b"b"]
    names = [e.get("name") for e in deps.event_store.events]
    assert "tts_stream_done" in names
    assert "tts_first_audio_chunk" in names
    assert len(deps.recording_store.calls) == 1


def test_tts_streaming_generator_emits_cancelled_during_stream(tmp_path):
    deps = _Deps(tmp_path, chunks=[b"a", b"b"], cancel_seq=[False, True, True])
    ctx = TtsStreamContext(
        deps=deps,
        request_id="r2",
        client_id="c2",
        text="hello",
        app_config={},
        provider="edge",
        endpoint="/api/text_to_speech_stream",
        segment_index=0,
        cancel_event=deps.cancel_event,
        t_received=0.0,
        recording_id=None,
        stop_index=None,
    )

    out = list(generate_streaming_tts_audio(ctx))
    assert out == [b"a"]
    names = [e.get("name") for e in deps.event_store.events]
    assert "tts_cancelled_during_stream" in names
    assert "tts_stream_done" in names


def test_modelscope_fallback_does_not_include_edge_or_sapi():
    cfg = {"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}, "sovtts1": {"enabled": True}}}
    out = _fallback_tts_providers(primary="modelscope", app_config=cfg)
    assert out == []


def test_flash_failure_does_not_fallback_to_sovtts1_and_keeps_upstream_error(tmp_path):
    deps = _Deps(tmp_path, chunks=[])
    deps.tts_service = _FailingTts()
    ctx = TtsStreamContext(
        deps=deps,
        request_id="r3",
        client_id="c3",
        text="hello",
        app_config={"tts": {"sovtts1": {"enabled": True}}},
        provider="flash",
        endpoint="/api/text_to_speech_stream",
        segment_index=0,
        cancel_event=deps.cancel_event,
        t_received=0.0,
        recording_id=None,
        stop_index=None,
    )

    with pytest.raises(RuntimeError, match="upstream_failed:flash"):
        list(generate_streaming_tts_audio(ctx))
    assert deps.tts_service.calls == ["flash"]
    names = [e.get("name") for e in deps.event_store.events]
    assert "tts_stream_failed" in names
    failed_evt = next(e for e in deps.event_store.events if e.get("name") == "tts_stream_failed")
    assert "upstream_failed:flash" in str(failed_evt.get("err") or "")
