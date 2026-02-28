from __future__ import annotations

from dataclasses import dataclass

from flask import Response, jsonify, request as flask_request

from backend.api.request_context import get_client_id, get_request_id

PREFETCH_KINDS = {"ask_prefetch", "prefetch", "prefetch_ask"}


@dataclass(frozen=True)
class AskRequest:
    question: str
    agent_id: str
    conversation_name: str
    guide: dict
    client_id: str
    kind: str
    save_history: bool
    request_id: str
    recording_id: str | None
    stop_name: str | None
    stop_index: int | None
    tour_action: str | None
    action_type: str
    tts_provider: str | None
    tts_voice: str | None
    tts_speed: float | None
    qa_answer_target_chars: int | None
    qa_audio_cache_confidence_threshold: float | None
    qa_audio_cache_lookup_enabled: bool | None


def _normalize_guide(guide) -> dict:
    return guide if isinstance(guide, dict) else {}


def _as_int_or_none(value):
    try:
        return int(value) if value is not None and str(value).strip() != "" else None
    except Exception:
        return None


def _as_float_or_none(value):
    try:
        return float(value) if value is not None and str(value).strip() != "" else None
    except Exception:
        return None


def _as_bool_or_none(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return bool(value)
    s = str(value).strip().lower()
    if not s:
        return None
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    return None


def _compute_action_type(*, guide: dict) -> str:
    tour_action = str((guide.get("tour_action") or "")).strip()
    action_type = str((guide.get("action_type") or "")).strip()
    if action_type:
        return action_type
    if tour_action in ("next", "prev", "jump"):
        return "切站"
    if tour_action:
        return "讲解"
    return "问答"


def parse_ask_request(*, deps, data: dict | None) -> tuple[AskRequest | None, Response | None]:
    if not data or not str(data.get("question") or "").strip():
        resp = jsonify({"error": "No question"})
        resp.status_code = 400
        return None, resp

    question = str(data.get("question") or "")
    agent_id = str((data.get("agent_id") or "")).strip()
    conversation_name = str(
        (data.get("conversation_name") or data.get("chat_name") or getattr(deps, "ragflow_default_chat_name", "") or "")
    ).strip()
    guide = _normalize_guide(data.get("guide") or {})

    client_id = get_client_id(flask_request, data=data, default="-")
    kind = str((data.get("kind") or "ask")).strip() or "ask"
    save_history = kind not in PREFETCH_KINDS
    request_id = get_request_id(flask_request, data=data, prefix="ask")

    recording_id = str((data.get("recording_id") or flask_request.headers.get("X-Recording-ID") or "")).strip() or None
    stop_name = str((guide.get("stop_name") or "")).strip() or None
    stop_index = _as_int_or_none(guide.get("stop_index", None))
    tour_action = str((guide.get("tour_action") or "")).strip() or None
    action_type = _compute_action_type(guide=guide)
    tts_provider = str((data.get("tts_provider") or flask_request.headers.get("X-TTS-Provider") or "")).strip() or None
    tts_voice = str((data.get("tts_voice") or flask_request.headers.get("X-TTS-Voice") or "")).strip() or None
    tts_speed = _as_float_or_none(data.get("tts_speed"))
    if tts_speed is None:
        tts_speed = _as_float_or_none(flask_request.headers.get("X-TTS-Speed"))
    qa_answer_target_chars = _as_int_or_none(data.get("qa_answer_target_chars"))
    qa_audio_cache_confidence_threshold = _as_float_or_none(data.get("qa_audio_cache_confidence_threshold"))
    qa_audio_cache_lookup_enabled = _as_bool_or_none(data.get("qa_audio_cache_lookup_enabled"))
    if tour_action:
        qa_audio_cache_lookup_enabled = False

    return (
        AskRequest(
            question=question,
            agent_id=agent_id,
            conversation_name=conversation_name,
            guide=guide,
            client_id=client_id,
            kind=kind,
            save_history=save_history,
            request_id=request_id,
            recording_id=recording_id,
            stop_name=stop_name,
            stop_index=stop_index,
            tour_action=tour_action,
            action_type=action_type,
            tts_provider=tts_provider,
            tts_voice=tts_voice,
            tts_speed=tts_speed,
            qa_answer_target_chars=qa_answer_target_chars,
            qa_audio_cache_confidence_threshold=qa_audio_cache_confidence_threshold,
            qa_audio_cache_lookup_enabled=qa_audio_cache_lookup_enabled,
        ),
        None,
    )
