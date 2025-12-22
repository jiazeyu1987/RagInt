#!/usr/bin/env python3
import sys
import os
from pathlib import Path
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
import base64
import threading
import queue
import time
import uuid
import numpy as np
import logging
import contextlib
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class _DashscopeByeNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        # DashScope websocket-client sometimes logs normal close (code 1000, "Bye") as ERROR.
        if "opcode=8" in msg and "Bye" in msg and ("goodbye" in msg.lower() or "websocket closed" in msg.lower()):
            return False
        # Noisy but expected connection churn from the SDK/pool.
        if "Websocket connected" in msg:
            return False
        if "SpeechSynthesizerObjectPool" in msg and "renew synthesizer after" in msg:
            return False
        return True


for _name in (
    "dashscope.audio.tts_v2.speech_synthesizer",
    "dashscope",
    "websocket",
    "websocket._logging",
    "websocket._app",
):
    with contextlib.suppress(Exception):
        logging.getLogger(_name).addFilter(_DashscopeByeNoiseFilter())
        # Keep our app logs at INFO; reduce third-party log spam.
        logging.getLogger(_name).setLevel(logging.WARNING)

# Ensure the filter applies even if third-party libs attach their own handlers.
with contextlib.suppress(Exception):
    _root_logger = logging.getLogger()
    for _h in list(getattr(_root_logger, "handlers", []) or []):
        _h.addFilter(_DashscopeByeNoiseFilter())

# websocket-client may add its own StreamHandler (no timestamp) when trace is enabled; remove non-null handlers.
with contextlib.suppress(Exception):
    from logging import NullHandler as _NullHandler  # type: ignore
    _ws_logger = logging.getLogger("websocket")
    for _h in list(_ws_logger.handlers):
        if not isinstance(_h, _NullHandler):
            _ws_logger.removeHandler(_h)

sys.path.append(str(Path(__file__).parent))

app = Flask(__name__)
CORS(app)

sys.path.append(str(Path(__file__).parent.parent))
sys.path.append(str(Path(__file__).parent.parent / "ragflow_demo"))
sys.path.append(str(Path(__file__).parent.parent / "fuasr_demo"))
sys.path.append(str(Path(__file__).parent.parent / "tts_demo"))

from services.asr_service import ASRService
from services.config_utils import get_nested
from services.history_store import HistoryStore
from services.intent_service import IntentService
from services.ragflow_agent_service import RagflowAgentService
from services.ragflow_service import RagflowService
from services.tour_planner import TourPlanner
from services.tts_service import TTSSvc

