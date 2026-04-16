from __future__ import annotations

import asyncio
import gzip
import json
import queue
import struct
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any

from flask import request

DEFAULT_SAMPLE_RATE = 16000
DEFAULT_CHANNELS = 1
DEFAULT_BITS = 16
DEFAULT_SEGMENT_DURATION_MS = 200
DEFAULT_MODEL_NAME = "bigmodel"
DEFAULT_WARMUP_FRAME_MS = 20


class _ProtocolVersion:
    V1 = 0b0001


class _MessageType:
    CLIENT_FULL_REQUEST = 0b0001
    CLIENT_AUDIO_ONLY_REQUEST = 0b0010
    SERVER_FULL_RESPONSE = 0b1001
    SERVER_ERROR_RESPONSE = 0b1111


class _MessageFlags:
    POS_SEQUENCE = 0b0001
    NEG_WITH_SEQUENCE = 0b0011


class _SerializationType:
    JSON = 0b0001


class _CompressionType:
    GZIP = 0b0001


_QUEUE_EMPTY = object()


@dataclass
class SaucStartConfig:
    ws_url: str
    resource_id: str
    app_key: str
    access_key: str
    model_name: str = DEFAULT_MODEL_NAME
    seg_duration_ms: int = DEFAULT_SEGMENT_DURATION_MS
    enable_itn: bool = True
    enable_punc: bool = True
    enable_ddc: bool = True
    show_utterances: bool = True
    enable_nonstream: bool = False


def _safe_trim(value: Any) -> str:
    return str(value or "").strip()


def _to_int(value: Any, fallback: int, *, min_value: int, max_value: int) -> int:
    try:
        n = int(round(float(value)))
    except Exception:
        return fallback
    return max(min_value, min(max_value, n))


def _to_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = _safe_trim(value).lower()
    if not text:
        return bool(fallback)
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return bool(fallback)


def _gzip_compress(data: bytes) -> bytes:
    return gzip.compress(data)


def _gzip_decompress(data: bytes) -> bytes:
    return gzip.decompress(data)


def _build_header(*, message_type: int, message_flags: int) -> bytes:
    header = bytearray()
    header.append((_ProtocolVersion.V1 << 4) | 1)
    header.append((message_type << 4) | message_flags)
    header.append((_SerializationType.JSON << 4) | _CompressionType.GZIP)
    header.append(0x00)
    return bytes(header)


def _build_full_request(*, seq: int, cfg: SaucStartConfig) -> bytes:
    payload = {
        "user": {"uid": "ragint_web"},
        "audio": {
            "format": "pcm",
            "codec": "raw",
            "rate": DEFAULT_SAMPLE_RATE,
            "bits": DEFAULT_BITS,
            "channel": DEFAULT_CHANNELS,
        },
        "request": {
            "model_name": cfg.model_name,
            "enable_itn": bool(cfg.enable_itn),
            "enable_punc": bool(cfg.enable_punc),
            "enable_ddc": bool(cfg.enable_ddc),
            "show_utterances": bool(cfg.show_utterances),
            "enable_nonstream": bool(cfg.enable_nonstream),
        },
    }
    payload_bytes = _gzip_compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    packet = bytearray()
    packet.extend(_build_header(message_type=_MessageType.CLIENT_FULL_REQUEST, message_flags=_MessageFlags.POS_SEQUENCE))
    packet.extend(struct.pack(">i", seq))
    packet.extend(struct.pack(">I", len(payload_bytes)))
    packet.extend(payload_bytes)
    return bytes(packet)


def _build_audio_request(*, seq: int, audio: bytes, is_last: bool) -> bytes:
    flags = _MessageFlags.NEG_WITH_SEQUENCE if is_last else _MessageFlags.POS_SEQUENCE
    send_seq = -abs(seq) if is_last else int(seq)
    payload = _gzip_compress(bytes(audio or b""))
    packet = bytearray()
    packet.extend(_build_header(message_type=_MessageType.CLIENT_AUDIO_ONLY_REQUEST, message_flags=flags))
    packet.extend(struct.pack(">i", send_seq))
    packet.extend(struct.pack(">I", len(payload)))
    packet.extend(payload)
    return bytes(packet)


