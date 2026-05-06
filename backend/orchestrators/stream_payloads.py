from __future__ import annotations


def make_meta(meta: dict) -> dict:
    return {"meta": dict(meta or {}), "done": False}


def make_chunk(text: str, *, done: bool = False, **extra) -> dict:
    payload = {"chunk": str(text or ""), "done": bool(done)}
    if extra:
        payload.update(extra)
    return payload


def make_done(**extra) -> dict:
    return make_chunk("", done=True, **extra)


def make_segment(segment: str, *, done: bool = False, segment_seq: int | None = None, **extra) -> dict:
    payload: dict = {"segment": str(segment or ""), "done": bool(done)}
    if segment_seq is not None:
        payload["segment_seq"] = int(segment_seq)
    if extra:
        payload.update(extra)
    return payload


def get_chunk(payload: dict) -> str:
    if not isinstance(payload, dict):
        raise TypeError(f"stream payload must be dict, got {type(payload).__name__}")
    if "chunk" not in payload:
        raise ValueError("stream payload missing chunk")
    v = payload.get("chunk")
    if v is None:
        raise ValueError("stream payload chunk is None")
    if not isinstance(v, str):
        raise TypeError(f"stream payload chunk must be str, got {type(v).__name__}")
    return v


def get_segment(payload: dict) -> str:
    if not isinstance(payload, dict):
        raise TypeError(f"stream payload must be dict, got {type(payload).__name__}")
    if "segment" not in payload:
        raise ValueError("stream payload missing segment")
    v = payload.get("segment")
    if v is None:
        raise ValueError("stream payload segment is None")
    if not isinstance(v, str):
        raise TypeError(f"stream payload segment must be str, got {type(v).__name__}")
    return v


def is_done(payload: dict) -> bool:
    return bool(payload.get("done"))


def classify_text_event(payload: dict) -> tuple[str | None, str | None]:
    """
    Normalize stream payload consumption for upper layers.
    Returns (kind, text):
      - ("done", None)
      - ("segment", "<text>")
      - ("chunk", "<text>")
      - (None, None) for non-text payloads
    """
    if not isinstance(payload, dict):
        raise TypeError(f"stream payload must be dict, got {type(payload).__name__}")
    if is_done(payload):
        return "done", None
    has_segment = "segment" in payload
    has_chunk = "chunk" in payload
    if has_segment:
        segment = get_segment(payload)
        return ("segment", segment) if segment.strip() else (None, None)
    if has_chunk:
        chunk = get_chunk(payload)
        return ("chunk", chunk) if chunk.strip() else (None, None)
    if "meta" in payload:
        return None, None
    if set(payload) <= {"done"}:
        return None, None
    raise ValueError("unknown stream payload schema")


def has_nonempty_chunk(payload: dict) -> bool:
    if not isinstance(payload, dict) or "chunk" not in payload:
        return False
    c = get_chunk(payload)
    return bool(c and c.strip())


def has_nonempty_segment(payload: dict) -> bool:
    if not isinstance(payload, dict) or "segment" not in payload:
        return False
    s = get_segment(payload)
    return bool(s and s.strip())
