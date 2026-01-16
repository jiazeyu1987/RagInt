from __future__ import annotations

import contextlib
import logging
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path

import numpy as np

from .config_utils import get_nested


class SuppressOutput:
    def __enter__(self):
        import sys

        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open(Path(Path().anchor) / "devnull", "w") if False else open("nul", "w")  # Windows
        sys.stderr = open("nul", "w")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys

        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr


def _run_ffmpeg_convert_to_wav16k_mono(
    input_path: str,
    output_path: str,
    *,
    trim_silence: bool = True,
    normalize: bool = False,
    loudnorm_filter: str | None = None,
    silenceremove_filter: str | None = None,
    cancel_event: threading.Event | None = None,
) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input_path,
        "-vn",
    ]
    af_parts = []
    if normalize:
        # Normalize low-volume recordings; safe default, configurable via config.
        af_parts.append(str(loudnorm_filter or "loudnorm=I=-16:TP=-1.5:LRA=11"))
    if trim_silence:
        # Apply normalization FIRST, then trim; otherwise low-volume speech can be removed entirely.
        af_parts.append(
            str(
                silenceremove_filter
                or "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:"
                "stop_periods=1:stop_silence=0.30:stop_threshold=-45dB"
            )
        )
    if af_parts:
        cmd += ["-af", ",".join(af_parts)]
    cmd += [
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        output_path,
    ]
    cancel_event = cancel_event or threading.Event()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        while True:
            rc = p.poll()
            if rc is not None:
                if rc != 0:
                    err = ""
                    with contextlib.suppress(Exception):
                        if p.stderr:
                            err = p.stderr.read() or ""
                    err = (err or "").strip()
                    raise RuntimeError(f"ffmpeg_convert_failed rc={rc} err={err[:500]}")
                return
            if cancel_event.is_set():
                with contextlib.suppress(Exception):
                    p.terminate()
                with contextlib.suppress(Exception):
                    p.kill()
                raise RuntimeError("asr_cancelled")
            time.sleep(0.05)
    finally:
        with contextlib.suppress(Exception):
            if p.stdout:
                p.stdout.close()
        with contextlib.suppress(Exception):
            if p.stderr:
                p.stderr.close()


def _wav_probe(path: str) -> dict:
    with wave.open(path, "rb") as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        frames = wf.getnframes()
        raw = wf.readframes(frames)

    duration_s = float(frames) / float(sample_rate) if sample_rate else 0.0
    info: dict = {
        "channels": channels,
        "sample_rate": sample_rate,
        "sample_width": sample_width,
        "frames": frames,
        "duration_s": duration_s,
        "bytes": len(raw),
    }
    if channels == 1 and sample_rate == 16000 and sample_width == 2 and raw:
        arr = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        if arr.size:
            info["peak"] = float(np.max(np.abs(arr)))
            info["rms"] = float(np.sqrt(np.mean(arr**2)))
            info["samples"] = int(arr.size)
    return info


