from __future__ import annotations

from typing import Any

from backend.services.config_utils import get_nested


def _s(v: Any, default: str = "") -> str:
    return str(v or default).strip()


def _parse_tts_provider(*, app_config: dict, data: dict | None, headers) -> str:
    provider = None
    try:
        provider = (data or {}).get("tts_provider")
    except Exception:
        provider = None
    if provider is None:
        try:
            provider = headers.get("X-TTS-Provider") if headers is not None else None
        except Exception:
            provider = None
    if provider is None:
        provider = get_nested(app_config or {}, ["tts", "provider"], "modelscope")
    return _s(provider, "modelscope") or "modelscope"


def _parse_tts_voice_model(*, provider: str, data: dict | None, headers) -> tuple[str, str]:
    provider_norm = _s(provider, "").lower()
    voice = ""
    model = ""
    try:
        voice = _s((data or {}).get("tts_voice"), "")
    except Exception:
        voice = ""
    if not voice:
        try:
            voice = _s(headers.get("X-TTS-Voice") if headers is not None else "", "")
        except Exception:
            voice = ""
    try:
        model = _s((data or {}).get("tts_model"), "")
    except Exception:
        model = ""

    # Provider-specific preset: "flash" means use cosyvoice-v3-flash with a reasonable default system voice.
    if provider_norm == "flash":
        if not model:
            model = "cosyvoice-v3-flash"
        if not voice:
            voice = "longanyang"

    return voice, model


def _parse_tts_speed(*, data: dict | None, headers) -> float | None:
    raw = None
    try:
        raw = (data or {}).get("tts_speed")
    except Exception:
        raw = None
    if raw is None:
        try:
            raw = headers.get("X-TTS-Speed") if headers is not None else None
        except Exception:
            raw = None
    if raw is None:
        return None
    try:
        v = float(raw)
    except Exception:
        raise ValueError("invalid_tts_speed")
    if not (0.1 <= v <= 5.0):
        raise ValueError("invalid_tts_speed")
    return v


def _ensure_dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def _apply_bailian_overrides(*, base: dict, voice: str, model: str, speech_rate: float | None) -> dict:
    if not voice and not model and speech_rate is None:
        return base

    out = dict(base or {})
    tts = dict(_ensure_dict(out.get("tts")))
    out["tts"] = tts
    bailian = dict(_ensure_dict(tts.get("bailian")))
    tts["bailian"] = bailian

    if voice:
        bailian["voice"] = voice
    if model:
        bailian["model"] = model
    if speech_rate is not None:
        bailian["speech_rate"] = float(speech_rate)
    return out


def _apply_edge_speed(*, base: dict, speed: float) -> dict:
    out = dict(base or {})
    tts = dict(_ensure_dict(out.get("tts")))
    out["tts"] = tts
    edge = dict(_ensure_dict(tts.get("edge")))
    tts["edge"] = edge

    base_rate = edge.get("rate", "0%")
    base_pct = 0.0
    try:
        if isinstance(base_rate, (int, float)):
            base_pct = float(base_rate)
        else:
            s = _s(base_rate, "")
            if s.endswith("%"):
                base_pct = float(s[:-1])
            else:
                base_pct = float(s)
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid_tts_edge_rate") from exc

    delta_pct = (float(speed) - 1.0) * 100.0
    pct = max(-80.0, min(base_pct + delta_pct, 100.0))
    sign = "+" if pct >= 0 else ""
    edge["rate"] = f"{sign}{pct:.0f}%"
    return out


def _apply_sapi_speed(*, base: dict, speed: float) -> dict:
    out = dict(base or {})
    tts = dict(_ensure_dict(out.get("tts")))
    out["tts"] = tts
    sapi = dict(_ensure_dict(tts.get("sapi")))
    tts["sapi"] = sapi

    try:
        base_rate = int(sapi.get("rate") or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid_tts_sapi_rate") from exc
    delta = int(round((float(speed) - 1.0) * 10.0))
    sapi["rate"] = max(-10, min(base_rate + delta, 10))
    return out


def resolve_tts_request(app_config: dict, *, data: dict | None, headers) -> tuple[str, dict]:
    """
    Resolve per-request provider + overrides for TTS without mutating the cached config dict.

    Returns:
      (provider, resolved_config)
    """
    base = app_config if isinstance(app_config, dict) else {}
    provider = _parse_tts_provider(app_config=base, data=data, headers=headers)
    provider_norm = provider.lower()

    voice, model = _parse_tts_voice_model(provider=provider, data=data, headers=headers)
    speed = _parse_tts_speed(data=data, headers=headers)

    # Clamp for safety.
    if speed is not None:
        speed = max(0.5, min(float(speed), 2.0))
        if abs(float(speed) - 1.0) < 1e-6:
            speed = None

    # Fast path: no overrides.
    if not voice and not model and speed is None:
        return provider, base

    resolved = base

    if provider_norm in ("modelscope", "bailian", "dashscope", "flash"):
        speech_rate = None
        if speed is not None:
            bailian = _ensure_dict(get_nested(base, ["tts", "bailian"], {}) or {})
            try:
                base_sr = float(bailian.get("speech_rate") or 1.0)
            except (TypeError, ValueError) as exc:
                raise ValueError("invalid_tts_bailian_speech_rate") from exc
            speech_rate = max(0.5, min(base_sr * float(speed), 2.0))
        resolved = _apply_bailian_overrides(base=resolved, voice=voice, model=model, speech_rate=speech_rate)
        return provider, resolved

    if provider_norm == "edge":
        if speed is None:
            return provider, base
        resolved = _apply_edge_speed(base=resolved, speed=float(speed))
        return provider, resolved

    if provider_norm == "sapi":
        if speed is None:
            return provider, base
        resolved = _apply_sapi_speed(base=resolved, speed=float(speed))
        return provider, resolved

    return provider, base
