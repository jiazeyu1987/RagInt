from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import mimetypes
import os
import secrets
import socket
import ssl
import sys
import time
import urllib.parse
import urllib.request
import uuid
import wave


def _read_source_bytes(source: str) -> tuple[bytes, str]:
    src = str(source or "").strip()
    if not src:
        raise FileNotFoundError("empty_audio_source")
    if src.lower().startswith(("http://", "https://")):
        with urllib.request.urlopen(src, timeout=60) as resp:
            data = resp.read()
        filename = os.path.basename(urllib.parse.urlparse(src).path) or "audio.bin"
        return data, filename
    data = open(src, "rb").read()
    return data, os.path.basename(src)


def _base_to_ws(base_url: str, path: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    if not base:
        base = "http://localhost:8000"
    if base.lower().startswith("https://"):
        ws_base = "wss://" + base[8:]
    elif base.lower().startswith("http://"):
        ws_base = "ws://" + base[7:]
    else:
        # assume http
        ws_base = "ws://" + base
    p = path if str(path).startswith("/") else f"/{path}"
    return f"{ws_base}{p}"


def _multipart_form(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = "----ragintBoundary" + secrets.token_hex(12)
    lines: list[bytes] = []
    for k, v in fields.items():
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
        lines.append(str(v).encode("utf-8"))
        lines.append(b"\r\n")
    for field, (filename, content, content_type) in files.items():
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        lines.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        lines.append(content)
        lines.append(b"\r\n")
    lines.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(lines)
    return body, f"multipart/form-data; boundary={boundary}"


def http_test_asr(base_url: str, wav_path: str, client_id: str) -> int:
    url = str(base_url or "http://localhost:8000").rstrip("/") + "/api/speech_to_text"
    try:
        raw, filename = _read_source_bytes(wav_path)
    except FileNotFoundError:
        print(f"audio_not_found: {wav_path!r}", file=sys.stderr)
        print("hint: pass a real file path, e.g. --wav D:\\\\path\\\\to\\\\audio.wav", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"read_audio_failed: {e}", file=sys.stderr)
        return 2
    ctype = mimetypes.guess_type(filename)[0] or "audio/wav"

    fields = {
        "client_id": client_id,
        "request_id": f"asr_http_{uuid.uuid4().hex}",
    }
    body, content_type = _multipart_form(fields, {"audio": (filename, raw, ctype)})
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", content_type)
    req.add_header("Accept", "application/json")

    print(f"== HTTP ASR == {url}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            print(f"http_status={resp.status}")
    except Exception as e:
        print(f"http_request_failed: {e}", file=sys.stderr)
        return 1

    try:
        payload = json.loads(data.decode("utf-8", errors="replace"))
    except Exception:
        print(f"bad_json_response: {data[:300]!r}", file=sys.stderr)
        return 1

    text = str(payload.get("text") or "")
    print(f"text={text!r}")
    return 0 if text else 0


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


def ws_test_asr(base_url: str, wav_path: str, client_id: str, timeout_s: float) -> int:
    ws_url = _base_to_ws(base_url, "/ws/asr")
    u = urllib.parse.urlparse(ws_url)
    host = u.hostname or "localhost"
    port = int(u.port or (443 if u.scheme == "wss" else 80))
    path = u.path or "/ws/asr"

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
    print(f"== WS ASR == {ws_url}")
    print(status)
    if not status.startswith("HTTP/1.1 101"):
        print("handshake_failed", file=sys.stderr)
        sock.close()
        return 1
    expected = _expected_accept(key)
    if headers.get("sec-websocket-accept", "") != expected:
        print("handshake_warning: accept_mismatch", file=sys.stderr)

    try:
        raw, filename = _read_source_bytes(wav_path)
    except FileNotFoundError:
        print(f"audio_not_found: {wav_path!r}", file=sys.stderr)
        print("hint: pass a real file path, e.g. --wav D:\\\\path\\\\to\\\\out16k.wav", file=sys.stderr)
        sock.close()
        return 2
    except Exception as e:
        print(f"read_audio_failed: {e}", file=sys.stderr)
        sock.close()
        return 2

    try:
        with wave.open(io.BytesIO(raw), "rb") as wf:
            ch = wf.getnchannels()
            sr = wf.getframerate()
            sw = wf.getsampwidth()
            frames = wf.getnframes()
            pcm = wf.readframes(frames)
    except Exception as e:
        print(f"read_wav_failed: {filename} err={e}", file=sys.stderr)
        sock.close()
        return 2
    if ch != 1 or sr != 16000 or sw != 2:
        print(f"wav_format_invalid: ch={ch} sr={sr} sw={sw} (need mono 16kHz s16le)", file=sys.stderr)
        sock.close()
        return 2

    request_id = f"asr_ws_{uuid.uuid4().hex}"
    start_msg = {
        "type": "start",
        "request_id": request_id,
        "client_id": client_id,
        "sample_rate": 16000,
        "encoding": "pcm_s16le",
        "continuous": False,
    }
    _ws_send_frame(sock, 0x1, json.dumps(start_msg, ensure_ascii=False).encode("utf-8"))

    chunk_ms = 20
    chunk_bytes = int(16000 * 2 * chunk_ms / 1000.0)  # 640 bytes
    for off in range(0, len(pcm), chunk_bytes):
        chunk = pcm[off : off + chunk_bytes]
        if not chunk:
            break
        _ws_send_frame(sock, 0x2, chunk)
        time.sleep(chunk_ms / 1000.0)

    final_text = ""
    t_end = time.time() + max(2.0, timeout_s)
    while time.time() < t_end:
        frame = _ws_recv_frame(sock, timeout_s=timeout_s)
        if frame is None:
            continue
        opcode, payload = frame
        if opcode == 0x8:
            break
        if opcode != 0x1:
            continue
        try:
            msg = json.loads(payload.decode("utf-8", errors="replace"))
        except Exception:
            continue
        t = str(msg.get("type") or "").lower()
        if t in ("info", "partial"):
            continue
        if t == "final":
            final_text = str(msg.get("text") or "").strip()
            break
        if t == "error":
            print(f"ws_error: {msg.get('error')}", file=sys.stderr)
            break

    try:
        _ws_send_frame(sock, 0x8, b"")
    except Exception:
        pass
    sock.close()
    print(f"text={final_text!r}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Test RagInt backend ASR (HTTP or WebSocket).")
    ap.add_argument("--base-url", default="http://localhost:8000", help="backend base url, e.g. http://localhost:8000")
    ap.add_argument("--mode", choices=("http", "ws"), default="http", help="test mode")
    ap.add_argument("--wav", required=True, help="16kHz mono s16le wav for ws; any audio for http")
    ap.add_argument("--client-id", default="asr_test", help="client id")
    ap.add_argument("--timeout", type=float, default=20.0, help="timeout seconds (ws receive / http connect)")
    args = ap.parse_args()

    if args.mode == "http":
        return http_test_asr(args.base_url, args.wav, args.client_id)
    return ws_test_asr(args.base_url, args.wav, args.client_id, timeout_s=float(args.timeout))


if __name__ == "__main__":
    raise SystemExit(main())
