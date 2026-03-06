import asyncio
import gzip
import json
import queue
import struct
import threading
import uuid
from dataclasses import dataclass
from typing import Any

import aiohttp
import pyaudio
import tkinter as tk
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText


DEFAULT_APP_KEY = "5843355819"
DEFAULT_ACCESS_KEY = "UQOb6ysCJectPRgE4ZcG4pGMv-CAY3w1"
DEFAULT_RESOURCE_ID = "volc.bigasr.sauc.duration"
DEFAULT_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
DEFAULT_SEG_DURATION_MS = 200

SAMPLE_RATE = 16000
CHANNELS = 1
BYTES_PER_SAMPLE = 2


class ProtocolVersion:
    V1 = 0b0001


class MessageType:
    CLIENT_FULL_REQUEST = 0b0001
    CLIENT_AUDIO_ONLY_REQUEST = 0b0010
    SERVER_FULL_RESPONSE = 0b1001
    SERVER_ERROR_RESPONSE = 0b1111


class MessageFlags:
    POS_SEQUENCE = 0b0001
    NEG_WITH_SEQUENCE = 0b0011


class SerializationType:
    JSON = 0b0001


class CompressionType:
    GZIP = 0b0001


@dataclass
class ParsedResponse:
    code: int = 0
    event: int = 0
    is_last_package: bool = False
    payload_sequence: int = 0
    payload_msg: Any = None


@dataclass
class SaucConfig:
    app_key: str
    access_key: str
    resource_id: str
    ws_url: str
    seg_duration_ms: int


def _gzip_compress(data: bytes) -> bytes:
    return gzip.compress(data)


def _gzip_decompress(data: bytes) -> bytes:
    return gzip.decompress(data)


def _build_header(message_type: int, message_flags: int) -> bytes:
    header = bytearray()
    header.append((ProtocolVersion.V1 << 4) | 1)
    header.append((message_type << 4) | message_flags)
    header.append((SerializationType.JSON << 4) | CompressionType.GZIP)
    header.append(0x00)
    return bytes(header)


def _build_full_request(seq: int) -> bytes:
    payload = {
        "user": {"uid": "tk_gui"},
        "audio": {
            # Mic stream sends raw PCM frames, so use `pcm` here.
            "format": "pcm",
            "codec": "raw",
            "rate": SAMPLE_RATE,
            "bits": 16,
            "channel": CHANNELS,
        },
        "request": {
            "model_name": "bigmodel",
            "enable_itn": True,
            "enable_punc": True,
            "enable_ddc": True,
            "show_utterances": True,
            "enable_nonstream": False,
        },
    }
    payload_bytes = _gzip_compress(json.dumps(payload).encode("utf-8"))
    packet = bytearray()
    packet.extend(_build_header(MessageType.CLIENT_FULL_REQUEST, MessageFlags.POS_SEQUENCE))
    packet.extend(struct.pack(">i", seq))
    packet.extend(struct.pack(">I", len(payload_bytes)))
    packet.extend(payload_bytes)
    return bytes(packet)


def _build_audio_request(seq: int, audio: bytes, is_last: bool) -> bytes:
    flags = MessageFlags.NEG_WITH_SEQUENCE if is_last else MessageFlags.POS_SEQUENCE
    send_seq = -abs(seq) if is_last else seq
    payload = _gzip_compress(audio)
    packet = bytearray()
    packet.extend(_build_header(MessageType.CLIENT_AUDIO_ONLY_REQUEST, flags))
    packet.extend(struct.pack(">i", send_seq))
    packet.extend(struct.pack(">I", len(payload)))
    packet.extend(payload)
    return bytes(packet)