def _read_wav_pcm16_mono_16k(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        frames = wf.getnframes()
        raw = wf.readframes(frames)
    if channels != 1 or sample_rate != 16000 or sample_width != 2:
        raise ValueError(f"unexpected wav format ch={channels} sr={sample_rate} sw={sample_width}")
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _dashscope_asr_recognize(
    wav_path: str, *, api_key: str, model: str, sample_rate: int = 16000, kwargs: dict | None = None
) -> str:
    import dashscope
    from dashscope.audio.asr import Recognition

    dashscope.api_key = api_key
    recognizer = Recognition(model=model, callback=None, format="wav", sample_rate=sample_rate)
    result = recognizer.call(wav_path, **(kwargs or {}))

    texts: list[str] = []
    try:
        sentences = result.get_sentence()
    except Exception:
        sentences = None

    if isinstance(sentences, list):
        for s in sentences:
            if isinstance(s, dict):
                t = s.get("text") or s.get("sentence") or s.get("transcript")
                if t:
                    texts.append(str(t))
    elif isinstance(sentences, dict):
        t = sentences.get("text") or sentences.get("sentence") or sentences.get("transcript")
        if t:
            texts.append(str(t))

    if texts:
        return "".join(texts).strip()

    output = getattr(result, "output", None)
    if isinstance(output, dict) and isinstance(output.get("sentence"), list):
        for s in output["sentence"]:
            if isinstance(s, dict) and s.get("text"):
                texts.append(str(s["text"]))
    return "".join(texts).strip()


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


class ASRService:
    def __init__(self, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self.provider = "dashscope"

    def transcribe(
        self,
        raw_bytes: bytes,
        app_config: dict,
        *,
        src_filename: str | None = None,
        src_mime: str | None = None,
        cancel_event: threading.Event | None = None,
    ) -> str:
        cancel_event = cancel_event or threading.Event()
        asr_cfg = get_nested(app_config, ["asr"], {}) or {}
        dashscope_model = str(get_nested(app_config, ["asr", "dashscope", "model"], "paraformer-realtime-v2") or "").strip()
        dashscope_api_key = _normalize_api_key(get_nested(app_config, ["asr", "dashscope", "api_key"], "") or "")
        if not dashscope_api_key:
            dashscope_api_key = _normalize_api_key(get_nested(app_config, ["tts", "bailian", "api_key"], "") or "")
        dashscope_kwargs = get_nested(app_config, ["asr", "dashscope", "kwargs"], {}) or {}
        if not isinstance(dashscope_kwargs, dict):
            dashscope_kwargs = {}

        trim_silence = bool(get_nested(app_config, ["asr", "preprocess", "trim_silence"], True))
        normalize = bool(get_nested(app_config, ["asr", "preprocess", "normalize"], True))
        loudnorm_filter = get_nested(app_config, ["asr", "preprocess", "loudnorm_filter"], None)
        if loudnorm_filter is not None:
            loudnorm_filter = str(loudnorm_filter).strip() or None
        silenceremove_filter = get_nested(app_config, ["asr", "preprocess", "silenceremove_filter"], None)
        if silenceremove_filter is not None:
            silenceremove_filter = str(silenceremove_filter).strip() or None

        suffix = ""
        try:
            if src_filename:
                suffix = str(Path(str(src_filename)).suffix or "").lower()
        except Exception:
            suffix = ""

        if suffix not in (".wav", ".webm", ".ogg", ".mp3", ".m4a", ".mp4", ".aac", ".flac"):
            mt = (src_mime or "").lower()
            if "webm" in mt:
                suffix = ".webm"
            elif "ogg" in mt:
                suffix = ".ogg"
            elif "wav" in mt:
                suffix = ".wav"
            elif "mpeg" in mt or "mp3" in mt:
                suffix = ".mp3"
            elif "mp4" in mt:
                suffix = ".mp4"
            elif "aac" in mt:
                suffix = ".aac"
            elif "flac" in mt:
                suffix = ".flac"
            else:
                suffix = ".bin"

        with tempfile.TemporaryDirectory(prefix="asr_") as td:
            if cancel_event.is_set():
                raise RuntimeError("asr_cancelled")
            src_path = str(Path(td) / f"input{suffix}")
            wav_path = str(Path(td) / "audio_16k_mono.wav")
            Path(src_path).write_bytes(raw_bytes)

            self._logger.info(
                "asr_preprocess "
                f"input_suffix={suffix} trim_silence={trim_silence} normalize={normalize} "
                f"loudnorm={(loudnorm_filter or 'default')} silenceremove={(silenceremove_filter or 'default')}"
            )
            _run_ffmpeg_convert_to_wav16k_mono(
                src_path,
                wav_path,
                trim_silence=trim_silence,
                normalize=normalize,
                loudnorm_filter=loudnorm_filter,
                silenceremove_filter=silenceremove_filter,
                cancel_event=cancel_event,
            )
            if cancel_event.is_set():
                raise RuntimeError("asr_cancelled")

            probe = _wav_probe(wav_path)
            self._logger.info(
                f"asr_wav_probe duration_s={float(probe.get('duration_s', 0.0) or 0.0):.3f} sr={probe.get('sample_rate')} ch={probe.get('channels')} "
                f"peak={probe.get('peak', None)} rms={probe.get('rms', None)} bytes={probe.get('bytes')}"
            )
            if float(probe.get("duration_s", 0.0) or 0.0) < 0.15 or float(probe.get("rms", 0.0) or 0.0) < 0.002:
                self._logger.warning(f"asr_audio_too_short_or_quiet probe={probe}")

            if not dashscope_api_key:
                self._logger.error("asr_missing_api_key (set asr.dashscope.api_key or tts.bailian.api_key)")
                return ""
            if cancel_event.is_set():
                raise RuntimeError("asr_cancelled")
            text = _dashscope_asr_recognize(
                wav_path,
                api_key=dashscope_api_key,
                model=dashscope_model or "paraformer-realtime-v2",
                sample_rate=16000,
                kwargs=dashscope_kwargs,
            )
            if not (text or "").strip():
                self._logger.warning(
                    f"asr_dashscope_empty model={dashscope_model or 'paraformer-realtime-v2'} "
                    f"probe_duration_s={float(probe.get('duration_s', 0.0) or 0.0):.3f} probe_rms={probe.get('rms', None)}"
                )
            return (text or "").strip()