def _parse_sauc_response(raw: bytes) -> dict[str, Any]:
    out: dict[str, Any] = {
        "code": 0,
        "event": 0,
        "is_last_package": False,
        "payload_sequence": 0,
        "payload_msg": None,
    }
    if not isinstance(raw, (bytes, bytearray)) or len(raw) < 4:
        return out

    msg = bytes(raw)
    header_size = msg[0] & 0x0F
    message_type = msg[1] >> 4
    flags = msg[1] & 0x0F
    serialization = msg[2] >> 4
    compression = msg[2] & 0x0F

    payload = msg[header_size * 4 :]
    if flags & 0x01 and len(payload) >= 4:
        out["payload_sequence"] = struct.unpack(">i", payload[:4])[0]
        payload = payload[4:]
    if flags & 0x02:
        out["is_last_package"] = True
    if flags & 0x04 and len(payload) >= 4:
        out["event"] = struct.unpack(">i", payload[:4])[0]
        payload = payload[4:]

    if message_type == _MessageType.SERVER_FULL_RESPONSE:
        if len(payload) < 4:
            return out
        payload = payload[4:]
    elif message_type == _MessageType.SERVER_ERROR_RESPONSE:
        if len(payload) < 8:
            return out
        out["code"] = struct.unpack(">i", payload[:4])[0]
        payload = payload[8:]
    if not payload:
        return out

    if compression == _CompressionType.GZIP:
        try:
            payload = _gzip_decompress(payload)
        except Exception:
            return out

    if serialization == _SerializationType.JSON:
        try:
            out["payload_msg"] = json.loads(payload.decode("utf-8"))
        except Exception:
            out["payload_msg"] = None
    return out


def _extract_utterances_text(utterances: Any) -> str:
    if not isinstance(utterances, list):
        return ""
    latest = ""
    for item in utterances:
        if not isinstance(item, dict):
            continue
        for key in ("text", "sentence_text", "display_text", "transcript"):
            text = _safe_trim(item.get(key))
            if text:
                latest = text
                break
    return latest


def _collect_text_candidates(node: Any, out: list[str], *, depth: int = 0) -> None:
    if depth > 6:
        return

    if isinstance(node, str):
        text = _safe_trim(node)
        if text:
            out.append(text)
        return

    if isinstance(node, list):
        for item in node:
            _collect_text_candidates(item, out, depth=depth + 1)
        return

    if not isinstance(node, dict):
        return

    for key in ("text", "transcript", "sentence", "sentence_text", "display_text"):
        text = _safe_trim(node.get(key))
        if text:
            out.append(text)

    utt_text = _extract_utterances_text(node.get("utterances"))
    if utt_text:
        out.append(utt_text)

    for key in ("result", "results", "alternatives", "nbest", "hypotheses", "payload", "data"):
        if key in node:
            _collect_text_candidates(node.get(key), out, depth=depth + 1)


def _extract_transcript_text(payload_msg: Any) -> str:
    if not isinstance(payload_msg, (dict, list, str)):
        return ""
    candidates: list[str] = []
    _collect_text_candidates(payload_msg, candidates)

    if not candidates:
        return ""
    return max(candidates, key=len)


def _incremental_delta(previous: str, current: str) -> str:
    if not current:
        return ""
    if not previous:
        return current
    if current.startswith(previous):
        return current[len(previous) :]
    prefix = 0
    limit = min(len(previous), len(current))
    while prefix < limit and previous[prefix] == current[prefix]:
        prefix += 1
    if prefix > 0:
        return current[prefix:]
    return current