def _parse_response(msg: bytes) -> ParsedResponse:
    out = ParsedResponse()
    if len(msg) < 4:
        return out

    header_size = msg[0] & 0x0F
    message_type = msg[1] >> 4
    flags = msg[1] & 0x0F
    serialization = msg[2] >> 4
    compression = msg[2] & 0x0F

    payload = msg[header_size * 4 :]

    if flags & 0x01 and len(payload) >= 4:
        out.payload_sequence = struct.unpack(">i", payload[:4])[0]
        payload = payload[4:]
    if flags & 0x02:
        out.is_last_package = True
    if flags & 0x04 and len(payload) >= 4:
        out.event = struct.unpack(">i", payload[:4])[0]
        payload = payload[4:]

    if message_type == MessageType.SERVER_FULL_RESPONSE:
        if len(payload) < 4:
            return out
        payload = payload[4:]
    elif message_type == MessageType.SERVER_ERROR_RESPONSE:
        if len(payload) < 8:
            return out
        out.code = struct.unpack(">i", payload[:4])[0]
        payload = payload[8:]

    if not payload:
        return out

    if compression == CompressionType.GZIP:
        try:
            payload = _gzip_decompress(payload)
        except Exception:
            return out

    if serialization == SerializationType.JSON:
        try:
            out.payload_msg = json.loads(payload.decode("utf-8"))
        except Exception:
            out.payload_msg = None
    return out


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _utterances_text(utterances: Any) -> str:
    if not isinstance(utterances, list):
        return ""
    parts: list[str] = []
    for item in utterances:
        if not isinstance(item, dict):
            continue
        text = _normalize_text(item.get("text"))
        if text:
            parts.append(text)
    return "".join(parts)


def _extract_transcript_text(payload_msg: Any) -> str:
    if not isinstance(payload_msg, dict):
        return ""

    candidates: list[str] = []
    text = _normalize_text(payload_msg.get("text"))
    if text:
        candidates.append(text)

    utt_text = _utterances_text(payload_msg.get("utterances"))
    if utt_text:
        candidates.append(utt_text)

    result = payload_msg.get("result")
    if isinstance(result, dict):
        result_text = _normalize_text(result.get("text"))
        if result_text:
            candidates.append(result_text)
        result_utt_text = _utterances_text(result.get("utterances"))
        if result_utt_text:
            candidates.append(result_utt_text)

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


