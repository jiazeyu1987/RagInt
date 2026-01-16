from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import socket
import ssl
import sys
import time
import urllib.parse
import wave


def _build_ws_key() -> str:
    return base64.b64encode(secrets.token_bytes(16)).decode("ascii")


def _expected_accept(key: str) -> str:
    magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    digest = hashlib.sha1((key + magic).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def _read_http_response(sock: socket.socket, timeout_s: float) -> tuple[str, dict[str, str], bytes]:
    sock.settimeout(timeout_s)
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
        if len(data) > 1024 * 256:
            break
    head, _, rest = data.partition(b"\r\n\r\n")
    header_lines = head.split(b"\r\n")
    status = header_lines[0].decode("iso-8859-1", errors="replace") if header_lines else ""
    headers: dict[str, str] = {}
    for line in header_lines[1:]:
        if b":" not in line:
            continue
        k, v = line.split(b":", 1)
        headers[k.decode("iso-8859-1").strip().lower()] = v.decode("iso-8859-1").strip()
    return status, headers, rest


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
    sock.settimeout(timeout_s)
    try:
        b1 = sock.recv(1)
        if not b1:
            return None
        b2 = sock.recv(1)
        if not b2:
            return None
    except socket.timeout:
        return None

    first = b1[0]
    second = b2[0]
    fin = (first & 0x80) != 0
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
    if not fin:
        # Not expecting fragmented frames here; return what we got.
        return opcode, payload
    return opcode, payload


def main() -> int:
    ap = argparse.ArgumentParser(description="Probe /ws/asr WebSocket handshake and messages (no extra deps).")
    ap.add_argument("--url", default="ws://localhost:8000/ws/asr", help="ws://host:port/path or wss://...")
    ap.add_argument("--timeout", type=float, default=5.0, help="socket timeout seconds")
    ap.add_argument("--start", action="store_true", help="send the JSON start message after handshake")
    ap.add_argument("--client-id", default="probe", help="client_id in start message")
    ap.add_argument("--request-id", default="", help="request_id in start message (auto if empty)")
    ap.add_argument("--wake-word", default="", help="wake_word in start payload")
    ap.add_argument("--wake-enabled", action="store_true", help="enable wake word mode")
    ap.add_argument("--continuous", action="store_true", help="continuous mode")
    ap.add_argument("--send-silence-ms", type=int, default=0, help="send PCM silence (16kHz s16le mono) after start")
    ap.add_argument("--send-wav", default="", help="send a 16kHz mono s16le WAV file as PCM frames after start")
    ap.add_argument("--chunk-ms", type=int, default=20, help="chunk size (ms) when sending WAV/PCM frames")
    args = ap.parse_args()

    u = urllib.parse.urlparse(args.url)
    if u.scheme not in ("ws", "wss"):
        print(f"bad_url_scheme: {u.scheme}", file=sys.stderr)
        return 2
    host = u.hostname or "localhost"
    port = int(u.port or (443 if u.scheme == "wss" else 80))
    path = u.path or "/"
    if u.query:
        path = f"{path}?{u.query}"

    raw_sock = socket.create_connection((host, port), timeout=args.timeout)
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

    status, headers, rest = _read_http_response(sock, timeout_s=args.timeout)
    print("== Handshake ==")
    print(status)
    print(f"upgrade={headers.get('upgrade','')!r} connection={headers.get('connection','')!r}")
    print(f"sec-websocket-accept={headers.get('sec-websocket-accept','')!r}")
    if rest:
        snippet = rest[:200].decode("utf-8", errors="replace")
        print(f"body_snippet={snippet!r}")

    if not status.startswith("HTTP/1.1 101"):
        print("handshake_failed: expected HTTP 101 Switching Protocols", file=sys.stderr)
        sock.close()
        return 1

    expected = _expected_accept(key)
    if headers.get("sec-websocket-accept", "") != expected:
        print(f"handshake_warning: accept_mismatch expected={expected!r}", file=sys.stderr)

    if not args.start:
        _ws_send_frame(sock, 0x8, b"")  # close
        sock.close()
        return 0

    rid = args.request_id.strip() or f"probe_{int(time.time()*1000)}"
    start_msg = {
        "type": "start",
        "request_id": rid,
        "client_id": args.client_id,
        "sample_rate": 16000,
        "encoding": "pcm_s16le",
        "continuous": bool(args.continuous),
        "wake_word_enabled": bool(args.wake_enabled),
        "wake_word": args.wake_word,
        "wake_match_mode": "contains",
        "wake_cooldown_ms": 0,
        "emit_prewake": True,
    }
    print("== Send start ==")
    print(json.dumps(start_msg, ensure_ascii=False))
    _ws_send_frame(sock, 0x1, json.dumps(start_msg, ensure_ascii=False).encode("utf-8"))

    if args.send_silence_ms > 0:
        n = int(16000 * max(0, args.send_silence_ms) / 1000.0)
        silence = (b"\x00\x00") * n
        _ws_send_frame(sock, 0x2, silence)

    wav_path = str(args.send_wav or "").strip()
    if wav_path:
        print(f"== Send wav == {wav_path}")
        try:
            with wave.open(wav_path, "rb") as wf:
                ch = wf.getnchannels()
                sr = wf.getframerate()
                sw = wf.getsampwidth()
                frames = wf.getnframes()
                raw = wf.readframes(frames)
        except Exception as e:
            print(f"read_wav_failed: {e}", file=sys.stderr)
            _ws_send_frame(sock, 0x8, b"")
            sock.close()
            return 2
        if ch != 1 or sr != 16000 or sw != 2:
            print(f"wav_format_invalid: ch={ch} sr={sr} sw={sw} (need mono 16kHz s16le)", file=sys.stderr)
            _ws_send_frame(sock, 0x8, b"")
            sock.close()
            return 2

        chunk_ms = max(5, min(200, int(args.chunk_ms) if args.chunk_ms else 20))
        bytes_per_ms = 16000 * 2 / 1000.0
        chunk_bytes = int(bytes_per_ms * chunk_ms)
        if chunk_bytes <= 0:
            chunk_bytes = 640
        sent = 0
        for off in range(0, len(raw), chunk_bytes):
            chunk = raw[off : off + chunk_bytes]
            if not chunk:
                break
            _ws_send_frame(sock, 0x2, chunk)
            sent += len(chunk)
            time.sleep(chunk_ms / 1000.0)  # simulate realtime; helps some ASR servers
        print(f"wav_sent_bytes={sent}")

    print("== Receive (up to 5 messages) ==")
    for _ in range(5):
        frame = _ws_recv_frame(sock, timeout_s=args.timeout)
        if frame is None:
            print("(no more frames)")
            break
        opcode, payload = frame
        if opcode == 0x1:
            text = payload.decode("utf-8", errors="replace")
            print(text)
        elif opcode == 0x8:
            print("(server close)")
            break
        else:
            print(f"(opcode={opcode} bytes={len(payload)})")

    with os.fdopen(os.dup(sys.stdout.fileno()), "w"):
        pass
    _ws_send_frame(sock, 0x8, b"")
    sock.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
