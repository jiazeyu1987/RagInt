from __future__ import annotations

import base64
import contextlib
import logging
import queue
import threading
import time

import numpy as np
import requests

from .config_utils import get_nested

_DASHSCOPE_POOL = None
_DASHSCOPE_POOL_LOCK = threading.Lock()


def _dashscope_get_pool(max_size: int):
    global _DASHSCOPE_POOL
    with _DASHSCOPE_POOL_LOCK:
        if _DASHSCOPE_POOL is None:
            from dashscope.audio.tts_v2 import SpeechSynthesizerObjectPool

            _DASHSCOPE_POOL = SpeechSynthesizerObjectPool(max_size=max(1, int(max_size)))
        return _DASHSCOPE_POOL


class TTSSvc:
    def __init__(self, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._tts_state = {}
        self._tts_state_lock = threading.Lock()

    def _tts_state_prune(self, now_perf: float, ttl_s: float = 600.0, max_items: int = 500):
        with self._tts_state_lock:
            items = list(self._tts_state.items())
            for key, value in items:
                t_last = value.get("t_last")
                if isinstance(t_last, (int, float)) and (now_perf - float(t_last)) > ttl_s:
                    self._tts_state.pop(key, None)
            if len(self._tts_state) > max_items:
                ordered = sorted(
                    self._tts_state.items(),
                    key=lambda kv: float(kv[1].get("t_last", now_perf)),
                )
                for key, _ in ordered[: max(0, len(self._tts_state) - max_items)]:
                    self._tts_state.pop(key, None)

    def tts_state_update(self, request_id: str, segment_index, provider: str, endpoint: str):
        now_perf = time.perf_counter()
        self._tts_state_prune(now_perf)
        try:
            seg_int = int(segment_index) if segment_index is not None and str(segment_index).strip() != "" else None
        except Exception:
            seg_int = None

        with self._tts_state_lock:
            state = self._tts_state.get(request_id) or {
                "t_first": now_perf,
                "t_last": now_perf,
                "count": 0,
                "last_segment_index": None,
                "last_provider": None,
            }
            state["t_last"] = now_perf
            state["count"] = int(state.get("count", 0) or 0) + 1
            last_seg = state.get("last_segment_index", None)
            state["last_provider"] = provider

            warn = None
            if seg_int is not None and last_seg is not None:
                if seg_int == last_seg:
                    warn = "duplicate_segment_index"
                elif seg_int < last_seg:
                    warn = "out_of_order_segment_index"
                elif seg_int > last_seg + 1:
                    warn = "segment_index_gap"
            if seg_int is not None:
                state["last_segment_index"] = seg_int

            self._tts_state[request_id] = state

        if warn:
            self._logger.warning(
                f"[{request_id}] tts_order_warning type={warn} endpoint={endpoint} provider={provider} seg={seg_int} last={last_seg}"
            )
        else:
            self._logger.info(
                f"[{request_id}] tts_request_seen endpoint={endpoint} provider={provider} seg={seg_int} count={state['count']}"
            )

    def stream(
        self,
        *,
        text: str,
        request_id: str,
        config: dict,
        provider: str,
        endpoint: str,
        segment_index=None,
        cancel_event: threading.Event | None = None,
    ):
        provider_norm = (provider or "").strip().lower() or "local"
        self.tts_state_update(request_id, segment_index, provider_norm, endpoint)
        yield from self._stream_tts_provider(
            text=text, request_id=request_id, provider=provider_norm, config=config, cancel_event=cancel_event
        )

    def _stream_tts_provider(self, text: str, request_id: str, provider: str, config: dict, cancel_event: threading.Event | None = None):
        provider_norm = (provider or "").strip().lower() or "local"
        if provider_norm == "bailian":
            self._logger.info(f"[{request_id}] tts_provider_select provider=bailian")
            yield from self._stream_bailian_tts(text=text, request_id=request_id, config=config, cancel_event=cancel_event)
            return

        local_enabled = get_nested(config, ["tts", "local", "enabled"], True)
        if local_enabled is False:
            bailian_cfg = get_nested(config, ["tts", "bailian"], {}) or {}
            if str(bailian_cfg.get("api_key", "")).strip() and str(bailian_cfg.get("voice", "")).strip():
                self._logger.info(f"[{request_id}] local_tts_disabled -> fallback_to_bailian")
                yield from self._stream_bailian_tts(text=text, request_id=request_id, config=config)
                return
            raise ValueError("local TTS is disabled and bailian is not configured")

        self._logger.info(f"[{request_id}] tts_provider_select provider=local")
        yield from self._stream_local_gpt_sovits(text=text, request_id=request_id, config=config, cancel_event=cancel_event)

    def _stream_local_gpt_sovits(self, text: str, request_id: str, config: dict, cancel_event: threading.Event | None = None):
        tts_cfg = get_nested(config, ["tts", "local"], {}) or {}
        if tts_cfg.get("enabled") is False:
            raise ValueError("local TTS is disabled by config: tts.local.enabled=false")
        url = tts_cfg.get("url", "http://127.0.0.1:9880/tts")
        timeout_s = float(tts_cfg.get("timeout_s", 30))

        payload = {
            "text": text,
            "text_lang": tts_cfg.get("text_lang", "zh"),
            "ref_audio_path": tts_cfg.get("ref_audio_path", ""),
            "prompt_lang": tts_cfg.get("prompt_lang", "zh"),
            "prompt_text": tts_cfg.get("prompt_text", ""),
            "low_latency": bool(tts_cfg.get("low_latency", True)),
            "media_type": tts_cfg.get("media_type", "wav"),
        }

        headers = {"X-Request-ID": request_id}
        self._logger.info(
            f"[{request_id}] local_tts_request url={url} timeout_s={timeout_s} media_type={payload.get('media_type')} chars={len(text)}"
        )
        cancel_event = cancel_event or threading.Event()
        if cancel_event.is_set():
            return
        r = requests.post(url, json=payload, headers=headers, stream=True, timeout=timeout_s)
        try:
            self._logger.info(f"[{request_id}] local_tts status={r.status_code} ct={r.headers.get('Content-Type')}")
            if r.status_code != 200:
                self._logger.error(f"[{request_id}] local_tts_failed status={r.status_code} body={r.text[:200]}")
                return
            for chunk in r.iter_content(chunk_size=4096):
                if cancel_event.is_set():
                    self._logger.info(f"[{request_id}] local_tts_cancelled")
                    break
                if chunk:
                    yield chunk
        finally:
            with contextlib.suppress(Exception):
                r.close()

    def _stream_bailian_tts(self, text: str, request_id: str, config: dict, cancel_event: threading.Event | None = None):
        bailian_cfg = get_nested(config, ["tts", "bailian"], {}) or {}
        mode = str(bailian_cfg.get("mode", "dashscope")).strip().lower() or "dashscope"
        if mode == "http":
            yield from self._stream_bailian_tts_http(text=text, request_id=request_id, config=config, cancel_event=cancel_event)
            return
        yield from self._stream_bailian_tts_dashscope(text=text, request_id=request_id, config=config, cancel_event=cancel_event)

    def _stream_bailian_tts_http(self, text: str, request_id: str, config: dict, cancel_event: threading.Event | None = None):
        bailian_cfg = get_nested(config, ["tts", "bailian"], {}) or {}
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

        cancel_event = cancel_event or threading.Event()
        if cancel_event.is_set():
            return
        self._logger.info(
            f"[{request_id}] bailian_http_tts_request method={method} url={url} timeout_s={timeout_s} text_field={text_field} chars={len(text)}"
        )
        r = requests.request(method, url, json=payload, headers=headers, stream=True, timeout=timeout_s)
        try:
            self._logger.info(f"[{request_id}] bailian_http_tts status={r.status_code} ct={r.headers.get('Content-Type')}")
            if r.status_code != 200:
                self._logger.error(f"[{request_id}] bailian_http_tts_failed status={r.status_code} body={r.text[:200]}")
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
                if cancel_event.is_set():
                    self._logger.info(f"[{request_id}] bailian_http_tts_cancelled")
                    break
                if chunk:
                    yield chunk
        finally:
            with contextlib.suppress(Exception):
                r.close()

    def _stream_bailian_tts_dashscope(
        self, text: str, request_id: str, config: dict, cancel_event: threading.Event | None = None
    ):
        bailian_cfg = get_nested(config, ["tts", "bailian"], {}) or {}
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
        q: queue.Queue[bytes | None] = queue.Queue(maxsize=max(8, queue_max_chunks))
        complete_event = threading.Event()
        stop_event = threading.Event()
        canceled = False
        backpressure_waits = 0
        suspect_stream = False

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
            def __init__(self, logger: logging.Logger):
                super().__init__()
                self._logger = logger

            def on_open(self):
                self._logger.info(
                    f"[{request_id}] dashscope_tts_open model={model} voice={voice} format={fmt} sample_rate={sample_rate} pool={use_connection_pool}"
                )

            def on_complete(self):
                self._logger.info(f"[{request_id}] dashscope_tts_complete")
                complete_event.set()
                with contextlib.suppress(Exception):
                    q.put_nowait(None)

            def on_error(self, message: str):
                self._logger.error(f"[{request_id}] dashscope_tts_error {message}")
                complete_event.set()
                with contextlib.suppress(Exception):
                    q.put_nowait(None)

            def on_close(self):
                self._logger.info(f"[{request_id}] dashscope_tts_close")

            def on_event(self, message):
                return

            def on_data(self, data: bytes) -> None:
                if stop_event.is_set():
                    return
                if data:
                    # Do not drop audio bytes (dropping can corrupt WAV -> white noise).
                    # Instead, apply bounded waiting and stop quickly if client disconnected.
                    nonlocal backpressure_waits
                    while not stop_event.is_set():
                        try:
                            q.put(data, timeout=0.5)
                            return
                        except queue.Full:
                            backpressure_waits += 1
                            if backpressure_waits in (1, 10, 50) or backpressure_waits % 200 == 0:
                                self._logger.info(
                                    f"[{request_id}] dashscope_tts_backpressure_wait waits={backpressure_waits} qsize={getattr(q, 'qsize', lambda: -1)()}"
                                )
                            continue

        synthesizer_callback = Callback(self._logger)

        speech_synthesizer = None
        try:
            cancel_event = cancel_event or threading.Event()
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
            self._logger.info(
                f"[{request_id}] dashscope_tts_call start chars={len(text)} volume={volume} speech_rate={speech_rate} pitch_rate={pitch_rate} additional_params={list(additional_params.keys())}"
            )
            if cancel_event.is_set():
                canceled = True
                stop_event.set()
                return
            speech_synthesizer.call(text)

            first_chunk = True
            wav_probe_done = False
            wav_probe_buf = bytearray()
            pcm_probe_done = False
            pcm_probe_buf = bytearray()
            pcm_probe_target_bytes = int(bailian_cfg.get("pcm_probe_target_bytes", 32000) or 32000)
            first_chunk_timeout_s = float(bailian_cfg.get("first_chunk_timeout_s", 12.0))

            def _try_parse_wav_header(buf: bytes):
                if len(buf) < 44:
                    return None
                if not (buf.startswith(b"RIFF") and buf[8:12] == b"WAVE"):
                    return None

                def u16(off):
                    return int.from_bytes(buf[off : off + 2], "little", signed=False)

                def u32(off):
                    return int.from_bytes(buf[off : off + 4], "little", signed=False)

                offset = 12
                audio_format_val = None
                channels = None
                sample_rate_val = None
                bits_per_sample = None
                data_offset = None
                while offset + 8 <= len(buf):
                    chunk_id = buf[offset : offset + 4]
                    chunk_size = u32(offset + 4)
                    payload = offset + 8
                    if chunk_id == b"fmt " and payload + 16 <= len(buf):
                        audio_format_val = u16(payload + 0)
                        channels = u16(payload + 2)
                        sample_rate_val = u32(payload + 4)
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
                    "audio_format": audio_format_val,
                    "channels": channels,
                    "sample_rate": sample_rate_val,
                    "bits_per_sample": bits_per_sample,
                    "data_offset": data_offset,
                }

            while True:
                if cancel_event.is_set():
                    canceled = True
                    stop_event.set()
                    self._logger.info(f"[{request_id}] dashscope_tts_cancelled")
                    if speech_synthesizer is not None:
                        with contextlib.suppress(Exception):
                            speech_synthesizer.streaming_cancel()
                    break
                try:
                    item = q.get(timeout=0.5)
                except queue.Empty:
                    if first_chunk and first_chunk_timeout_s > 0 and (time.perf_counter() - t_call) >= first_chunk_timeout_s:
                        self._logger.error(
                            f"[{request_id}] dashscope_tts_first_chunk_timeout timeout_s={first_chunk_timeout_s} (canceling)"
                        )
                        canceled = True
                        with contextlib.suppress(Exception):
                            speech_synthesizer.streaming_cancel()
                        break
                    if not first_chunk and hasattr(q, "qsize"):
                        qs = q.qsize()
                        if qs >= 64:
                            self._logger.info(f"[{request_id}] dashscope_tts_queue qsize={qs}")
                    if complete_event.is_set():
                        break
                    continue
                if item is None:
                    break
                if first_chunk:
                    first_chunk = False
                    is_riff = item[:12].startswith(b"RIFF")
                    self._logger.info(
                        f"[{request_id}] dashscope_tts_first_chunk dt={time.perf_counter() - t_call:.3f}s bytes={len(item)} riff={is_riff}"
                    )
                    if not is_riff:
                        self._logger.warning(f"[{request_id}] dashscope_tts_first_chunk_prefix hex={item[:16].hex()}")
                        if fmt == "wav":
                            suspect_stream = True

                if not wav_probe_done:
                    if len(wav_probe_buf) < 8192:
                        wav_probe_buf.extend(item[: max(0, 8192 - len(wav_probe_buf))])
                    parsed = _try_parse_wav_header(wav_probe_buf)
                    if parsed:
                        wav_probe_done = True
                        self._logger.info(
                            f"[{request_id}] wav_probe audio_format={parsed['audio_format']} channels={parsed['channels']} sample_rate={parsed['sample_rate']} bits={parsed['bits_per_sample']} data_offset={parsed['data_offset']}"
                        )
                        if parsed.get("audio_format") not in (1, None) or parsed.get("bits_per_sample") not in (16, None):
                            self._logger.warning(f"[{request_id}] wav_probe_unexpected {parsed}")
                            if fmt == "wav":
                                suspect_stream = True
                    elif len(wav_probe_buf) >= 8192:
                        wav_probe_done = True
                        self._logger.warning(f"[{request_id}] wav_probe_failed buffered=8192")
                        if fmt == "wav":
                            suspect_stream = True

                if not pcm_probe_done:
                    if len(pcm_probe_buf) < pcm_probe_target_bytes and item:
                        pcm_probe_buf.extend(item[: max(0, pcm_probe_target_bytes - len(pcm_probe_buf))])
                    if len(pcm_probe_buf) >= pcm_probe_target_bytes and pcm_probe_target_bytes > 0:
                        pcm_probe_done = True
                        try:
                            buf = bytes(pcm_probe_buf)
                            header = _try_parse_wav_header(buf)
                            if header and isinstance(header.get("data_offset"), int):
                                buf = buf[int(header["data_offset"]) :]
                            if len(buf) >= 2000:
                                arr = np.frombuffer(buf[: min(len(buf), 64000)], dtype="<i2").astype(np.float32)
                                if arr.size:
                                    peak = float(np.max(np.abs(arr)) / 32768.0)
                                    rms = float(np.sqrt(np.mean((arr / 32768.0) ** 2)))
                                    zcr = float(np.mean(np.abs(np.diff(np.sign(arr))) > 0))
                                    mean = float(np.mean(arr / 32768.0))
                                    self._logger.info(
                                        f"[{request_id}] pcm_probe peak={peak:.3f} rms={rms:.3f} zcr={zcr:.3f} mean={mean:.4f} samples={arr.size}"
                                    )
                                    if zcr > 0.35 and rms > 0.05:
                                        self._logger.warning(
                                            f"[{request_id}] pcm_probe_suspect_white_noise zcr={zcr:.3f} rms={rms:.3f}"
                                        )
                                        suspect_stream = True
                        except Exception as e:
                            self._logger.warning(f"[{request_id}] pcm_probe_failed {e}")

                yield item
        except GeneratorExit:
            canceled = True
            stop_event.set()
            self._logger.info(f"[{request_id}] dashscope_tts_generator_exit (client_disconnect?)")
            if speech_synthesizer is not None:
                with contextlib.suppress(Exception):
                    speech_synthesizer.streaming_cancel()
            raise
        except Exception as e:
            self._logger.error(f"[{request_id}] dashscope_tts_exception {e}", exc_info=True)
        finally:
            stop_event.set()
            if speech_synthesizer is not None:
                with contextlib.suppress(Exception):
                    sdk_rid = speech_synthesizer.get_last_request_id()
                    first_pkg_ms = speech_synthesizer.get_first_package_delay()
                    self._logger.info(f"[{request_id}] dashscope_tts_metrics requestId={sdk_rid} first_pkg_delay_ms={first_pkg_ms}")
            if speech_synthesizer is not None:
                if use_connection_pool and not canceled and complete_event.is_set():
                    if suspect_stream or backpressure_waits > 0:
                        self._logger.warning(
                            f"[{request_id}] dashscope_tts_pool_skip_return suspect={suspect_stream} backpressure_waits={backpressure_waits} -> close"
                        )
                        with contextlib.suppress(Exception):
                            speech_synthesizer.close()
                    else:
                        with contextlib.suppress(Exception):
                            pool = _dashscope_get_pool(pool_max_size)
                            pool.return_synthesizer(speech_synthesizer)
                else:
                    with contextlib.suppress(Exception):
                        speech_synthesizer.close()