def _friendly_error_message(code: int) -> str:
    if code == 45000151:
        return "sauc_error_45000151_audio_format_mismatch"
    if code == 45000002:
        return "sauc_error_45000002_empty_audio"
    if code == 45000001:
        return "sauc_error_45000001_invalid_request"
    if code:
        return f"sauc_error_{int(code)}"
    return "sauc_error_unknown"


def _parse_client_message(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, str):
        text = raw
    elif isinstance(raw, (bytes, bytearray)):
        try:
            text = bytes(raw).decode("utf-8")
        except Exception:
            return None
    else:
        return None
    try:
        data = json.loads(text)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _normalize_start_config(raw: Any) -> tuple[SaucStartConfig | None, str | None]:
    data = raw if isinstance(raw, dict) else {}
    ws_url = _safe_trim(data.get("ws_url"))
    resource_id = _safe_trim(data.get("resource_id"))
    app_key = _safe_trim(data.get("app_key"))
    access_key = _safe_trim(data.get("access_key"))
    if not ws_url or not resource_id or not app_key or not access_key:
        return None, "sauc_config_required_fields_missing"

    cfg = SaucStartConfig(
        ws_url=ws_url,
        resource_id=resource_id,
        app_key=app_key,
        access_key=access_key,
        model_name=_safe_trim(data.get("model_name")) or DEFAULT_MODEL_NAME,
        seg_duration_ms=_to_int(data.get("seg_duration_ms"), DEFAULT_SEGMENT_DURATION_MS, min_value=50, max_value=1000),
        enable_itn=_to_bool(data.get("enable_itn"), True),
        enable_punc=_to_bool(data.get("enable_punc"), True),
        enable_ddc=_to_bool(data.get("enable_ddc"), True),
        show_utterances=_to_bool(data.get("show_utterances"), True),
        enable_nonstream=_to_bool(data.get("enable_nonstream"), False),
    )
    return cfg, None


def _queue_get(q: queue.Queue[Any], timeout_s: float) -> Any:
    try:
        return q.get(timeout=timeout_s)
    except queue.Empty:
        return _QUEUE_EMPTY


def _queue_put_drop_oldest(q: queue.Queue[Any], item: Any) -> None:
    try:
        q.put_nowait(item)
        return
    except queue.Full:
        pass
    try:
        q.get_nowait()
    except Exception:
        pass
    try:
        q.put_nowait(item)
    except Exception:
        # Best effort.
        pass


def _build_ws_handshake_hints(environ: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "REQUEST_METHOD",
        "HTTP_UPGRADE",
        "HTTP_CONNECTION",
        "HTTP_SEC_WEBSOCKET_KEY",
        "HTTP_SEC_WEBSOCKET_VERSION",
        "SERVER_SOFTWARE",
    ]
    out: dict[str, Any] = {}
    for k in keys:
        v = environ.get(k)
        if v is None:
            continue
        text = str(v).strip()
        if text:
            out[k] = text
    # Implementation-specific socket handles used by simple-websocket.
    out["has_werkzeug_socket"] = "werkzeug.socket" in environ
    out["has_gunicorn_socket"] = "gunicorn.socket" in environ
    out["has_eventlet_input"] = "eventlet.input" in environ
    out["has_wsgi_websocket"] = "wsgi.websocket" in environ
    return out


def _wait_client_close(ws, *, wait_s: float = 1.0) -> None:
    deadline = time.monotonic() + max(0.05, float(wait_s or 0.0))
    while time.monotonic() < deadline:
        try:
            raw = ws.receive(timeout=0.1)
        except TimeoutError:
            continue
        except Exception:
            break
        if raw is None:
            break