class SaucRealtimeMicWorker:
    def __init__(
        self,
        cfg: SaucConfig,
        *,
        on_status,
        on_text_delta,
        on_error,
        on_stopped,
    ) -> None:
        self.cfg = cfg
        self._on_status = on_status
        self._on_text_delta = on_text_delta
        self._on_error = on_error
        self._on_stopped = on_stopped
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_text = ""

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run_thread, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def _emit_status(self, text: str) -> None:
        self._on_status(str(text))

    def _emit_error(self, text: str) -> None:
        self._on_error(str(text))

    @staticmethod
    def _friendly_server_error(code: int) -> str:
        if code == 45000151:
            return "服务端错误 code=45000151：音频格式不正确，请确认 16k/16bit/单声道 PCM"
        if code == 45000002:
            return "服务端错误 code=45000002：空音频，请确认麦克风有采集到声音"
        if code == 45000001:
            return "服务端错误 code=45000001：请求参数无效，请检查 Key/ResourceID/URL"
        return f"服务端错误 code={code}"

    def _run_thread(self) -> None:
        try:
            asyncio.run(self._run_async())
        except Exception as exc:
            self._emit_error(f"后台线程异常: {exc}")
        finally:
            self._on_stopped()

    async def _recv_loop(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        async for msg in ws:
            if self._stop_event.is_set():
                break
            if msg.type == aiohttp.WSMsgType.BINARY:
                parsed = _parse_response(msg.data)
                if parsed.code != 0:
                    self._emit_error(self._friendly_server_error(parsed.code))
                    break
                text = _extract_transcript_text(parsed.payload_msg)
                delta = _incremental_delta(self._last_text, text)
                if delta:
                    self._on_text_delta(delta)
                if text:
                    self._last_text = text
                if parsed.is_last_package:
                    break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                self._emit_error("WebSocket 接收错误")
                break
            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED):
                break

    async def _run_async(self) -> None:
        frames_per_chunk = max(160, int(SAMPLE_RATE * self.cfg.seg_duration_ms / 1000))
        timeout = aiohttp.ClientTimeout(total=None, connect=10, sock_read=None)
        request_id = str(uuid.uuid4())

        p = pyaudio.PyAudio()
        stream = None
        seq = 1
        recv_task: asyncio.Task | None = None

        try:
            self._emit_status("正在打开麦克风...")
            stream = p.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                frames_per_buffer=frames_per_chunk,
            )
            self._emit_status("正在连接识别服务...")

            headers = {
                "X-Api-Resource-Id": self.cfg.resource_id,
                "X-Api-Request-Id": request_id,
                "X-Api-Access-Key": self.cfg.access_key,
                "X-Api-App-Key": self.cfg.app_key,
            }

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.ws_connect(self.cfg.ws_url, headers=headers, heartbeat=20) as ws:
                    await ws.send_bytes(_build_full_request(seq))
                    seq += 1

                    # Wait for starter response first, then start streaming audio.
                    try:
                        starter = await ws.receive(timeout=3.0)
                    except asyncio.TimeoutError:
                        self._emit_error("启动超时：未收到服务端初始化响应")
                        return
                    if starter.type != aiohttp.WSMsgType.BINARY:
                        self._emit_error("启动失败：服务端初始化响应类型异常")
                        return
                    starter_resp = _parse_response(starter.data)
                    if starter_resp.code != 0:
                        self._emit_error(self._friendly_server_error(starter_resp.code))
                        return
                    self._emit_status("已开始采集并实时识别")

                    recv_task = asyncio.create_task(self._recv_loop(ws))
                    while not self._stop_event.is_set():
                        audio_chunk = await asyncio.to_thread(
                            stream.read,
                            frames_per_chunk,
                            False,
                        )
                        await ws.send_bytes(_build_audio_request(seq, audio_chunk, is_last=False))
                        seq += 1

                    await ws.send_bytes(_build_audio_request(seq, b"", is_last=True))
                    self._emit_status("已停止采集，等待最后结果...")

                    if recv_task:
                        try:
                            await asyncio.wait_for(recv_task, timeout=3.0)
                        except asyncio.TimeoutError:
                            recv_task.cancel()
                        except asyncio.CancelledError:
                            pass
                        except Exception:
                            recv_task.cancel()
        finally:
            if recv_task and not recv_task.done():
                recv_task.cancel()
                try:
                    await recv_task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass
            if stream is not None:
                try:
                    stream.stop_stream()
                except Exception:
                    pass
                try:
                    stream.close()
                except Exception:
                    pass
            try:
                p.terminate()
            except Exception:
                pass
            self._emit_status("已停止")


