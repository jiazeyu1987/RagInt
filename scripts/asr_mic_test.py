from __future__ import annotations

import argparse
import base64
import hashlib
import json
import secrets
import socket
import ssl
import sys
import threading
import time
import urllib.parse
import uuid


def _build_ws_key() -> str:
    return base64.b64encode(secrets.token_bytes(16)).decode("ascii")


def _expected_accept(key: str) -> str:
    magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    digest = hashlib.sha1((key + magic).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def _read_http_response(sock: socket.socket, timeout_s: float) -> tuple[str, dict[str, str]]:
    sock.settimeout(timeout_s)
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
        if len(data) > 1024 * 256:
            break
    head, _, _ = data.partition(b"\r\n\r\n")
    header_lines = head.split(b"\r\n")
    status = header_lines[0].decode("iso-8859-1", errors="replace") if header_lines else ""
    headers: dict[str, str] = {}
    for line in header_lines[1:]:
        if b":" not in line:
            continue
        k, v = line.split(b":", 1)
        headers[k.decode("iso-8859-1").strip().lower()] = v.decode("iso-8859-1").strip()
    return status, headers


def _ws_send_frame(sock: socket.socket, opcode: int, payload: bytes) -> None:
    # Client -> server MUST be masked (RFC6455).
    fin = 0x80
    mask_bit = 0x80
    header = bytearray()
    header.append(fin | (opcode & 0x0F))
    ln = len(payload)
    if ln < 126:
        header.append(mask_bit | ln)
    elif ln <= 0xFFFF:
        header.append(mask_bit | 126)
        header += ln.to_bytes(2, "big")
    else:
        header.append(mask_bit | 127)
        header += ln.to_bytes(8, "big")
    mask = secrets.token_bytes(4)
    header += mask
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def _ws_recv_frame(sock: socket.socket, timeout_s: float) -> tuple[int, bytes] | None:
    try:
        sock.settimeout(timeout_s)
        b1 = sock.recv(1)
        if not b1:
            return None
        b2 = sock.recv(1)
        if not b2:
            return None
    except (socket.timeout, OSError):
        return None

    first = b1[0]
    second = b2[0]
    opcode = first & 0x0F
    masked = (second & 0x80) != 0
    ln = second & 0x7F
    if ln == 126:
        ln = int.from_bytes(sock.recv(2), "big")
    elif ln == 127:
        ln = int.from_bytes(sock.recv(8), "big")
    mask = sock.recv(4) if masked else b""
    payload = b""
    while len(payload) < ln:
        chunk = sock.recv(min(4096, ln - len(payload)))
        if not chunk:
            break
        payload += chunk
    if masked and mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


def _connect_ws(url: str, timeout_s: float) -> socket.socket:
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("ws", "wss"):
        raise ValueError(f"bad_ws_scheme: {u.scheme}")
    host = u.hostname or "localhost"
    port = int(u.port or (443 if u.scheme == "wss" else 80))
    path = u.path or "/"
    if u.query:
        path = f"{path}?{u.query}"

    raw_sock = socket.create_connection((host, port), timeout=timeout_s)
    if u.scheme == "wss":
        ctx = ssl.create_default_context()
        sock: socket.socket = ctx.wrap_socket(raw_sock, server_hostname=host)
    else:
        sock = raw_sock

    key = _build_ws_key()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    )
    sock.sendall(req.encode("ascii"))
    status, headers = _read_http_response(sock, timeout_s=timeout_s)
    if not status.startswith("HTTP/1.1 101"):
        raise RuntimeError(f"ws_handshake_failed: {status}")
    expected = _expected_accept(key)
    if headers.get("sec-websocket-accept", "") != expected:
        raise RuntimeError("ws_handshake_accept_mismatch")
    return sock