async def _run_sauc_proxy_async(
    *,
    cfg: SaucStartConfig,
    request_id: str,
    audio_queue: queue.Queue[Any],
    events_queue: queue.Queue[Any],
    stop_event: threading.Event,
    logger,
    set_stage=None,
) -> None:
    import aiohttp

    timeout = aiohttp.ClientTimeout(total=None, connect=10, sock_read=None)
    connect_id = str(uuid.uuid4())
    upstream_headers = {
        "X-Api-Resource-Id": cfg.resource_id,
        "X-Api-Request-Id": request_id or str(uuid.uuid4()),
        "X-Api-Connect-Id": connect_id,
        "X-Api-Access-Key": cfg.access_key,
        "X-Api-App-Key": cfg.app_key,
    }

    seq = 1
    last_text = ""
    sent_last = False
    bytes_per_sample = max(1, DEFAULT_BITS // 8)
    warmup_bytes = int(DEFAULT_SAMPLE_RATE * DEFAULT_CHANNELS * bytes_per_sample * (DEFAULT_WARMUP_FRAME_MS / 1000.0))
    if warmup_bytes <= 0:
        warmup_bytes = 640
    warmup_frame = b"\x00" * warmup_bytes

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.ws_connect(cfg.ws_url, headers=upstream_headers, heartbeat=20) as upstream:
            if callable(set_stage):
                try:
                    set_stage("upstream_connected", extra={"connect_id": connect_id})
                except Exception:
                    pass
            await upstream.send_bytes(_build_full_request(seq=seq, cfg=cfg))
            if callable(set_stage):
                try:
                    set_stage("upstream_full_request_sent")
                except Exception:
                    pass
            seq += 1

            try:
                starter = await upstream.receive(timeout=5.0)
            except asyncio.TimeoutError:
                if callable(set_stage):
                    try:
                        set_stage("upstream_startup_timeout")
                    except Exception:
                        pass
                _queue_put_drop_oldest(events_queue, {"type": "error", "message": "sauc_startup_timeout"})
                return

            if starter.type != aiohttp.WSMsgType.BINARY:
                if callable(set_stage):
                    try:
                        set_stage("upstream_startup_invalid_response", extra={"msg_type": str(starter.type)})
                    except Exception:
                        pass
                _queue_put_drop_oldest(events_queue, {"type": "error", "message": "sauc_startup_invalid_response"})
                return

            parsed_starter = _parse_sauc_response(starter.data)
            if int(parsed_starter.get("code") or 0) != 0:
                code = int(parsed_starter.get("code") or 0)
                if callable(set_stage):
                    try:
                        set_stage("upstream_startup_error_code", extra={"code": code})
                    except Exception:
                        pass
                _queue_put_drop_oldest(events_queue, {"type": "error", "code": code, "message": _friendly_error_message(code)})
                return

            if callable(set_stage):
                try:
                    set_stage("upstream_ready")
                except Exception:
                    pass
            _queue_put_drop_oldest(events_queue, {"type": "ready"})

            # Warmup with a tiny silent frame to avoid upstream immediately ending
            # the session before browser audio frames arrive.
            try:
                await upstream.send_bytes(_build_audio_request(seq=seq, audio=warmup_frame, is_last=False))
                seq += 1
                if callable(set_stage):
                    try:
                        set_stage("upstream_warmup_sent", extra={"warmup_bytes": warmup_bytes})
                    except Exception:
                        pass
            except Exception:
                if callable(set_stage):
                    try:
                        set_stage("upstream_warmup_send_failed")
                    except Exception:
                        pass

            starter_text = _extract_transcript_text(parsed_starter.get("payload_msg"))
            if starter_text:
                delta = _incremental_delta(last_text, starter_text)
                _queue_put_drop_oldest(
                    events_queue,
                    {
                        "type": "partial" if not parsed_starter.get("is_last_package") else "final",
                        "text": starter_text,
                        "delta": delta,
                    },
                )
                last_text = starter_text
                if parsed_starter.get("is_last_package"):
                    return

            done_event = asyncio.Event()

            async def recv_loop() -> None:
                nonlocal last_text
                try:
                    async for msg in upstream:
                        if msg.type == aiohttp.WSMsgType.BINARY:
                            parsed = _parse_sauc_response(msg.data)
                            code = int(parsed.get("code") or 0)
                            if code != 0:
                                if callable(set_stage):
                                    try:
                                        set_stage("upstream_stream_error_code", extra={"code": code})
                                    except Exception:
                                        pass
                                _queue_put_drop_oldest(
                                    events_queue,
                                    {"type": "error", "code": code, "message": _friendly_error_message(code)},
                                )
                                break
                            text = _extract_transcript_text(parsed.get("payload_msg"))
                            if text:
                                delta = _incremental_delta(last_text, text)
                                _queue_put_drop_oldest(
                                    events_queue,
                                    {
                                        "type": "final" if parsed.get("is_last_package") else "partial",
                                        "text": text,
                                        "delta": delta,
                                    },
                                )
                                last_text = text
                            if parsed.get("is_last_package"):
                                if callable(set_stage):
                                    try:
                                        set_stage("upstream_last_package")
                                    except Exception:
                                        pass
                                break
                        elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSING):
                            if callable(set_stage):
                                try:
                                    set_stage("upstream_closed")
                                except Exception:
                                    pass
                            break
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            if callable(set_stage):
                                try:
                                    set_stage("upstream_ws_error")
                                except Exception:
                                    pass
                            _queue_put_drop_oldest(events_queue, {"type": "error", "message": "sauc_upstream_ws_error"})
                            break
                except Exception as exc:
                    if not stop_event.is_set():
                        if callable(set_stage):
                            try:
                                set_stage("upstream_recv_failed", extra={"error": str(exc)})
                            except Exception:
                                pass
                        logger.warning("[SAUC-WS] upstream recv failed request_id=%s err=%s", request_id, exc, exc_info=True)
                        _queue_put_drop_oldest(events_queue, {"type": "error", "message": f"sauc_upstream_recv_failed:{exc}"})
                finally:
                    done_event.set()

            recv_task = asyncio.create_task(recv_loop())

            try:
                while not done_event.is_set():
                    if stop_event.is_set() and not sent_last:
                        await upstream.send_bytes(_build_audio_request(seq=seq, audio=b"", is_last=True))
                        sent_last = True

                    item = await asyncio.to_thread(_queue_get, audio_queue, 0.05)
                    if item is _QUEUE_EMPTY:
                        continue

                    if item is None:
                        if not sent_last:
                            await upstream.send_bytes(_build_audio_request(seq=seq, audio=b"", is_last=True))
                            sent_last = True
                        continue

                    if sent_last:
                        continue

                    if not isinstance(item, (bytes, bytearray)):
                        continue
                    audio_frame = bytes(item)
                    if not audio_frame:
                        continue

                    await upstream.send_bytes(_build_audio_request(seq=seq, audio=audio_frame, is_last=False))
                    seq += 1
            finally:
                if not sent_last:
                    try:
                        await upstream.send_bytes(_build_audio_request(seq=seq, audio=b"", is_last=True))
                    except Exception:
                        pass
                try:
                    await asyncio.wait_for(recv_task, timeout=5.0)
                except asyncio.TimeoutError:
                    recv_task.cancel()
                except Exception:
                    recv_task.cancel()