class SaucRealtimeMicGui:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("SAUC 麦克风实时识别")
        self.root.geometry("980x700")

        self.app_key_var = tk.StringVar(value=DEFAULT_APP_KEY)
        self.access_key_var = tk.StringVar(value=DEFAULT_ACCESS_KEY)
        self.resource_id_var = tk.StringVar(value=DEFAULT_RESOURCE_ID)
        self.ws_url_var = tk.StringVar(value=DEFAULT_WS_URL)
        self.seg_duration_var = tk.StringVar(value=str(DEFAULT_SEG_DURATION_MS))
        self.status_var = tk.StringVar(value="就绪")

        self.message_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self.worker: SaucRealtimeMicWorker | None = None

        self._build_ui()
        self.root.after(60, self._drain_queue)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=12)
        frame.pack(fill=tk.BOTH, expand=True)

        row = 0
        ttk.Label(frame, text="App Key").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.app_key_var).grid(row=row, column=1, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Access Key").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.access_key_var).grid(row=row, column=1, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Resource ID").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.resource_id_var).grid(row=row, column=1, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="WebSocket URL").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.ws_url_var).grid(row=row, column=1, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="分包时长(ms)").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.seg_duration_var).grid(row=row, column=1, sticky=tk.EW, pady=4)

        row += 1
        btn_frame = ttk.Frame(frame)
        btn_frame.grid(row=row, column=0, columnspan=2, sticky=tk.W, pady=(8, 8))
        self.start_btn = ttk.Button(btn_frame, text="开始", command=self._start)
        self.start_btn.pack(side=tk.LEFT, padx=(0, 8))
        self.stop_btn = ttk.Button(btn_frame, text="停止", command=self._stop, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT)

        row += 1
        ttk.Label(frame, text="识别增量文本").grid(row=row, column=0, columnspan=2, sticky=tk.W)

        row += 1
        self.text_area = ScrolledText(frame, wrap=tk.WORD, height=24)
        self.text_area.grid(row=row, column=0, columnspan=2, sticky=tk.NSEW, pady=(4, 8))

        row += 1
        ttk.Label(frame, textvariable=self.status_var, foreground="#2f5f9f").grid(row=row, column=0, columnspan=2, sticky=tk.W)

        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(row - 1, weight=1)

    def _push(self, kind: str, text: str) -> None:
        self.message_queue.put((kind, text))

    def _start(self) -> None:
        if self.worker and self.worker.is_running():
            messagebox.showwarning("提示", "识别已在运行中")
            return

        app_key = self.app_key_var.get().strip()
        access_key = self.access_key_var.get().strip()
        resource_id = self.resource_id_var.get().strip()
        ws_url = self.ws_url_var.get().strip()
        seg_raw = self.seg_duration_var.get().strip()

        if not app_key or not access_key or not resource_id or not ws_url:
            messagebox.showerror("参数错误", "App Key / Access Key / Resource ID / URL 不能为空")
            return
        try:
            seg_duration_ms = int(seg_raw)
        except ValueError:
            messagebox.showerror("参数错误", "分包时长必须是整数")
            return
        if seg_duration_ms < 50 or seg_duration_ms > 1000:
            messagebox.showerror("参数错误", "分包时长建议在 50~1000ms")
            return

        self.text_area.delete("1.0", tk.END)
        self.status_var.set("启动中...")

        cfg = SaucConfig(
            app_key=app_key,
            access_key=access_key,
            resource_id=resource_id,
            ws_url=ws_url,
            seg_duration_ms=seg_duration_ms,
        )
        self.worker = SaucRealtimeMicWorker(
            cfg,
            on_status=lambda s: self._push("status", s),
            on_text_delta=lambda s: self._push("text", s),
            on_error=lambda s: self._push("error", s),
            on_stopped=lambda: self._push("stopped", ""),
        )
        self.worker.start()
        self.start_btn.configure(state=tk.DISABLED)
        self.stop_btn.configure(state=tk.NORMAL)

    def _stop(self) -> None:
        if self.worker:
            self.worker.stop()
        self.status_var.set("停止中...")

    def _drain_queue(self) -> None:
        try:
            while True:
                kind, text = self.message_queue.get_nowait()
                if kind == "text":
                    self.text_area.insert(tk.END, text)
                    self.text_area.see(tk.END)
                elif kind == "status":
                    self.status_var.set(text)
                elif kind == "error":
                    self.status_var.set(text)
                elif kind == "stopped":
                    self.start_btn.configure(state=tk.NORMAL)
                    self.stop_btn.configure(state=tk.DISABLED)
                    self.worker = None
        except queue.Empty:
            pass
        finally:
            self.root.after(60, self._drain_queue)

    def _on_close(self) -> None:
        if self.worker and self.worker.is_running():
            self.worker.stop()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    SaucRealtimeMicGui(root)
    root.mainloop()


if __name__ == "__main__":
    main()
