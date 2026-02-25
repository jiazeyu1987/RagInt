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


def get_chunk(payload: dict) -> str | None:
    v = payload.get("chunk")
    return None if v is None else str(v)


def get_segment(payload: dict) -> str | None:
    v = payload.get("segment")
    return None if v is None else str(v)


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
    if is_done(payload):
        return "done", None
    if has_nonempty_segment(payload):
        return "segment", str(get_segment(payload) or "")
    if has_nonempty_chunk(payload):
        return "chunk", str(get_chunk(payload) or "")
    return None, None


def has_nonempty_chunk(payload: dict) -> bool:
    c = get_chunk(payload)
    return bool(c and c.strip())


def has_nonempty_segment(payload: dict) -> bool:
    s = get_segment(payload)
    return bool(s and s.strip())