def register_sauc_proxy_ws(*, app, deps, logger) -> bool:
    del deps

    try:
        from flask_sock import Sock
    except Exception as exc:
        logger.warning("SAUC websocket proxy disabled: flask-sock unavailable (%s)", exc)
        return False

    endpoint_name = "ragint_sauc_ws_proxy"
    if endpoint_name in app.view_functions:
        app.config["RAGINT_SAUC_PROXY_REGISTERED"] = True
        return True

    if "RAGINT_SAUC_LAST_EVENT" not in app.config:
        app.config["RAGINT_SAUC_LAST_EVENT"] = {}
    if "RAGINT_SAUC_EVENT_HISTORY" not in app.config:
        app.config["RAGINT_SAUC_EVENT_HISTORY"] = []

    sock = None
    try:
        exts = getattr(app, "extensions", None)
        if isinstance(exts, dict):
            for key in ("sock", "flask_sock", "flask-sock"):
                candidate = exts.get(key)
                if candidate is not None and hasattr(candidate, "route"):
                    sock = candidate
                    logger.info("SAUC websocket proxy using existing Sock extension key=%s", key)
                    break
    except Exception:
        sock = None

    if sock is None:
        sock = Sock(app)
        logger.info("SAUC websocket proxy initialized dedicated Sock extension")

    def set_last_event(stage: str, *, request_id: str = "", client_id: str = "", extra: dict[str, Any] | None = None) -> None:
        prev = app.config.get("RAGINT_SAUC_LAST_EVENT")
        prev = prev if isinstance(prev, dict) else {}
        payload = {
            "stage": str(stage or "").strip(),
            "ts_ms": int(time.time() * 1000),
            "request_id": str(request_id or "").strip(),
            "client_id": str(client_id or "").strip(),
        }
        if isinstance(extra, dict):
            for k, v in extra.items():
                key = str(k or "").strip()
                if not key:
                    continue
                payload[key] = v
        prev_stage = str(prev.get("stage") or "").strip()
        if prev_stage and prev_stage != payload["stage"]:
            payload["prev_stage"] = prev_stage
            if "error" in prev:
                payload["prev_error"] = prev.get("error")
            if "code" in prev:
                payload["prev_code"] = prev.get("code")
        app.config["RAGINT_SAUC_LAST_EVENT"] = payload
        history = app.config.get("RAGINT_SAUC_EVENT_HISTORY")
        history = list(history) if isinstance(history, list) else []
        history.append(payload)
        app.config["RAGINT_SAUC_EVENT_HISTORY"] = history[-20:]
        try:
            logger.info(
                "[SAUC-WS] stage=%s request_id=%s client_id=%s extra=%s",
                payload.get("stage") or "",
                payload.get("request_id") or "",
                payload.get("client_id") or "",
                {
                    k: payload.get(k)
                    for k in ("error", "code", "prev_stage", "prev_error", "msg_type", "start_msg_type", "connect_id")
                    if k in payload
                },
            )
        except Exception:
            # best effort logging only
            pass

    @sock.route("/api/asr/sauc/ws")
    def ragint_sauc_ws_proxy(ws):
        logger.info("[SAUC-WS] connected hints=%s", _build_ws_handshake_hints(request.environ))

        request_id = _safe_trim(request.args.get("request_id")) or f"sauc_proxy_{uuid.uuid4().hex[:8]}"
        client_id = _safe_trim(request.args.get("client_id")) or _safe_trim(request.headers.get("X-Client-ID"))
        set_last_event("connected", request_id=request_id, client_id=client_id)

        logger.info("[SAUC-WS] connected request_id=%s client_id=%s", request_id, client_id or "-")

        start_raw = None
        try:
            start_raw = ws.receive()
        except Exception:
            start_raw = None
        if start_raw is None:
            logger.info("[SAUC-WS] closed_before_start request_id=%s", request_id)
            set_last_event("closed_before_start", request_id=request_id, client_id=client_id)
            return

        start_msg = _parse_client_message(start_raw)
        if not start_msg or _safe_trim(start_msg.get("type")).lower() != "start":
            try:
                ws.send(json.dumps({"type": "error", "message": "start_message_required"}))
            except Exception:
                pass
            logger.warning("[SAUC-WS] invalid_start_message request_id=%s", request_id)
            set_last_event(
                "invalid_start_message",
                request_id=request_id,
                client_id=client_id,
                extra={
                    "start_msg_type": _safe_trim(start_msg.get("type")) if isinstance(start_msg, dict) else "",
                    "start_msg_is_dict": bool(isinstance(start_msg, dict)),
                },
            )
            try:
                _wait_client_close(ws, wait_s=1.0)
            except Exception:
                pass
            return

        cfg, err = _normalize_start_config(start_msg.get("config"))
        if err or not cfg:
            try:
                ws.send(json.dumps({"type": "error", "message": str(err or "invalid_sauc_config")}))
            except Exception:
                pass
            logger.warning("[SAUC-WS] invalid_config request_id=%s err=%s", request_id, err)
            raw_cfg = start_msg.get("config") if isinstance(start_msg, dict) else None
            raw_cfg = raw_cfg if isinstance(raw_cfg, dict) else {}
            set_last_event(
                "invalid_config",
                request_id=request_id,
                client_id=client_id,
                extra={
                    "error": str(err or "invalid_sauc_config"),
                    "has_ws_url": bool(_safe_trim(raw_cfg.get("ws_url"))),
                    "has_resource_id": bool(_safe_trim(raw_cfg.get("resource_id"))),
                    "has_app_key": bool(_safe_trim(raw_cfg.get("app_key"))),
                    "has_access_key": bool(_safe_trim(raw_cfg.get("access_key"))),
                },
            )
            try:
                _wait_client_close(ws, wait_s=1.0)
            except Exception:
                pass
            return

        set_last_event(
            "config_ok",
            request_id=request_id,
            client_id=client_id,
            extra={"seg_duration_ms": int(cfg.seg_duration_ms)},
        )

        audio_queue: queue.Queue[Any] = queue.Queue(maxsize=512)
        events_queue: queue.Queue[Any] = queue.Queue(maxsize=256)
        stop_event = threading.Event()
        first_client_audio_seen = False

        def flush_events() -> bool:
            """
            Send queued upstream events to browser in the same thread that calls ws.receive().
            This avoids cross-thread access to the flask_sock websocket object.
            """
            while True:
                try:
                    item = events_queue.get_nowait()
                except queue.Empty:
                    return True
                if item is None:
                    set_last_event("event_queue_closed", request_id=request_id, client_id=client_id)
                    return False
                try:
                    if isinstance(item, dict):
                        t = _safe_trim(item.get("type")).lower()
                        if t == "ready":
                            set_last_event("ready_sent", request_id=request_id, client_id=client_id)
                        elif t == "error":
                            set_last_event(
                                "error_sent",
                                request_id=request_id,
                                client_id=client_id,
                                extra={"error": _safe_trim(item.get("message")), "code": item.get("code")},
                            )
                    ws.send(json.dumps(item, ensure_ascii=False))
                except Exception:
                    set_last_event("send_to_client_failed", request_id=request_id, client_id=client_id)
                    return False

        def upstream_loop() -> None:
            try:
                asyncio.run(
                    _run_sauc_proxy_async(
                        cfg=cfg,
                        request_id=request_id,
                        audio_queue=audio_queue,
                        events_queue=events_queue,
                        stop_event=stop_event,
                        logger=logger,
                        set_stage=lambda stage, extra=None: set_last_event(
                            stage,
                            request_id=request_id,
                            client_id=client_id,
                            extra=(extra if isinstance(extra, dict) else None),
                        ),
                    )
                )
            except Exception as exc:
                logger.warning("[SAUC-WS] upstream_failed request_id=%s err=%s", request_id, exc, exc_info=True)
                set_last_event(
                    "upstream_failed",
                    request_id=request_id,
                    client_id=client_id,
                    extra={"error": str(exc)},
                )
                _queue_put_drop_oldest(events_queue, {"type": "error", "message": f"sauc_proxy_failed:{exc}"})
            finally:
                set_last_event("upstream_loop_closed", request_id=request_id, client_id=client_id)
                _queue_put_drop_oldest(events_queue, {"type": "state", "stage": "closed", "message": "sauc_proxy_closed"})
                _queue_put_drop_oldest(events_queue, None)
                stop_event.set()

        upstream_thread = threading.Thread(target=upstream_loop, daemon=True)
        upstream_thread.start()
        client_none_since = 0.0
        client_none_logged = False

        try:
            while True:
                if not flush_events():
                    set_last_event("event_queue_closed", request_id=request_id, client_id=client_id)
                    break
                if stop_event.is_set():
                    try:
                        if events_queue.empty():
                            break
                    except Exception:
                        break
                    time.sleep(0.01)
                    continue
                try:
                    raw = ws.receive(timeout=0.05)
                except TimeoutError:
                    continue
                except TypeError:
                    logger.warning(
                        "[SAUC-WS] ws_receive_timeout_unsupported request_id=%s. "
                        "simple-websocket version may be too old.",
                        request_id,
                    )
                    try:
                        ws.send(json.dumps({"type": "error", "message": "server_ws_receive_timeout_unsupported"}))
                    except Exception:
                        pass
                    set_last_event("ws_receive_timeout_unsupported", request_id=request_id, client_id=client_id)
                    break
                except Exception:
                    set_last_event("ws_receive_failed", request_id=request_id, client_id=client_id)
                    break
                if raw is None:
                    now = time.monotonic()
                    # On some simple-websocket versions, `receive(timeout=...)` may return
                    # None for timeout/no-data. Treat None as "no frame yet" unless we can
                    # explicitly tell the socket is disconnected.
                    connected = True
                    try:
                        if hasattr(ws, "connected"):
                            connected = bool(getattr(ws, "connected"))
                    except Exception:
                        connected = True

                    if not connected:
                        if client_none_since <= 0:
                            client_none_since = now
                        if (now - client_none_since) >= 0.3:
                            set_last_event(
                                "client_closed",
                                request_id=request_id,
                                client_id=client_id,
                                extra={"none_grace_ms": int((now - client_none_since) * 1000)},
                            )
                            break
                        time.sleep(0.01)
                        continue

                    if not client_none_logged:
                        client_none_logged = True
                        if client_none_since <= 0:
                            client_none_since = now
                        set_last_event("client_receive_none", request_id=request_id, client_id=client_id)
                    time.sleep(0.005)
                    continue
                client_none_since = 0.0
                client_none_logged = False

                if isinstance(raw, (bytes, bytearray)):
                    if stop_event.is_set():
                        continue
                    if not first_client_audio_seen:
                        first_client_audio_seen = True
                        set_last_event("client_audio_frame", request_id=request_id, client_id=client_id)
                    _queue_put_drop_oldest(audio_queue, bytes(raw))
                    continue

                msg = _parse_client_message(raw)
                if not msg:
                    set_last_event("client_text_parse_failed", request_id=request_id, client_id=client_id)
                    continue
                msg_type = _safe_trim(msg.get("type")).lower()
                if msg_type == "ping":
                    set_last_event("client_ping", request_id=request_id, client_id=client_id)
                    _queue_put_drop_oldest(events_queue, {"type": "pong"})
                    continue
                if msg_type == "stop":
                    set_last_event("client_stop", request_id=request_id, client_id=client_id)
                    _queue_put_drop_oldest(audio_queue, None)
                    continue
                if msg_type == "cancel":
                    set_last_event("client_cancel", request_id=request_id, client_id=client_id)
                    stop_event.set()
                    _queue_put_drop_oldest(audio_queue, None)
                    continue
        finally:
            stop_event.set()
            _queue_put_drop_oldest(audio_queue, None)
            _queue_put_drop_oldest(events_queue, None)
            try:
                upstream_thread.join(timeout=2.0)
            except Exception:
                pass
            logger.info("[SAUC-WS] disconnected request_id=%s", request_id)
            set_last_event("disconnected", request_id=request_id, client_id=client_id)

        return

    app.config["RAGINT_SAUC_PROXY_REGISTERED"] = True
    return True
