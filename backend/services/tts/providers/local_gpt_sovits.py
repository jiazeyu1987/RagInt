from __future__ import annotations

import contextlib
import logging
import threading
import urllib.parse

import requests

from backend.services.config_utils import get_nested


def get_local_tts_cfg(config: dict, local_provider: str) -> dict:
    lp = (local_provider or "").strip().lower()
    if lp == "sovtts2":
        return (
            get_nested(config, ["tts", "sovtts2"], None)
            or get_nested(config, ["tts", "local_v2"], None)
            or get_nested(config, ["tts", "local"], {})
            or {}
        )
    if lp == "sovtts1":
        return (get_nested(config, ["tts", "sovtts1"], None) or get_nested(config, ["tts", "local"], {}) or {})
    return get_nested(config, ["tts", "local"], {}) or {}


def stream_local_gpt_sovits(
    *,
    text: str,
    request_id: str,
    config: dict,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
    local_provider: str = "sovtts1",
):
    tts_cfg = get_local_tts_cfg(config, local_provider)
    if tts_cfg.get("enabled") is False:
        raise ValueError(f"local TTS is disabled by config for provider={local_provider}")
    url = str(tts_cfg.get("url", "http://127.0.0.1:9880")).strip() or "http://127.0.0.1:9880"
    timeout_s = float(tts_cfg.get("timeout_s", 30))

    # Compatibility:
    # - Legacy local TTS adapter (historical): POST {text_lang, ref_audio_path, prompt_lang, ...} to /tts
    # - GPT-SoVITS api.py: GET/POST to / with {text_language, refer_wav_path, prompt_language, ...}
    def _normalize_to_root(u: str) -> str:
        try:
            parsed = urllib.parse.urlparse(u)
            path = parsed.path or "/"
            if path.endswith("/tts"):
                path = path[: -len("/tts")] or "/"
            if not path.endswith("/"):
                path = path + "/"
            return urllib.parse.urlunparse(parsed._replace(path=path))
        except Exception:
            return u

    def _ensure_tts_endpoint(u: str) -> str:
        try:
            parsed = urllib.parse.urlparse(u)
            path = parsed.path or ""
            # api_v2 expects /tts
            if not path.endswith("/tts"):
                path = (path.rstrip("/") + "/tts") if path else "/tts"
            return urllib.parse.urlunparse(parsed._replace(path=path))
        except Exception:
            return u.rstrip("/") + "/tts"

    payload_legacy = {
        "text": text,
        "text_lang": tts_cfg.get("text_lang", "zh"),
        "ref_audio_path": tts_cfg.get("ref_audio_path", ""),
        "prompt_lang": tts_cfg.get("prompt_lang", "zh"),
        "prompt_text": tts_cfg.get("prompt_text", ""),
        "low_latency": bool(tts_cfg.get("low_latency", True)),
        "media_type": tts_cfg.get("media_type", "wav"),
        # api_v2 supports streaming_mode; set truthy to encourage chunked responses when enabled.
        "streaming_mode": tts_cfg.get("streaming_mode", True),
    }

    payload_gpt_sovits = {
        "text": text,
        "text_language": tts_cfg.get("text_language", tts_cfg.get("text_lang", "zh")),
        "refer_wav_path": tts_cfg.get("refer_wav_path", tts_cfg.get("ref_audio_path", "")),
        "prompt_language": tts_cfg.get("prompt_language", tts_cfg.get("prompt_lang", "zh")),
        "prompt_text": tts_cfg.get("prompt_text", ""),
    }

    headers = {"X-Request-ID": request_id}
    cancel_event = cancel_event or threading.Event()
    if cancel_event.is_set():
        return

    candidates = []
    lp = (local_provider or "").strip().lower()
    if lp == "sovtts2":
        candidates.append(("api_v2", url, payload_legacy))
    elif lp == "sovtts1":
        # If sovtts1 is configured to point to /tts, try api_v2 first to avoid a noisy POST / 400.
        try:
            parsed = urllib.parse.urlparse(url)
            path = (parsed.path or "").lower()
        except Exception:
            path = ""
        if path.endswith("/tts"):
            candidates.append(("api_v2", url, payload_legacy))
        candidates.append(("api_py_root", _normalize_to_root(url), payload_gpt_sovits))
        # Some legacy deployments still expect /tts even for "sovtts1".
        candidates.append(("legacy_tts", _ensure_tts_endpoint(url), payload_legacy))
    else:
        candidates.append(("api_v2", url, payload_legacy))
        candidates.append(("api_py_root", _normalize_to_root(url), payload_gpt_sovits))
        candidates.append(("legacy_tts", _ensure_tts_endpoint(url), payload_legacy))

    last_err = None
    for kind, cand_url, payload in candidates:
        if cancel_event.is_set():
            return
        try:
            logger.info(f"[{request_id}] local_tts_request kind={kind} url={cand_url} timeout_s={timeout_s} chars={len(text)}")
            r = requests.post(
                cand_url,
                json=payload,
                headers=headers,
                stream=True,
                timeout=timeout_s,
            )
        except Exception as e:
            last_err = e
            continue

        try:
            ct = str(r.headers.get("Content-Type") or "").lower()
            logger.info(f"[{request_id}] local_tts_response kind={kind} status={r.status_code} ct={ct}")
            if r.status_code != 200:
                with contextlib.suppress(Exception):
                    body = (r.text or "")[:200]
                    logger.warning(f"[{request_id}] local_tts_non_200 kind={kind} status={r.status_code} body={body}")
                last_err = RuntimeError(f"local_tts_non_200:{r.status_code}")
                continue

            for chunk in r.iter_content(chunk_size=4096):
                if cancel_event.is_set():
                    logger.info(f"[{request_id}] local_tts_cancelled")
                    break
                if chunk:
                    yield chunk
            return
        finally:
            with contextlib.suppress(Exception):
                r.close()

    if last_err is not None:
        raise RuntimeError(f"local TTS request failed: {last_err}")
    raise RuntimeError("local TTS request failed: no candidate endpoint succeeded")

