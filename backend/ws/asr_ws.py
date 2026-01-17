from __future__ import annotations

import contextlib
import json
import logging
import os
import queue
import threading
import time
import unicodedata
import uuid

from flask import Flask
from flask_sock import Sock

from backend.services.config_utils import get_nested


def _normalize_with_mapping(value: str) -> tuple[str, list[int]]:
    s = (value or "").strip()
    if not s:
        return "", []
    kept: list[str] = []
    mapping: list[int] = []
    for idx, ch in enumerate(s):
        if ch.isspace():
            continue
        cat = unicodedata.category(ch)
        if cat and cat[0] in ("P", "S", "Z"):
            continue
        kept.append(ch.casefold())
        mapping.append(idx)
    return "".join(kept), mapping


def _norm_for_wake_match(value: str) -> str:
    return _normalize_with_mapping(value or "")[0]


def _safe_bool(v, default: bool = False) -> bool:
    if v is None:
        return bool(default)
    if isinstance(v, bool):
        return bool(v)
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    return bool(default)


def _safe_int(v, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def _normalize_api_key(raw: str | None) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    upper = s.upper()
    if upper in ("YOUR_DASHSCOPE_API_KEY_HERE", "YOUR_API_KEY_HERE"):
        return ""
    if "YOUR_" in upper and "API_KEY" in upper:
        return ""
    return s


def register_asr_ws(app: Flask, deps) -> None:
    """
    `/ws/asr` accepts:
      - Optional JSON "start" message (string) from client, then binary PCM16LE frames.
      - Optional JSON "stop"/"cancel" control messages.

    Emits:
      - {"type":"partial","text":"...","prewake":true/false}
      - {"type":"final","text":"..."}
      - {"type":"wake","wake_word":"..."}
      - {"type":"info","message":"..."}
      - {"type":"error","error":"..."}
    """

    sock = Sock(app)

    @sock.route("/ws/asr")
    def ws_asr(ws):  # pragma: no cover (WS integration)
        try:
            _ws_asr_impl(ws, deps)
        except Exception as e:
            try:
                ws.send(json.dumps({"type": "error", "error": f"ws_asr_exception: {e}"}))
            except Exception:
                pass
            try:
                ws.close()
            except Exception:
                pass


def _ws_asr_impl(ws, deps) -> None:  # pragma: no cover (WS integration)
    try:
        import dashscope
        from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult
    except Exception as e:
        try:
            ws.send(json.dumps({"type": "error", "error": f"dashscope_sdk_missing: {e}"}))
        except Exception:
            pass
        return

    app_cfg = {}
    try:
        app_cfg = deps.ragflow_service.load_config() or {}
    except Exception:
        pass
    asr_cfg = get_nested(app_cfg, ["asr", "dashscope"], {}) or {}
    tts_cfg = get_nested(app_cfg, ["tts", "bailian"], {}) or {}

    api_key = _normalize_api_key(asr_cfg.get("api_key")) or _normalize_api_key(tts_cfg.get("api_key"))
    api_key = api_key or _normalize_api_key(os.environ.get("DASHSCOPE_API_KEY")) or _normalize_api_key(os.environ.get("BAILIAN_API_KEY"))
    if not api_key:
        try:
            ws.send(json.dumps({"type": "error", "error": "asr_missing_api_key"}))
        except Exception:
            pass
        return

    dashscope.api_key = api_key
    ws_url = str(asr_cfg.get("ws_url") or asr_cfg.get("dashscope_ws_url") or "").strip()
    if ws_url:
        dashscope.base_websocket_api_url = ws_url

    model = str(asr_cfg.get("model") or "paraformer-realtime-v2").strip() or "paraformer-realtime-v2"
    sample_rate = 16000

    wake_word_service = getattr(deps, "wake_word_service", None)
    request_registry = getattr(deps, "request_registry", None)
    event_store = getattr(deps, "event_store", None)
    logger = getattr(deps, "logger", None) or logging.getLogger(__name__)
    wake_debug = _safe_bool(os.environ.get("RAGINT_WAKE_DEBUG"), False)
    # Wake flag TTL: once awakened, only forward ASR output during this window.
    wake_active_ms = max(500, _safe_int(os.environ.get("RAGINT_WAKE_ACTIVE_MS"), 8000))
    # Limit where the wake word may appear (to reduce false triggers / tolerate a little leading filler).
    # Default 0 means "must be at beginning". You can override per-session by sending `wake_max_pos`.
    wake_max_pos = max(0, _safe_int(os.environ.get("RAGINT_WAKE_CONTAINS_MAX_POS"), 0))
    asr_final_wait_s = float(os.environ.get("RAGINT_ASR_FINAL_WAIT_S") or 1.2)
    if asr_final_wait_s < 0:
        asr_final_wait_s = 0.0
    if asr_final_wait_s > 10:
        asr_final_wait_s = 10.0
    asr_force_final_on_stop = _safe_bool(os.environ.get("RAGINT_ASR_FORCE_FINAL_ON_STOP"), True)

    client_id = ""
    request_id = ""
    wake_word = ""
    wake_enabled = False
    wake_match_mode = "contains"
    wake_cooldown_ms = 0
    continuous = False
    emit_prewake = True

    first = None
    try:
        first = ws.receive()
    except Exception:
        return

    first_audio: bytes | None = None
    if isinstance(first, str) and first.strip().startswith("{"):
        try:
            msg = json.loads(first)
        except Exception:
            msg = None
        if isinstance(msg, dict) and str(msg.get("type") or "").lower() == "start":
            client_id = str(msg.get("client_id") or "").strip()
            request_id = str(msg.get("request_id") or "").strip()
            sample_rate = _safe_int(msg.get("sample_rate"), 16000) or 16000
            wake_enabled = _safe_bool(msg.get("wake_word_enabled"), False)
            wake_word = str(msg.get("wake_word") or "").strip()
            wake_match_mode = str(msg.get("wake_match_mode") or msg.get("match_mode") or "contains").strip().lower() or "contains"
            if wake_match_mode not in ("contains", "prefix"):
                wake_match_mode = "contains"
            wake_cooldown_ms = max(0, _safe_int(msg.get("wake_cooldown_ms"), 0))
            wake_max_pos = max(0, min(20, _safe_int(msg.get("wake_max_pos"), wake_max_pos)))
            continuous = _safe_bool(msg.get("continuous"), False)
            emit_prewake = _safe_bool(msg.get("emit_prewake"), True)
    elif isinstance(first, (bytes, bytearray)):
        first_audio = bytes(first)

    client_id = client_id or "-"
    request_id = request_id or f"asrws_{uuid.uuid4().hex}"

    if request_registry:
        rate_allowed = request_registry.rate_allow(client_id, "asr", limit=6, window_s=3.0)
        if not rate_allowed:
            if logger:
                logger.warning(f"[{request_id}] asr_rate_limited client_id={client_id}")
            if event_store:
                event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="asr",
                    name="asr_rate_limited",
                    level="warn",
                )
            try:
                ws.send(json.dumps({"type": "error", "error": "asr_rate_limited"}))
            except Exception:
                pass
            return

    cancel_event = threading.Event()
    if request_registry:
        cancel_event = request_registry.register(
            client_id=client_id,
            request_id=request_id,
            kind="asr",
            cancel_previous=True,
            cancel_reason="asr_ws",
        )

    if event_store:
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="asr",
            name="asr_ws_started",
        )

    wake_word = wake_word if wake_enabled else ""
    wake_word_norm = _norm_for_wake_match(wake_word) if wake_word else ""
    if wake_enabled and wake_word and not wake_word_norm:
        try:
            ws.send(json.dumps({"type": "error", "error": "wake_word_invalid"}))
        except Exception:
            pass
        return
    if wake_debug:
        try:
            logger.info(
                f"[{request_id}] asr_ws_start client_id={client_id} model={model} continuous={continuous} "
                f"wake_enabled={wake_enabled} wake_mode={wake_match_mode} wake_word={wake_word!r} "
                f"wake_norm={wake_word_norm!r} cooldown_ms={wake_cooldown_ms} emit_prewake={emit_prewake} "
                f"wake_active_ms={wake_active_ms} wake_max_pos={wake_max_pos}"
            )
        except Exception:
            pass

    outq: queue.Queue[dict] = queue.Queue()
    stop_flag = threading.Event()
    final_emitted = threading.Event()

    def emit(payload: dict) -> None:
        try:
            payload.setdefault("request_id", request_id)
            outq.put(payload)
        except Exception:
            pass

    class _Cb(RecognitionCallback):
        def __init__(self):
            super().__init__()
            self._wake_word = wake_word
            self._wake_word_norm = wake_word_norm
            self._wake_prev_norm = ""
            self._wake_last_ms = 0
            self._awakened = not bool(self._wake_word_norm)
            self._awaken_deadline_ms = 0
            self._last_awake_text = ""
            self._final_sent = False

        def _reset_wake(self) -> None:
            self._wake_prev_norm = ""
            self._awakened = not bool(self._wake_word_norm)
            self._awaken_deadline_ms = 0
            self._last_awake_text = ""
            self._final_sent = False

        def _record_wake_event(self, normalized_text: str) -> bool:
            if not self._wake_word or not wake_word_service:
                return True
            try:
                res = wake_word_service.detect(
                    text=normalized_text,
                    client_id=client_id,
                    wake_words=[self._wake_word],
                    cooldown_ms=wake_cooldown_ms,
                    match_mode=wake_match_mode,
                    now_ms=int(time.time() * 1000),
                )
            except Exception as exc:
                if logger:
                    logger.warning(f"[{request_id}] wake_word_detect_error err={exc}", exc_info=True)
                return True
            if not res.detected:
                if res.cooldown_ms_remaining > 0 and event_store:
                    event_store.emit(
                        request_id=request_id,
                        client_id=client_id,
                        kind="wake",
                        name="wake_word_cooldown",
                        cooldown_ms_remaining=res.cooldown_ms_remaining,
                    )
                    emit({"type": "info", "message": f"Wake word cooldown ({res.cooldown_ms_remaining}ms)"})
                return False
            if event_store:
                event_store.emit(
                    request_id=request_id,
                    client_id=client_id,
                    kind="wake",
                    name="wake_word_detected",
                    wake_word=res.wake_word,
                )
            return True

        def on_open(self) -> None:
            if self._wake_word_norm:
                emit({"type": "info", "message": f"请先说唤醒词：{self._wake_word}"})
            else:
                emit({"type": "info", "message": "ASR 服务就绪，请说话"})

        def on_complete(self) -> None:
            if continuous:
                return
            if self._final_sent:
                return
            t = str(self._last_awake_text or "").strip()
            if not t:
                return
            emit({"type": "final", "text": t})
            self._final_sent = True
            final_emitted.set()

        def on_error(self, message) -> None:
            err_msg = getattr(message, "message", message)
            emit({"type": "error", "error": str(err_msg)})

        def on_event(self, result: "RecognitionResult") -> None:
            sentence = result.get_sentence()
            if not isinstance(sentence, dict):
                return
            text = sentence.get("text")
            if not text:
                return
            is_final = bool(RecognitionResult.is_sentence_end(sentence))

            if not self._awakened:
                if emit_prewake:
                    emit({"type": "partial", "text": str(text), "prewake": True})

                if self._wake_word_norm:
                    now_ms = int(time.time() * 1000)
                    if self._wake_last_ms and (now_ms - self._wake_last_ms) > 1500:
                        # Prevent accidental wake across long gaps / sentence boundaries in streaming partials.
                        self._wake_prev_norm = ""
                    self._wake_last_ms = now_ms
                    text_norm, mapping = _normalize_with_mapping(str(text))
                    if not text_norm:
                        return

                    # DashScope partials are often "cumulative" (each partial repeats the full text so far).
                    # Treat those as replacements, not appends, otherwise concatenation can create false
                    # wake-word matches across duplicated partial boundaries.
                    prev = self._wake_prev_norm
                    if prev and text_norm.startswith(prev):
                        combined = text_norm
                        buf_len = 0
                    else:
                        # For non-cumulative streams, only keep a small tail to allow cross-boundary matching
                        # without unbounded concatenation.
                        tail_len = max(0, len(self._wake_word_norm) - 1)
                        tail_len = min(64, tail_len)
                        tail = prev[-tail_len:] if (prev and tail_len > 0) else ""
                        combined = tail + text_norm
                        buf_len = len(tail)

                    match_at = combined.find(self._wake_word_norm)
                    if match_at != -1 and match_at > wake_max_pos:
                        match_at = -1

                    if match_at != -1:
                        if wake_debug:
                            try:
                                logger.info(
                                    f"[{request_id}] wake_candidate client_id={client_id} mode={wake_match_mode} "
                                    f"combined_len={len(combined)} match_at={match_at} buf_len={buf_len} "
                                    f"is_final={is_final} wake_active_ms={wake_active_ms}"
                                )
                            except Exception:
                                pass

                    if match_at != -1 and self._record_wake_event(combined):
                        self._awakened = True
                        self._wake_prev_norm = ""
                        self._awaken_deadline_ms = now_ms + int(wake_active_ms)
                        emit({"type": "wake", "wake_word": self._wake_word})

                        match_end = match_at + len(self._wake_word_norm)
                        if match_end <= buf_len:
                            remaining = str(text).strip()
                        else:
                            wake_chars_in_current = match_end - buf_len
                            if wake_chars_in_current <= 0:
                                remaining = str(text).strip()
                            elif wake_chars_in_current <= len(mapping):
                                cut_at = mapping[wake_chars_in_current - 1]
                                remaining = str(text)[cut_at + 1 :].strip()
                            else:
                                remaining = ""
                        if remaining:
                            emit({"type": "partial" if not is_final else "final", "text": remaining})
                            if is_final and not continuous:
                                self._final_sent = True
                                final_emitted.set()
                        return

                    max_keep = max(len(self._wake_word_norm) * 2, 32)
                    self._wake_prev_norm = combined[-max_keep:]
                if is_final:
                    self._wake_prev_norm = ""
                return

            # Awakened: only forward output while the flag is alive.
            now_ms = int(time.time() * 1000)
            if self._awaken_deadline_ms and now_ms > self._awaken_deadline_ms:
                self._reset_wake()
                return
            # Sliding window: any valid ASR output keeps the session awake.
            if self._awaken_deadline_ms:
                self._awaken_deadline_ms = now_ms + int(wake_active_ms)

            emit({"type": "final" if is_final else "partial", "text": str(text)})
            self._last_awake_text = str(text)
            if is_final:
                self._final_sent = True
                if continuous:
                    # In continuous wake-word mode, keep awakened until idle timeout instead of
                    # forcing the user to say wake word for every sentence.
                    pass
                else:
                    final_emitted.set()

    callback = _Cb()
    recognition = Recognition(
        model=model,
        format="pcm",
        sample_rate=sample_rate,
        semantic_punctuation_enabled=False,
        callback=callback,
    )

    def sender_loop() -> None:
        while not stop_flag.is_set():
            if cancel_event.is_set():
                stop_flag.set()
                break
            try:
                msg = outq.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                ws.send(json.dumps(msg, ensure_ascii=False))
            except Exception:
                stop_flag.set()
                break

    sender = threading.Thread(target=sender_loop, daemon=True)
    sender.start()

    try:
        recognition.start()
        if first_audio:
            try:
                recognition.send_audio_frame(first_audio)
            except Exception as e:
                emit({"type": "error", "error": str(e)})
                return

        last_recv = time.time()
        while True:
            if stop_flag.is_set() or cancel_event.is_set():
                break
            # If the client keeps sending audio (including silence), ensure we can drop back
            # to "waiting for wake word" after the awake TTL elapses.
            if continuous:
                try:
                    now_ms = int(time.time() * 1000)
                    if getattr(callback, "_awaken_deadline_ms", 0) and now_ms > int(getattr(callback, "_awaken_deadline_ms", 0)):
                        callback._reset_wake()
                        # Don't spam UI: only tell clients in debug/when prewake is enabled.
                        if wake_debug or emit_prewake:
                            emit({"type": "info", "message": f"请先说唤醒词：{wake_word}"})
                except Exception:
                    pass
            try:
                data = ws.receive()
            except Exception:
                stop_flag.set()
                break
            if data is None:
                stop_flag.set()
                break
            last_recv = time.time()

            if isinstance(data, str):
                try:
                    ctrl = json.loads(data)
                except Exception:
                    ctrl = None
                if isinstance(ctrl, dict):
                    t = str(ctrl.get("type") or "").lower()
                    if t in ("stop", "cancel"):
                        stop_flag.set()
                        break
                continue
            if isinstance(data, (bytes, bytearray)):
                try:
                    recognition.send_audio_frame(bytes(data))
                except Exception as e:
                    emit({"type": "error", "error": str(e)})
                    stop_flag.set()
                    break

            if not continuous and (time.time() - last_recv) > 20:
                stop_flag.set()
                break
    finally:
        try:
            recognition.stop()
        except Exception:
            pass

        if not continuous:
            # Don't block shutdown too long: DashScope may delay "sentence_end" / on_complete.
            # For interactive UX, emit a best-effort final from the last partial after a short wait.
            got_final = final_emitted.wait(timeout=asr_final_wait_s)
            if (not got_final) and asr_force_final_on_stop and (not cancel_event.is_set()):
                try:
                    if not getattr(callback, "_final_sent", False):
                        t = str(getattr(callback, "_last_awake_text", "") or "").strip()
                        if t:
                            emit({"type": "final", "text": t})
                            setattr(callback, "_final_sent", True)
                            final_emitted.set()
                except Exception:
                    pass

        stop_flag.set()
        try:
            sender.join(timeout=1.0)
        except Exception:
            pass

        if event_store:
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="asr",
                name="asr_ws_done",
                cancelled=bool(cancel_event.is_set()),
            )
        if request_registry:
            request_registry.clear_active(client_id=client_id, kind="asr", request_id=request_id)

        # Explicitly close the WebSocket to finish the protocol cleanly.
        # (Some browsers may log protocol errors if the TCP socket is torn down abruptly.)
        with contextlib.suppress(Exception):
            ws.close()