ragflow_service = RagflowService(Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json", logger=logger)
ragflow_agent_service = RagflowAgentService(Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json", logger=logger)
history_store = HistoryStore(Path(__file__).parent / "data" / "qa_history.db", logger=logger)
asr_service = ASRService(logger=logger)
tts_service = TTSSvc(logger=logger)
intent_service = IntentService()
tour_planner = TourPlanner()
asr_model_loaded = asr_service.funasr_loaded

class SuppressOutput:
    def __enter__(self):
        import sys
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys
        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr

ragflow_client = None
session = None
ragflow_dataset_id = None
ragflow_default_chat_name = None

ASK_TIMINGS = {}
ASK_TIMINGS_LOCK = threading.Lock()


def _timings_prune(now_perf: float, ttl_s: float = 300.0, max_items: int = 500):
    with ASK_TIMINGS_LOCK:
        if len(ASK_TIMINGS) <= max_items:
            items = list(ASK_TIMINGS.items())
        else:
            items = list(ASK_TIMINGS.items())
        for key, value in items:
            t_submit = value.get("t_submit")
            if isinstance(t_submit, (int, float)) and (now_perf - float(t_submit)) > ttl_s:
                ASK_TIMINGS.pop(key, None)
        if len(ASK_TIMINGS) > max_items:
            # best-effort: drop oldest by t_submit
            ordered = sorted(
                ASK_TIMINGS.items(),
                key=lambda kv: float(kv[1].get("t_submit", now_perf)),
            )
            for key, _ in ordered[: max(0, len(ASK_TIMINGS) - max_items)]:
                ASK_TIMINGS.pop(key, None)


def _timings_set(request_id: str, **fields):
    now_perf = time.perf_counter()
    _timings_prune(now_perf)
    with ASK_TIMINGS_LOCK:
        entry = ASK_TIMINGS.get(request_id) or {}
        entry.update(fields)
        ASK_TIMINGS[request_id] = entry


def _timings_get(request_id: str):
    with ASK_TIMINGS_LOCK:
        entry = ASK_TIMINGS.get(request_id)
        return dict(entry) if isinstance(entry, dict) else None


def load_app_config():
    return ragflow_service.load_config() or {}

def _get_nested(config: dict, path: list, default=None):
    return get_nested(config, path, default)


def _stream_local_gpt_sovits(text: str, request_id: str, config: dict):
    tts_cfg = _get_nested(config, ["tts", "local"], {}) or {}
    if tts_cfg.get("enabled") is False:
        raise ValueError("local TTS is disabled by config: tts.local.enabled=false")
    url = tts_cfg.get("url", "http://127.0.0.1:9880/tts")
    timeout_s = float(tts_cfg.get("timeout_s", 30))

    payload = {
        "text": text,
        "text_lang": tts_cfg.get("text_lang", "zh"),
        "ref_audio_path": tts_cfg.get(
            "ref_audio_path",
            "Liang/converted_temp_first_90s.wav_0000000000_0000182720.wav",
        ),
        "prompt_lang": tts_cfg.get("prompt_lang", "zh"),
        "prompt_text": tts_cfg.get(
            "prompt_text",
            "平台呢因为从我们的初创团队的理解的角度呢，我们觉得一个初创公司。",
        ),
        "low_latency": bool(tts_cfg.get("low_latency", True)),
        "media_type": tts_cfg.get("media_type", "wav"),
    }

    headers = {"X-Request-ID": request_id}
    logger.info(
        f"[{request_id}] local_tts_request url={url} timeout_s={timeout_s} media_type={payload.get('media_type')} chars={len(text)}"
    )
    r = requests.post(url, json=payload, headers=headers, stream=True, timeout=timeout_s)
    try:
        logger.info(f"[{request_id}] local_tts status={r.status_code} ct={r.headers.get('Content-Type')}")
        if r.status_code != 200:
            logger.error(f"[{request_id}] local_tts_failed status={r.status_code} body={r.text[:200]}")
            return
        for chunk in r.iter_content(chunk_size=4096):
            if chunk:
                yield chunk
    finally:
        try:
            r.close()
        except Exception:
            pass


def _stream_bailian_tts(text: str, request_id: str, config: dict):
    bailian_cfg = _get_nested(config, ["tts", "bailian"], {}) or {}
    mode = str(bailian_cfg.get("mode", "dashscope")).strip().lower() or "dashscope"
    if mode == "http":
        yield from _stream_bailian_tts_http(text=text, request_id=request_id, config=config)
        return
    yield from _stream_bailian_tts_dashscope(text=text, request_id=request_id, config=config)


def _stream_bailian_tts_http(text: str, request_id: str, config: dict):
    bailian_cfg = _get_nested(config, ["tts", "bailian"], {}) or {}
    url = str(bailian_cfg.get("url", "")).strip()
    if not url:
        raise ValueError("tts.bailian.url is required for bailian http mode")

    api_key = str(bailian_cfg.get("api_key", "")).strip()
    if not api_key:
        raise ValueError("tts.bailian.api_key is required for bailian http mode")

    method = str(bailian_cfg.get("method", "POST")).strip().upper()
    timeout_s = float(bailian_cfg.get("timeout_s", 30))
    text_field = str(bailian_cfg.get("text_field", "text")).strip() or "text"

    headers = {"X-Request-ID": request_id}
    auth_header = str(bailian_cfg.get("auth_header", "Authorization")).strip() or "Authorization"
    auth_prefix = str(bailian_cfg.get("auth_prefix", "Bearer "))
    headers[auth_header] = f"{auth_prefix}{api_key}"

    payload = bailian_cfg.get("extra_json", {}) or {}
    if not isinstance(payload, dict):
        payload = {}
    payload[text_field] = text

    logger.info(
        f"[{request_id}] bailian_http_tts_request method={method} url={url} timeout_s={timeout_s} text_field={text_field} chars={len(text)}"
    )
    r = requests.request(method, url, json=payload, headers=headers, stream=True, timeout=timeout_s)
    try:
        logger.info(f"[{request_id}] bailian_http_tts status={r.status_code} ct={r.headers.get('Content-Type')}")
        if r.status_code != 200:
            logger.error(f"[{request_id}] bailian_http_tts_failed status={r.status_code} body={r.text[:200]}")
            return

        content_type = (r.headers.get("Content-Type") or "").lower()
        if "application/json" in content_type:
            audio_field = str(bailian_cfg.get("json_audio_field", "")).strip()
            if not audio_field:
                raise ValueError("tts.bailian.json_audio_field is required when bailian response is JSON")
            data = r.json()
            audio_val = data
            for part in audio_field.split("."):
                if isinstance(audio_val, dict):
                    audio_val = audio_val.get(part)
                else:
                    audio_val = None
            if not audio_val:
                raise ValueError(f"JSON audio field not found: {audio_field}")
            is_b64 = bool(bailian_cfg.get("json_audio_b64", True))
            audio_bytes = base64.b64decode(audio_val) if is_b64 else audio_val.encode("utf-8")
            yield audio_bytes
            return

        for chunk in r.iter_content(chunk_size=4096):
            if chunk:
                yield chunk
    finally:
        with contextlib.suppress(Exception):
            r.close()


_DASHSCOPE_POOL = None
_DASHSCOPE_POOL_LOCK = threading.Lock()


def _dashscope_get_pool(max_size: int):
    global _DASHSCOPE_POOL
    with _DASHSCOPE_POOL_LOCK:
        if _DASHSCOPE_POOL is None:
            from dashscope.audio.tts_v2 import SpeechSynthesizerObjectPool

            _DASHSCOPE_POOL = SpeechSynthesizerObjectPool(max_size=max(1, int(max_size)))
        return _DASHSCOPE_POOL


def _stream_bailian_tts_dashscope(text: str, request_id: str, config: dict):
    """
    Bailian/DashScope streaming TTS via SDK (CosyVoice), based on `tts_demo/cv_streeam.py`.

    Config source:
    - `ragflow_demo/ragflow_config.json` -> `tts.bailian`
    """
    bailian_cfg = _get_nested(config, ["tts", "bailian"], {}) or {}
    api_key = str(bailian_cfg.get("api_key", "")).strip()
    if not api_key:
        raise ValueError("tts.bailian.api_key is required for bailian dashscope mode")

    try:
        import dashscope
        from dashscope.audio.tts_v2 import AudioFormat, ResultCallback, SpeechSynthesizer
    except Exception as e:
        raise RuntimeError(f"dashscope SDK not available: {e}")

    dashscope.api_key = api_key

    model = str(bailian_cfg.get("model", "cosyvoice-v3-plus")).strip() or "cosyvoice-v3-plus"
    voice = str(bailian_cfg.get("voice", "")).strip()
    if not voice:
        raise ValueError("tts.bailian.voice is required for bailian dashscope mode")

    seed = int(bailian_cfg.get("seed", 0) or 0)

    sample_rate = bailian_cfg.get("sample_rate", None)
    sample_rate = int(sample_rate) if sample_rate is not None and str(sample_rate).strip() != "" else None
    fmt = str(bailian_cfg.get("format", "wav")).strip().lower() or "wav"

    def pick_audio_format():
        sr = sample_rate or 16000
        if fmt == "wav":
            candidate = f"WAV_{sr}HZ_MONO_16BIT"
            return getattr(AudioFormat, candidate, None) or getattr(AudioFormat, "WAV_16000HZ_MONO_16BIT", None)
        if fmt == "pcm":
            candidate = f"PCM_{sr}HZ_MONO_16BIT"
            return getattr(AudioFormat, candidate, None) or getattr(AudioFormat, "PCM_16000HZ_MONO_16BIT", None)
        if fmt == "mp3":
            candidate = f"MP3_{sr}HZ_MONO_256KBPS"
            return getattr(AudioFormat, candidate, None) or getattr(AudioFormat, "MP3_24000HZ_MONO_256KBPS", None)
        return None

    audio_format = pick_audio_format() or getattr(AudioFormat, "DEFAULT", None)
    if audio_format is None:
        raise RuntimeError("dashscope AudioFormat not available")

    use_connection_pool = bool(bailian_cfg.get("use_connection_pool", True))
    pool_max_size = int(bailian_cfg.get("pool_max_size", 3))

    queue_max_chunks = int(bailian_cfg.get("queue_max_chunks", 256))
    q = queue.Queue(maxsize=max(8, queue_max_chunks))
    complete_event = threading.Event()
    stop_event = threading.Event()
    canceled = False

    additional_params = bailian_cfg.get("additional_params") or {}
    if not isinstance(additional_params, dict):
        additional_params = {}
    if sample_rate is not None:
        additional_params["sample_rate"] = sample_rate

    volume = bailian_cfg.get("volume", None)
    volume = int(volume) if volume is not None and str(volume).strip() != "" else 50
    speech_rate = bailian_cfg.get("speech_rate", None)
    speech_rate = float(speech_rate) if speech_rate is not None and str(speech_rate).strip() != "" else 1.0
    pitch_rate = bailian_cfg.get("pitch_rate", None)
    pitch_rate = float(pitch_rate) if pitch_rate is not None and str(pitch_rate).strip() != "" else 1.0

    class Callback(ResultCallback):
        def on_open(self):
            logger.info(
                f"[{request_id}] dashscope_tts_open model={model} voice={voice} format={fmt} sample_rate={sample_rate} pool={use_connection_pool}"
            )

        def on_complete(self):
            logger.info(f"[{request_id}] dashscope_tts_complete")
            complete_event.set()
            with contextlib.suppress(Exception):
                q.put_nowait(None)

        def on_error(self, message: str):
            logger.error(f"[{request_id}] dashscope_tts_error {message}")
            complete_event.set()
            with contextlib.suppress(Exception):
                q.put_nowait(None)

        def on_close(self):
            logger.info(f"[{request_id}] dashscope_tts_close")

        def on_event(self, message):
            # noisy; keep for future debugging
            return

        def on_data(self, data: bytes) -> None:
            if stop_event.is_set():
                return
            if data:
                try:
                    q.put(data, timeout=2.0)
                except Exception:
                    logger.warning(
                        f"[{request_id}] dashscope_tts_backpressure drop_bytes={len(data)} qsize={getattr(q, 'qsize', lambda: -1)()}"
                    )

    synthesizer_callback = Callback()

    speech_synthesizer = None
    try:
        if use_connection_pool:
            pool = _dashscope_get_pool(pool_max_size)
            speech_synthesizer = pool.borrow_synthesizer(
                model=model,
                voice=voice,
                format=audio_format,
                volume=volume,
                speech_rate=speech_rate,
                pitch_rate=pitch_rate,
                seed=seed,
                additional_params=additional_params,
                callback=synthesizer_callback,
            )
        else:
            speech_synthesizer = SpeechSynthesizer(
                model=model,
                voice=voice,
                format=audio_format,
                volume=volume,
                speech_rate=speech_rate,
                pitch_rate=pitch_rate,
                seed=seed,
                additional_params=additional_params,
                callback=synthesizer_callback,
            )

        t_call = time.perf_counter()
        logger.info(
            f"[{request_id}] dashscope_tts_call start chars={len(text)} volume={volume} speech_rate={speech_rate} pitch_rate={pitch_rate} additional_params={list(additional_params.keys())}"
        )
        speech_synthesizer.call(text)

        first_chunk = True
        wav_probe_done = False
        wav_probe_buf = bytearray()
        pcm_probe_done = False
        pcm_probe_buf = bytearray()
        pcm_probe_target_bytes = int(bailian_cfg.get("pcm_probe_target_bytes", 32000) or 32000)  # ~1s @ 16kHz mono PCM16
        first_chunk_timeout_s = float(bailian_cfg.get("first_chunk_timeout_s", 12.0))

        def _try_parse_wav_header(buf: bytes):
            # Minimal RIFF/WAVE probe (PCM16 expected)
            if len(buf) < 44:
                return None
            if not (buf.startswith(b"RIFF") and buf[8:12] == b"WAVE"):
                return None

            def u16(off):
                return int.from_bytes(buf[off:off + 2], "little", signed=False)

            def u32(off):
                return int.from_bytes(buf[off:off + 4], "little", signed=False)

            offset = 12
            audio_format = None
            channels = None
            sample_rate = None
            bits_per_sample = None
            data_offset = None
            while offset + 8 <= len(buf):
                chunk_id = buf[offset:offset + 4]
                chunk_size = u32(offset + 4)
                payload = offset + 8
                if chunk_id == b"fmt " and payload + 16 <= len(buf):
                    audio_format = u16(payload + 0)
                    channels = u16(payload + 2)
                    sample_rate = u32(payload + 4)
                    bits_per_sample = u16(payload + 14)
                elif chunk_id == b"data":
                    data_offset = payload
                    break
                offset = payload + chunk_size
                if offset % 2 == 1:
                    offset += 1
            if data_offset is None:
                return None
            return {
                "audio_format": audio_format,
                "channels": channels,
                "sample_rate": sample_rate,
                "bits_per_sample": bits_per_sample,
                "data_offset": data_offset,
            }

        while True:
            try:
                item = q.get(timeout=0.5)
            except queue.Empty:
                if first_chunk and first_chunk_timeout_s > 0 and (time.perf_counter() - t_call) >= first_chunk_timeout_s:
                    logger.error(
                        f"[{request_id}] dashscope_tts_first_chunk_timeout timeout_s={first_chunk_timeout_s} (canceling)"
                    )
                    canceled = True
                    with contextlib.suppress(Exception):
                        speech_synthesizer.streaming_cancel()
                    break
                if not first_chunk and hasattr(q, "qsize"):
                    qs = q.qsize()
                    if qs >= 64:
                        logger.info(f"[{request_id}] dashscope_tts_queue qsize={qs}")
                if complete_event.is_set():
                    break
                continue
            if item is None:
                break
            if first_chunk:
                first_chunk = False
                prefix = item[:12]
                is_riff = prefix.startswith(b"RIFF")
                logger.info(
                    f"[{request_id}] dashscope_tts_first_chunk dt={time.perf_counter() - t_call:.3f}s bytes={len(item)} riff={is_riff}"
                )
                if not is_riff:
                    logger.warning(f"[{request_id}] dashscope_tts_first_chunk_prefix hex={item[:16].hex()}")
                ask_timing = _timings_get(request_id)
                if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
                    since_submit = time.perf_counter() - float(ask_timing["t_submit"])
                    logger.info(f"[{request_id}] dashscope_tts_first_chunk_since_submit dt={since_submit:.3f}s")

            if not wav_probe_done:
                if len(wav_probe_buf) < 8192:
                    wav_probe_buf.extend(item[: max(0, 8192 - len(wav_probe_buf))])
                parsed = _try_parse_wav_header(wav_probe_buf)
                if parsed:
                    wav_probe_done = True
                    logger.info(
                        f"[{request_id}] wav_probe audio_format={parsed['audio_format']} channels={parsed['channels']} sample_rate={parsed['sample_rate']} bits={parsed['bits_per_sample']} data_offset={parsed['data_offset']}"
                    )
                    if parsed.get("audio_format") not in (1, None) or parsed.get("bits_per_sample") not in (16, None):
                        logger.warning(f"[{request_id}] wav_probe_unexpected {parsed}")
                elif len(wav_probe_buf) >= 8192:
                    wav_probe_done = True
                    logger.warning(f"[{request_id}] wav_probe_failed buffered=8192")

            # PCM sanity probe (helps diagnose "white noise" cases)
            if not pcm_probe_done:
                if len(pcm_probe_buf) < pcm_probe_target_bytes and item:
                    pcm_probe_buf.extend(item[: max(0, pcm_probe_target_bytes - len(pcm_probe_buf))])
                if len(pcm_probe_buf) >= pcm_probe_target_bytes and pcm_probe_target_bytes > 0:
                    pcm_probe_done = True
                    try:
                        # Try to skip WAV header if present at the start
                        buf = bytes(pcm_probe_buf)
                        header = _try_parse_wav_header(buf)
                        if header and isinstance(header.get("data_offset"), int):
                            buf = buf[int(header["data_offset"]):]
                        if len(buf) >= 2000:
                            arr = np.frombuffer(buf[: min(len(buf), 64000)], dtype="<i2").astype(np.float32)
                            if arr.size:
                                peak = float(np.max(np.abs(arr)) / 32768.0)
                                rms = float(np.sqrt(np.mean((arr / 32768.0) ** 2)))
                                zcr = float(np.mean(np.abs(np.diff(np.sign(arr))) > 0))
                                mean = float(np.mean(arr / 32768.0))
                                logger.info(
                                    f"[{request_id}] pcm_probe peak={peak:.3f} rms={rms:.3f} zcr={zcr:.3f} mean={mean:.4f} samples={arr.size}"
                                )
                                if zcr > 0.35 and rms > 0.05:
                                    logger.warning(f"[{request_id}] pcm_probe_suspect_white_noise zcr={zcr:.3f} rms={rms:.3f}")
                    except Exception as e:
                        logger.warning(f"[{request_id}] pcm_probe_failed {e}")
            yield item
    except GeneratorExit:
        canceled = True
        stop_event.set()
        logger.info(f"[{request_id}] dashscope_tts_generator_exit (client_disconnect?)")
        if speech_synthesizer is not None:
            with contextlib.suppress(Exception):
                speech_synthesizer.streaming_cancel()
        raise
    except Exception as e:
        logger.error(f"[{request_id}] dashscope_tts_exception {e}", exc_info=True)
    finally:
        stop_event.set()
        if speech_synthesizer is not None:
            with contextlib.suppress(Exception):
                sdk_rid = speech_synthesizer.get_last_request_id()
                first_pkg_ms = speech_synthesizer.get_first_package_delay()
                logger.info(f"[{request_id}] dashscope_tts_metrics requestId={sdk_rid} first_pkg_delay_ms={first_pkg_ms}")
        if speech_synthesizer is not None:
            if use_connection_pool and not canceled and complete_event.is_set():
                with contextlib.suppress(Exception):
                    pool = _dashscope_get_pool(pool_max_size)
                    pool.return_synthesizer(speech_synthesizer)
            else:
                with contextlib.suppress(Exception):
                    speech_synthesizer.close()


def _stream_tts_provider(text: str, request_id: str, provider: str, config: dict):
    provider_norm = (provider or "").strip().lower() or "local"
    if provider_norm == "bailian":
        logger.info(f"[{request_id}] tts_provider_select provider=bailian")
        yield from _stream_bailian_tts(text=text, request_id=request_id, config=config)
        return
    local_enabled = _get_nested(config, ["tts", "local", "enabled"], True)
    if local_enabled is False:
        bailian_cfg = _get_nested(config, ["tts", "bailian"], {}) or {}
        if str(bailian_cfg.get("api_key", "")).strip() and str(bailian_cfg.get("voice", "")).strip():
            logger.info(f"[{request_id}] local_tts_disabled -> fallback_to_bailian")
            yield from _stream_bailian_tts(text=text, request_id=request_id, config=config)
            return
        raise ValueError("local TTS is disabled and bailian is not configured")

    logger.info(f"[{request_id}] tts_provider_select provider=local")
    yield from _stream_local_gpt_sovits(text=text, request_id=request_id, config=config)

def find_dataset_by_name(client, dataset_name):
    if not dataset_name:
        return None

    try:
        datasets = client.list_datasets()
        for dataset in datasets:
            if hasattr(dataset, 'name'):
                if dataset.name == dataset_name:
                    return dataset.id if hasattr(dataset, 'id') else dataset
            elif isinstance(dataset, dict):
                if dataset.get('name') == dataset_name:
                    return dataset.get('id') or dataset
            else:
                if dataset_name in str(dataset):
                    return dataset
    except Exception as e:
        logger.error(f"查找dataset失败: {e}")

    return None

def find_chat_by_name(client, chat_name):
    try:
        chats = client.list_chats()
        for chat in chats:
            if hasattr(chat, 'name'):
                if chat.name == chat_name:
                    return chat
            elif isinstance(chat, dict):
                if chat.get('name') == chat_name:
                    return chat
            else:
                if chat_name in str(chat):
                    return chat
    except Exception as e:
        logger.error(f"查找chat失败: {e}")

    return None

def init_ragflow():
    global ragflow_client, session, ragflow_dataset_id, ragflow_default_chat_name
    try:
        ok = ragflow_service.init()
        ragflow_client = ragflow_service.client
        ragflow_dataset_id = ragflow_service.dataset_id
        ragflow_default_chat_name = ragflow_service.default_chat_name
        session = ragflow_service.get_session(ragflow_default_chat_name) if ok else None
        return bool(ok)

        ragflow_config_path = Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json"

        if not ragflow_config_path.exists():
            logger.error(f"RAGFlow配置文件不存在: {ragflow_config_path}")
            return False

        logger.info(f"找到RAGFlow配置文件: {ragflow_config_path}")
        with open(ragflow_config_path, 'r', encoding='utf-8') as f:
            ragflow_config = json.load(f)

        api_key = ragflow_config.get('api_key', '')
        base_url = ragflow_config.get('base_url', 'http://127.0.0.1')
        dataset_name = ragflow_config.get('dataset_name', '')
        conversation_name = ragflow_config.get('default_conversation_name', '语音问答')
        ragflow_default_chat_name = conversation_name

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            logger.error("RAGFlow API key无效")
            return False

        logger.info(f"RAGFlow配置: {base_url}")
        logger.info("正在创建RAGFlow客户端...")

        ragflow_client = RAGFlow(api_key=api_key, base_url=base_url)
        logger.info("RAGFlow客户端创建成功")

        # Find dataset if specified
        dataset_id = None
        if dataset_name:
            logger.info(f"正在查找dataset: {dataset_name}")
            dataset_id = find_dataset_by_name(ragflow_client, dataset_name)
            if dataset_id:
                logger.info(f"找到dataset: {dataset_id}")
            else:
                logger.warning(f"dataset '{dataset_name}' 未找到，使用通用聊天")

        ragflow_dataset_id = dataset_id

        # Find or create chat
        logger.info(f"正在查找chat: {conversation_name}")
        chat = find_chat_by_name(ragflow_client, conversation_name)

        if chat:
            logger.info("使用现有chat")
        else:
            logger.info("创建新chat...")
            chat = ragflow_client.create_chat(
                name=conversation_name,
                dataset_ids=[dataset_id] if dataset_id else []
            )
            logger.info("新chat创建成功")

        # Create session
        logger.info("正在创建session...")
        session = chat.create_session("Chat Session")
        with RAGFLOW_SESSIONS_LOCK:
            RAGFLOW_SESSIONS[conversation_name] = session
        logger.info("RAGFlow初始化成功")
        return True

    except Exception as e:
        logger.error(f"RAGFlow初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

init_ragflow()

def load_ragflow_config():
    return ragflow_service.load_config() or {}


def _ragflow_chat_to_dict(chat):
    if chat is None:
        return None
    if hasattr(chat, "name"):
        return {"id": getattr(chat, "id", None), "name": getattr(chat, "name", None)}
    if isinstance(chat, dict):
        return {"id": chat.get("id"), "name": chat.get("name")}
    return {"id": None, "name": str(chat)}


def get_ragflow_session(chat_name: str):
    return ragflow_service.get_session(chat_name)


@app.route('/api/ragflow/chats', methods=['GET'])
def ragflow_list_chats():
    return jsonify(ragflow_service.list_chats())

@app.route('/api/ragflow/agents', methods=['GET'])
def ragflow_list_agents():
    res = ragflow_service.list_agents()
    try:
        logger.info(f"ragflow_agents_list count={len(res.get('agents') or [])}")
    except Exception:
        pass
    return jsonify(res)


@app.route('/api/history', methods=['GET'])
def api_history_list():
    sort_mode = (request.args.get("sort") or "time").strip().lower()
    order = (request.args.get("order") or "desc").strip().lower()
    limit = int(request.args.get("limit") or 100)
    desc = order != "asc"

    if sort_mode in ("count", "freq", "frequency"):
        items = history_store.list_by_count(limit=limit, desc=desc)
        return jsonify({"sort": "count", "items": items})

    items = history_store.list_by_time(limit=limit, desc=desc)
    return jsonify({"sort": "time", "items": items})

@app.route('/api/tour/stops', methods=['GET'])
def api_tour_stops():
    cfg = load_ragflow_config() or {}
    tour_cfg = cfg.get("tour", {}) if isinstance(cfg, dict) else {}
    stops = tour_cfg.get("stops") if isinstance(tour_cfg, dict) else None
    source = "default"
    if isinstance(stops, list) and stops:
        source = "ragflow_config.tour.stops"
    else:
        stops = [
            "公司总体介绍",
            "核心产品概览",
            "骨科产品",
            "泌尿产品",
            "其他产品与应用场景",
            "总结与提问引导",
        ]
    stops = [str(s).strip() for s in stops if str(s).strip()]
    return jsonify({"stops": stops, "source": source})

@app.route('/api/tour/meta', methods=['GET'])
def api_tour_meta():
    cfg = load_ragflow_config() or {}
    meta = tour_planner.get_meta(cfg if isinstance(cfg, dict) else {})
    return jsonify(meta)

@app.route('/api/tour/plan', methods=['POST'])
def api_tour_plan():
    cfg = load_ragflow_config() or {}
    data = request.get_json() or {}
    zone = str((data.get("zone") or "")).strip()
    profile = str((data.get("profile") or "")).strip()
    duration_s = data.get("duration_s") or 60
    plan = tour_planner.make_plan(cfg if isinstance(cfg, dict) else {}, zone=zone, profile=profile, duration_s=duration_s)
    return jsonify(
        {
            "zone": plan.zone,
            "profile": plan.profile,
            "duration_s": plan.duration_s,
            "stops": list(plan.stops),
            "source": plan.source,
        }
    )

@app.route('/health')
def health():
    return jsonify({
        "asr_loaded": asr_service.funasr_loaded,
        "ragflow_connected": session is not None
    })

@app.route('/api/speech_to_text', methods=['POST'])
def speech_to_text():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file"}), 400

    audio_file = request.files['audio']
    raw_bytes = audio_file.read()

    app_config = load_app_config()
    t0 = time.perf_counter()
    try:
        text = asr_service.transcribe(
            raw_bytes,
            app_config,
            src_filename=getattr(audio_file, "filename", None),
            src_mime=getattr(audio_file, "mimetype", None),
        )
        logger.info(f"asr_done dt={time.perf_counter()-t0:.3f}s chars={len(text)}")
        return jsonify({"text": text})
    except Exception as e:
        logger.error(f"asr_failed err={e}", exc_info=True)
        return jsonify({"text": ""})

@app.route('/api/ask', methods=['POST'])
def ask_question():
    t_submit = time.perf_counter()
    logger.info("收到问答请求")
    data = request.get_json()
    logger.info(f"请求数据: {data}")

    if not data or not data.get('question'):
        logger.error("没有问题数据")
        return jsonify({"error": "No question"}), 400

    question = data.get('question', '')
    agent_id = (data.get("agent_id") or "").strip()
    conversation_name = (data.get("conversation_name") or data.get("chat_name") or ragflow_default_chat_name or "").strip()
    guide = data.get("guide") or {}
    if not isinstance(guide, dict):
        guide = {}
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"ask_{uuid.uuid4().hex[:12]}"
    )
    intent = intent_service.classify(question)
    logger.info(
        f"[{request_id}] intent_detected intent={intent.intent} conf={intent.confidence:.2f} matched={list(intent.matched)} reason={intent.reason}"
    )
    if agent_id:
        conversation_name = ""
        logger.info(f"[{request_id}] 问题: {question} agent_id={agent_id}")
    else:
        logger.info(f"[{request_id}] 问题: {question} chat={conversation_name or 'default'}")
    _timings_set(request_id, t_submit=t_submit)

    def _apply_guide_prompt(raw_question: str) -> str:
        if not guide.get("enabled", False):
            return raw_question
        style = str(guide.get("style") or "friendly").strip().lower()
        try:
            duration_s = int(guide.get("duration_s") or 60)
        except Exception:
            duration_s = 60
        duration_s = max(15, min(duration_s, 600))

        style_text = "通俗易懂、亲切自然" if style in ("friendly", "simple") else "更专业、术语更准确"
        if duration_s <= 35:
            length_text = "控制在约30秒内，简洁但信息密度高"
        elif duration_s <= 90:
            length_text = "控制在约1分钟内，结构清晰"
        else:
            length_text = "控制在约3分钟内，分段讲解，循序渐进"

        guide_text = (
            "【展厅讲解要求】\n"
            "你是一名展厅讲解员，面向来访者做中文讲解。\n"
            f"- 讲解风格：{style_text}\n"
            f"- 时长：{length_text}\n"
            "- 输出：用短句分段（便于语音播报），必要时用项目符号。\n"
            "- 约束：不要编造；如果知识库/上下文没有依据，请明确说明不确定，并建议咨询现场工作人员。\n"
        )
        return f"{raw_question}\n\n{guide_text}"

    question_for_rag = _apply_guide_prompt(question)

    def generate_response():
        def sse_event(payload: dict) -> str:
            payload.setdefault("request_id", request_id)
            payload.setdefault("t_ms", int((time.perf_counter() - t_submit) * 1000))
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            yield sse_event(
                {
                    "meta": {
                        "intent": intent.intent,
                        "intent_confidence": round(float(intent.confidence), 3),
                        "intent_matched": list(intent.matched),
                        "intent_reason": intent.reason,
                    },
                    "done": False,
                }
            )
            last_complete_content = ""
            ragflow_config = load_ragflow_config() or {}
            text_cleaning = ragflow_config.get("text_cleaning", {}) or {}

            enable_cleaning = bool(text_cleaning.get("enabled", False))
            cleaning_level = text_cleaning.get("cleaning_level", "standard")
            language = text_cleaning.get("language", "zh-CN")
            tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
            max_chunk_size = int(text_cleaning.get("max_chunk_size", 200))
            start_tts_on_first_chunk = bool(text_cleaning.get("start_tts_on_first_chunk", True))
            first_segment_min_chars = int(text_cleaning.get("first_segment_min_chars", 10))
            segment_flush_interval_s = float(text_cleaning.get("segment_flush_interval_s", 0.8))
            segment_min_chars = int(text_cleaning.get("segment_min_chars", first_segment_min_chars))

            text_cleaner = None
            tts_buffer = None
            emitted_segments = set()
            last_segment_emit_at = t_submit
            segment_seq = 0

            if enable_cleaning:
                try:
                    from text_cleaner import TTSTextCleaner
                    from tts_buffer import TTSBuffer

                    text_cleaner = TTSTextCleaner(language=language, cleaning_level=cleaning_level)
                    tts_buffer = TTSBuffer(max_chunk_size=max_chunk_size, language=language) if tts_buffer_enabled else None
                except Exception as e:
                    logger.warning(f"文本清洗/分段模块不可用，降级为整段TTS: {e}")
                    enable_cleaning = False

            rag_session = None
            if not agent_id:
                rag_session = ragflow_service.get_session(conversation_name) if conversation_name else session

            if intent.intent in ("direction", "complaint", "chitchat") and float(intent.confidence) >= 0.78:
                if intent.intent == "direction":
                    fast_answer = (
                        "我可以帮你指路～\n"
                        "请告诉我你要去的目标位置（例如：某展位/厕所/出口/前台），以及你现在大概在什么位置（例如：入口/某展区）。\n"
                        "我会给你最短路线，并提示沿途的明显标识。"
                    )
                elif intent.intent == "complaint":
                    fast_answer = (
                        "非常抱歉给你带来不好的体验。\n"
                        "为了尽快帮你解决，请告诉我：发生了什么、在什么位置/哪个环节、以及你希望的处理方式。\n"
                        "如果需要，我也可以引导你到服务台或联系现场工作人员。"
                    )
                else:
                    fast_answer = "你好！我在～你可以直接问我展厅/产品相关问题，或说“开始讲解”。"

                yield sse_event({"chunk": fast_answer, "done": False})
                yield sse_event({"chunk": "", "done": True})
                try:
                    history_store.add_entry(
                        request_id=request_id,
                        question=question,
                        answer=fast_answer,
                        mode="agent" if agent_id else "chat",
                        chat_name=conversation_name,
                        agent_id=agent_id,
                    )
                except Exception:
                    logger.warning(f"[{request_id}] history_store_save_failed", exc_info=True)
                return

            if (not agent_id) and (not rag_session):
                logger.warning("RAGFlow不可用，使用固定回答")
                fallback_answer = f"我收到了你的问题：{question}。由于RAGFlow服务暂时不可用，我现在只能给你一个固定的回答。请确保RAGFlow服务正在运行。"

                for char in fallback_answer:
                    yield sse_event({"chunk": char, "done": False})

                    if text_cleaner and tts_buffer:
                        cleaned = text_cleaner.clean_streaming_chunk(char, is_partial=True)
                        for seg in tts_buffer.add_cleaned_chunk(cleaned):
                            seg = seg.strip()
                            if not seg or seg in emitted_segments:
                                continue
                            emitted_segments.add(seg)
                            yield sse_event({"segment": seg, "done": False})

                    time.sleep(0.05)  # 模拟流式输出

                if text_cleaner and tts_buffer:
                    for seg in tts_buffer.finalize():
                        seg = seg.strip()
                        if not seg or seg in emitted_segments:
                            continue
                        emitted_segments.add(seg)
                        yield sse_event({"segment": seg, "done": False})

                yield sse_event({"chunk": "", "done": True})
                try:
                    history_store.add_entry(
                        request_id=request_id,
                        question=question,
                        answer=fallback_answer,
                        mode="agent" if agent_id else "chat",
                        chat_name=conversation_name,
                        agent_id=agent_id,
                    )
                except Exception:
                    logger.warning(f"[{request_id}] history_store_fallback_save_failed", exc_info=True)
                return

            t_ragflow_request = time.perf_counter()
            if agent_id:
                logger.info(f"[{request_id}] 开始RAGFlow Agent流式响应 agent_id={agent_id}")
                try:
                    response = ragflow_agent_service.stream_completion_text(agent_id, question_for_rag, request_id=request_id)
                except Exception as e:
                    logger.error(f"[{request_id}] ragflow_agent_stream_init_failed err={e}", exc_info=True)
                    msg = (
                        f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                        f"请检查 RAGFlow 服务日志/版本或接口权限。"
                    )
                    yield sse_event({"chunk": msg, "done": False})
                    yield sse_event({"chunk": "", "done": True})
                    return
            else:
                logger.info(f"[{request_id}] 开始RAGFlow流式响应")
                response = rag_session.ask(question_for_rag, stream=True)
                logger.info(
                    f"[{request_id}] RAGFlow响应对象创建成功 dt={time.perf_counter() - t_ragflow_request:.3f}s"
                )

            chunk_count = 0
            first_ragflow_chunk_at = None
            first_ragflow_text_at = None
            first_segment_at = None
            carry_segment_text = ""

            for chunk in response:
                chunk_count += 1
                if first_ragflow_chunk_at is None:
                    first_ragflow_chunk_at = time.perf_counter()
                    logger.info(
                        f"[{request_id}] ragflow_first_chunk dt={first_ragflow_chunk_at - t_submit:.3f}s chunk_type={type(chunk)}"
                    )
                    _timings_set(request_id, t_ragflow_first_chunk=first_ragflow_chunk_at)
                #logger.info(f"收到chunk #{chunk_count}: {type(chunk)} - {chunk}")

                content = None
                if agent_id:
                    if isinstance(chunk, str):
                        content = last_complete_content + chunk
                    else:
                        content = str(chunk) if chunk is not None else ""
                elif chunk and hasattr(chunk, 'content'):
                    content = chunk.content

                if isinstance(content, str):
                    logger.info(f"Chunk内容长度: {len(content)}")

                    # 只处理更长和更完整的内容（去重）
                    if len(content) > len(last_complete_content):
                        new_part = content[len(last_complete_content):]
                        logger.info(f"增量内容: {new_part[:50]}...")
                        if first_ragflow_text_at is None and new_part.strip():
                            first_ragflow_text_at = time.perf_counter()
                            logger.info(
                                f"[{request_id}] ragflow_first_text dt={first_ragflow_text_at - t_submit:.3f}s chars={len(new_part)}"
                            )
                            _timings_set(request_id, t_ragflow_first_text=first_ragflow_text_at)

                        yield sse_event({"chunk": new_part, "done": False})

                        if text_cleaner and tts_buffer:
                            cleaned = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)
                            ready_segments = tts_buffer.add_cleaned_chunk(cleaned)
                            if (
                                start_tts_on_first_chunk
                                and not ready_segments
                                and first_segment_at is None
                                and first_ragflow_chunk_at is not None
                            ):
                                forced = tts_buffer.force_emit(min_chars=first_segment_min_chars)
                                if forced:
                                    logger.info(
                                        f"[{request_id}] force_emit_first_segment chars={len(forced[0])} min_chars={first_segment_min_chars}"
                                    )
                                ready_segments = ready_segments + forced
                            if (
                                segment_flush_interval_s > 0
                                and not ready_segments
                                and (time.perf_counter() - last_segment_emit_at) >= segment_flush_interval_s
                            ):
                                forced = tts_buffer.force_emit(min_chars=segment_min_chars)
                                if forced:
                                    logger.info(
                                        f"[{request_id}] force_emit_segment chars={len(forced[0])} min_chars={segment_min_chars} flush_interval_s={segment_flush_interval_s}"
                                    )
                                ready_segments = ready_segments + forced
                            for seg in ready_segments:
                                seg = seg.strip()
                                if carry_segment_text:
                                    seg = (carry_segment_text + seg).strip()
                                    carry_segment_text = ""
                                # Avoid very short segments (likely to increase TTS calls and cause artifacts).
                                # If it does not end with a strong sentence boundary, merge into next segment.
                                if (
                                    segment_min_chars > 0
                                    and len(seg) < int(segment_min_chars)
                                    and not seg.endswith(("。", "！", "？", ".", "!", "?"))
                                ):
                                    carry_segment_text = seg
                                    logger.info(
                                        f"[{request_id}] hold_short_segment chars={len(seg)} min_chars={segment_min_chars}"
                                    )
                                    continue
                                if not seg or seg in emitted_segments:
                                    continue
                                emitted_segments.add(seg)
                                segment_seq += 1
                                last_segment_emit_at = time.perf_counter()
                                logger.info(
                                    f"[{request_id}] emit_segment seq={segment_seq} dt={last_segment_emit_at - t_submit:.3f}s chars={len(seg)}"
                                )
                                if first_segment_at is None:
                                    first_segment_at = time.perf_counter()
                                    logger.info(
                                        f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                                    )
                                    _timings_set(request_id, t_first_tts_segment=first_segment_at)
                                yield sse_event({"segment": seg, "done": False})

                        last_complete_content = content
                    else:
                        logger.info("跳过重复或较短的内容")
                else:
                    logger.warning(f"Chunk没有content属性: {chunk}")

            logger.info(
                f"[{request_id}] 流式响应结束 total_dt={time.perf_counter() - t_submit:.3f}s total_chunks={chunk_count}"
            )

            if text_cleaner and tts_buffer:
                if carry_segment_text:
                    tts_buffer.current_sentence = (carry_segment_text + " " + (tts_buffer.current_sentence or "")).strip()
                    carry_segment_text = ""
                for seg in tts_buffer.finalize():
                    seg = seg.strip()
                    if not seg or seg in emitted_segments:
                        continue
                    emitted_segments.add(seg)
                    if first_segment_at is None:
                        first_segment_at = time.perf_counter()
                        logger.info(
                            f"[{request_id}] first_tts_segment_finalize dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                        )
                        _timings_set(request_id, t_first_tts_segment=first_segment_at)
                    yield sse_event({"segment": seg, "done": False})

            yield sse_event({"chunk": "", "done": True})
            try:
                history_store.add_entry(
                    request_id=request_id,
                    question=question,
                    answer=last_complete_content,
                    mode="agent" if agent_id else "chat",
                    chat_name=conversation_name,
                    agent_id=agent_id,
                )
            except Exception:
                logger.warning(f"[{request_id}] history_store_save_failed", exc_info=True)

        except GeneratorExit:
            logger.info(f"[{request_id}] ask_stream_generator_exit (client_disconnect?)")
            return
        except Exception as e:
            logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
            if agent_id and "ragflow_agent_completion_no_data" in str(e):
                msg = (
                    f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                    f"请检查 RAGFlow 服务日志/版本或接口权限。"
                )
                yield sse_event({"chunk": msg, "done": True})
            else:
                yield sse_event({"chunk": f"错误: {str(e)}", "done": True})

    logger.info("返回流式响应")
    return Response(
        generate_response(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@app.route('/api/text_to_speech', methods=['POST'])
def text_to_speech():
    logger.info("收到TTS请求")
    data = request.get_json()
    logger.info(f"TTS请求数据: {data}")

    if not data or not data.get('text'):
        logger.error("TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"tts_{uuid.uuid4().hex[:12]}"
    )
    logger.info(f"[{request_id}] tts_request_received endpoint=/api/text_to_speech chars={len(text)} preview={text[:60]!r}")

    app_config = load_app_config()
    provider = (
        data.get("tts_provider")
        or request.headers.get("X-TTS-Provider")
        or _get_nested(app_config, ["tts", "provider"], "local")
    )
    tts_service.tts_state_update(
        request_id,
        data.get("segment_index", None),
        provider=str(provider),
        endpoint="/api/text_to_speech",
    )
    logger.info(f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')}")

    def generate_audio():
        try:
            logger.info(f"[{request_id}] 开始TTS音频生成 provider={provider}")
            yield from tts_service.stream(
                text=text,
                request_id=request_id,
                config=app_config,
                provider=provider,
                endpoint="/api/text_to_speech",
                segment_index=data.get("segment_index", None),
            )
        except GeneratorExit:
            logger.info(f"[{request_id}] tts_generator_exit endpoint=/api/text_to_speech (client_disconnect?)")
            raise
        except Exception as e:
            logger.error(f"[{request_id}] TTS音频生成异常: {e}", exc_info=True)

    return Response(
        generate_audio(),
        mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@app.route('/api/text_to_speech_stream', methods=['GET', 'POST'])
def text_to_speech_stream():
    t_received = time.perf_counter()
    logger.info("收到流式TTS请求")
    if request.method == "GET":
        data = dict(request.args) if request.args else {}
        logger.info(f"流式TTS请求数据(GET): {data}")
    else:
        data = request.get_json()
        logger.info(f"流式TTS请求数据(POST): {data}")

    if not data or not data.get('text'):
        logger.error("流式TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"tts_{uuid.uuid4().hex[:12]}"
    )
    segment_index = data.get("segment_index", None)
    logger.info(
        f"[{request_id}] tts_request_received endpoint=/api/text_to_speech_stream method={request.method} chars={len(text)} seg={segment_index} preview={text[:60]!r}"
    )
    ask_timing = _timings_get(request_id)
    if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
        dt_since_submit = time.perf_counter() - float(ask_timing["t_submit"])
        logger.info(f"[{request_id}] tts_request_received_since_submit dt={dt_since_submit:.3f}s")

    app_config = load_app_config()
    provider = (
        data.get("tts_provider")
        or request.headers.get("X-TTS-Provider")
        or _get_nested(app_config, ["tts", "provider"], "local")
    )
    tts_service.tts_state_update(
        request_id,
        segment_index,
        provider=str(provider),
        endpoint="/api/text_to_speech_stream",
    )
    logger.info(
        f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')} remote={request.remote_addr} ua={(request.headers.get('User-Agent') or '')[:60]!r}"
    )

    def generate_streaming_audio():
        try:
            logger.info(f"[{request_id}] 开始流式TTS音频生成 provider={provider}")

            total_size = 0
            chunk_count = 0
            first_audio_chunk_at = None

            for chunk in tts_service.stream(
                text=text,
                request_id=request_id,
                config=app_config,
                provider=provider,
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
            ):
                if not chunk:
                    continue
                chunk_count += 1
                total_size += len(chunk)
                if first_audio_chunk_at is None:
                    first_audio_chunk_at = time.perf_counter()
                    logger.info(
                        f"[{request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - t_received:.3f}s bytes={len(chunk)}"
                    )
                    ask_timing = _timings_get(request_id)
                    if ask_timing and isinstance(ask_timing.get('t_submit'), (int, float)):
                        since_submit = first_audio_chunk_at - float(ask_timing['t_submit'])
                        logger.info(f"[{request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                        if isinstance(ask_timing.get('t_first_tts_segment'), (int, float)):
                            since_first_segment = first_audio_chunk_at - float(ask_timing['t_first_tts_segment'])
                            logger.info(
                                f"[{request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                            )
                yield chunk

                if chunk_count <= 3:  # 只记录前几个chunk
                    logger.info(f"[{request_id}] 流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

            logger.info(
                f"[{request_id}] 流式TTS音频生成完成 total_dt={time.perf_counter() - t_received:.3f}s 总大小: {total_size} bytes, chunk数量: {chunk_count}"
            )
            return
            url = "http://127.0.0.1:9880/tts"
            payload = {
                "text": text,
                "text_lang": "zh",
                "ref_audio_path": "Liang/converted_temp_first_90s.wav_0000000000_0000182720.wav",
                "prompt_lang": "zh",
                "prompt_text": "平台呢因为从我们的初创团队的理解的角度呢，我们觉得一个初创公司。",
                "low_latency": True,
                "media_type": "wav",
            }

            headers = {"X-Request-ID": request_id}
            logger.info(f"[{request_id}] 发送流式TTS请求到: {url}")

            with requests.post(url, json=payload, headers=headers, stream=True, timeout=30) as r:
                logger.info(
                    f"[{request_id}] 流式TTS响应状态: {r.status_code} dt={time.perf_counter() - t_received:.3f}s"
                )

                if r.status_code != 200:
                    logger.error(f"[{request_id}] 流式TTS服务返回错误: {r.status_code}")
                    return

                total_size = 0
                chunk_count = 0
                first_audio_chunk_at = None

                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        chunk_count += 1
                        total_size += len(chunk)
                        if first_audio_chunk_at is None:
                            first_audio_chunk_at = time.perf_counter()
                            logger.info(
                                f"[{request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - t_received:.3f}s bytes={len(chunk)}"
                            )
                            ask_timing = _timings_get(request_id)
                            if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
                                since_submit = first_audio_chunk_at - float(ask_timing["t_submit"])
                                logger.info(f"[{request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                                if isinstance(ask_timing.get("t_first_tts_segment"), (int, float)):
                                    since_first_segment = first_audio_chunk_at - float(ask_timing["t_first_tts_segment"])
                                    logger.info(
                                        f"[{request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                                    )
                        yield chunk

                        if chunk_count <= 3:  # 只记录前几个chunk
                            logger.info(f"[{request_id}] 流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

                logger.info(
                    f"[{request_id}] 流式TTS音频生成完成 total_dt={time.perf_counter() - t_received:.3f}s 总大小: {total_size} bytes, chunk数量: {chunk_count}"
                )

        except GeneratorExit:
            logger.info(f"[{request_id}] tts_stream_generator_exit endpoint=/api/text_to_speech_stream (client_disconnect?)")
            raise
        except Exception as e:
            logger.error(f"[{request_id}] tts_stream_exception {e} provider={provider}", exc_info=True)

    return Response(
        generate_streaming_audio(),
        mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == '__main__':
    logger.info("启动语音问答后端服务")
    logger.info(f"FunASR模型状态: {'已加载' if asr_model_loaded else '未加载'}")
    logger.info(f"RAGFlow状态: {'已连接' if session else '未连接'}")
    app.run(host='0.0.0.0', port=8000, debug=True)