def main() -> int:
    ap = argparse.ArgumentParser(description="Mic -> /ws/asr realtime ASR test (simulates frontend).")
    ap.add_argument("--url", default="ws://localhost:8000/ws/asr", help="WebSocket URL, e.g. ws://localhost:8000/ws/asr")
    ap.add_argument("--client-id", default="mic_test", help="client_id sent to backend")
    ap.add_argument("--request-id", default="", help="request_id (auto if empty)")
    ap.add_argument("--seconds", type=float, default=8.0, help="record duration seconds (Ctrl+C to stop)")
    ap.add_argument("--device-index", type=int, default=-1, help="PyAudio input device index (-1 = default)")
    ap.add_argument("--chunk-ms", type=int, default=20, help="audio chunk size ms (20ms recommended)")
    ap.add_argument("--timeout", type=float, default=5.0, help="socket recv timeout seconds")
    ap.add_argument("--wake-word", default="", help="Enable wake-word mode with this wake word (e.g. 你好小R)")
    ap.add_argument("--wake-match-mode", default="contains", choices=["contains", "prefix"], help="Wake word match mode")
    ap.add_argument("--wake-cooldown-ms", type=int, default=0, help="Wake cooldown per client_id (ms)")
    ap.add_argument("--emit-prewake", action="store_true", help="Emit prewake partials (debug)")
    ap.add_argument("--continuous", action="store_true", help="Keep session open after final (for wake-word continuous mode)")
    args = ap.parse_args()

    try:
        import pyaudio  # type: ignore
    except Exception as e:
        print(f"missing_pyaudio: {e}", file=sys.stderr)
        print("hint: pip install pyaudio", file=sys.stderr)
        return 2

    request_id = str(args.request_id).strip() or f"mic_{uuid.uuid4().hex}"
    ws = _connect_ws(str(args.url), timeout_s=float(args.timeout))

    wake_word = str(args.wake_word or "").strip()
    wake_enabled = bool(wake_word)

    start_msg = {
        "type": "start",
        "request_id": request_id,
        "client_id": str(args.client_id),
        "sample_rate": 16000,
        "encoding": "pcm_s16le",
        "continuous": bool(args.continuous),
        "wake_word_enabled": wake_enabled,
        "wake_word": wake_word,
        "wake_match_mode": str(args.wake_match_mode),
        "wake_cooldown_ms": max(0, int(args.wake_cooldown_ms)),
        "emit_prewake": bool(args.emit_prewake),
    }
    _ws_send_frame(ws, 0x1, json.dumps(start_msg, ensure_ascii=False).encode("utf-8"))

    stop = threading.Event()
    final_text = {"value": ""}

    def recv_loop() -> None:
        try:
            while not stop.is_set():
                frame = _ws_recv_frame(ws, timeout_s=float(args.timeout))
                if frame is None:
                    continue
                opcode, payload = frame
                if opcode == 0x8:
                    stop.set()
                    return
                if opcode != 0x1:
                    continue
                try:
                    msg = json.loads(payload.decode("utf-8", errors="replace"))
                except Exception:
                    continue
                t = str(msg.get("type") or "").lower()
                if t == "partial":
                    txt = str(msg.get("text") or "").strip()
                    if txt:
                        print(f"[partial] {txt}")
                elif t == "final":
                    txt = str(msg.get("text") or "").strip()
                    final_text["value"] = txt
                    if txt:
                        print(f"[final] {txt}")
                    if not bool(args.continuous):
                        stop.set()
                        return
                elif t == "wake":
                    ww = str(msg.get("wake_word") or "").strip()
                    print(f"[wake] {ww}" if ww else "[wake]")
                elif t == "error":
                    print(f"[error] {msg.get('error')}", file=sys.stderr)
                    stop.set()
                    return
                elif t == "info":
                    m = str(msg.get("message") or "").strip()
                    if m:
                        print(f"[info] {m}")
        except Exception as e:
            print(f"recv_loop_failed: {e}", file=sys.stderr)
            stop.set()

    t_recv = threading.Thread(target=recv_loop, daemon=True)
    t_recv.start()

    pa = pyaudio.PyAudio()
    frames_per_buffer = int(16000 * max(5, min(200, int(args.chunk_ms))) / 1000.0)
    if frames_per_buffer <= 0:
        frames_per_buffer = 320

    stream = None
    try:
        stream = pa.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            input=True,
            frames_per_buffer=frames_per_buffer,
            input_device_index=None if int(args.device_index) < 0 else int(args.device_index),
        )
    except Exception as e:
        print(f"open_mic_failed: {e}", file=sys.stderr)
        try:
            pa.terminate()
        except Exception:
            pass
        return 2

    print("recording... (speak now)")
    t_end = time.time() + max(0.3, float(args.seconds))
    try:
        while time.time() < t_end and not stop.is_set():
            buf = stream.read(frames_per_buffer, exception_on_overflow=False)
            if not buf:
                continue
            _ws_send_frame(ws, 0x2, buf)
    except KeyboardInterrupt:
        stop.set()
    except Exception as e:
        print(f"stream_failed: {e}", file=sys.stderr)
        stop.set()
    finally:
        try:
            if stream is not None:
                stream.stop_stream()
                stream.close()
        except Exception:
            pass
        try:
            pa.terminate()
        except Exception:
            pass

    # Give the server a brief moment to finalize.
    with threading.Lock():
        pass
    stop.set()
    t_recv.join(timeout=2.0)
    try:
        _ws_send_frame(ws, 0x8, b"")
    except Exception:
        pass
    try:
        ws.close()
    except Exception:
        pass

    if final_text["value"]:
        print(final_text["value"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
