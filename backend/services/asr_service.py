from __future__ import annotations

import contextlib
import logging
import subprocess
import tempfile
import threading
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
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        err = (p.stderr or "").strip()
        raise RuntimeError(f"ffmpeg_convert_failed rc={p.returncode} err={err[:500]}")


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


class ASRService:
    def __init__(self, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._funasr_model = None
        self.funasr_loaded = False
        self.funasr_available = False
        self._funasr_lock = threading.Lock()

        self._fw_model = None
        self.faster_whisper_loaded = False
        self.faster_whisper_available = False
        self._fw_lock = threading.Lock()

        with contextlib.suppress(Exception):
            import funasr  # noqa: F401

            self.funasr_available = True
        if not self.funasr_available:
            self._logger.error("FunASR模块不可用: No module named 'funasr'")

        with contextlib.suppress(Exception):
            import faster_whisper  # noqa: F401

            self.faster_whisper_available = True
        if not self.faster_whisper_available:
            self._logger.info("faster-whisper模块不可用: No module named 'faster_whisper'")

    def _ensure_funasr_model(self, app_config: dict) -> bool:
        if self.funasr_loaded and self._funasr_model is not None:
            return True
        if not self.funasr_available:
            return False

        cfg = get_nested(app_config, ["asr", "funasr"], {}) or {}
        model_name = str(
            cfg.get("model", "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch") or ""
        ).strip()
        device = str(cfg.get("device", "cpu") or "cpu").strip()
        disable_update = bool(cfg.get("disable_update", True))
        kwargs = cfg.get("kwargs") or {}
        if not isinstance(kwargs, dict):
            kwargs = {}

        with self._funasr_lock:
            if self.funasr_loaded and self._funasr_model is not None:
                return True
            try:
                from funasr import AutoModel

                self._logger.info(f"funasr_loading model={model_name} device={device} disable_update={disable_update}")
                self._funasr_model = AutoModel(model=model_name, device=device, disable_update=disable_update, **kwargs)
                self.funasr_loaded = True
                self._logger.info("FunASR模型加载成功")
                return True
            except Exception as e:
                self._funasr_model = None
                self.funasr_loaded = False
                self._logger.error(f"FunASR模型加载失败: {e}", exc_info=True)
                return False

    def _ensure_faster_whisper_model(self, app_config: dict) -> bool:
        if self.faster_whisper_loaded and self._fw_model is not None:
            return True
        if not self.faster_whisper_available:
            return False

        cfg = get_nested(app_config, ["asr", "faster_whisper"], {}) or {}
        model_size_or_path = str(cfg.get("model", "large-v3") or "large-v3").strip()
        device = str(cfg.get("device", "cpu") or "cpu").strip()
        compute_type = str(cfg.get("compute_type", "int8") or "int8").strip()
        cpu_threads = cfg.get("cpu_threads", None)
        cpu_threads = int(cpu_threads) if cpu_threads is not None and str(cpu_threads).strip() != "" else None

        with self._fw_lock:
            if self.faster_whisper_loaded and self._fw_model is not None:
                return True
            try:
                from faster_whisper import WhisperModel

                self._logger.info(
                    f"faster_whisper_loading model={model_size_or_path} device={device} compute_type={compute_type} cpu_threads={cpu_threads}"
                )
                kwargs = {"device": device, "compute_type": compute_type}
                if cpu_threads is not None:
                    kwargs["cpu_threads"] = cpu_threads
                self._fw_model = WhisperModel(model_size_or_path, **kwargs)
                self.faster_whisper_loaded = True
                self._logger.info("faster-whisper模型加载成功")
                return True
            except Exception as e:
                self._fw_model = None
                self.faster_whisper_loaded = False
                self._logger.error(f"faster-whisper模型加载失败: {e}", exc_info=True)
                return False

    def transcribe(self, raw_bytes: bytes, app_config: dict, *, src_filename: str | None = None, src_mime: str | None = None) -> str:
        asr_cfg = get_nested(app_config, ["asr"], {}) or {}
        provider = str(asr_cfg.get("provider", "funasr")).strip().lower() or "funasr"

        dashscope_model = str(get_nested(app_config, ["asr", "dashscope", "model"], "paraformer-realtime-v2") or "").strip()
        dashscope_api_key = str(get_nested(app_config, ["asr", "dashscope", "api_key"], "") or "").strip()
        if not dashscope_api_key:
            dashscope_api_key = str(get_nested(app_config, ["tts", "bailian", "api_key"], "") or "").strip()
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
            )

            probe = _wav_probe(wav_path)
            self._logger.info(
                f"asr_wav_probe duration_s={float(probe.get('duration_s', 0.0) or 0.0):.3f} sr={probe.get('sample_rate')} ch={probe.get('channels')} "
                f"peak={probe.get('peak', None)} rms={probe.get('rms', None)} bytes={probe.get('bytes')}"
            )
            if float(probe.get("duration_s", 0.0) or 0.0) < 0.15 or float(probe.get("rms", 0.0) or 0.0) < 0.002:
                self._logger.warning(f"asr_audio_too_short_or_quiet probe={probe}")

            if provider == "funasr":
                if self._ensure_funasr_model(app_config) and self._funasr_model is not None:
                    x = _read_wav_pcm16_mono_16k(wav_path)
                    with SuppressOutput():
                        result = self._funasr_model.generate(input=x, is_final=True)
                    text = ""
                    if result and isinstance(result, list) and isinstance(result[0], dict) and result[0].get("text"):
                        text = str(result[0]["text"]).strip()
                    if not text:
                        self._logger.warning("asr_funasr_empty")
                    return text
                self._logger.warning("asr_provider_funasr_unavailable -> fallback")
                # fallthrough to next available provider

            if provider in ("faster_whisper", "whisper") or (provider == "funasr" and not self.funasr_loaded):
                if self._ensure_faster_whisper_model(app_config) and self._fw_model is not None:
                    cfg = get_nested(app_config, ["asr", "faster_whisper"], {}) or {}
                    language = str(cfg.get("language", "zh") or "zh").strip()
                    beam_size = int(cfg.get("beam_size", 5) or 5)
                    vad_filter = bool(cfg.get("vad_filter", True))
                    initial_prompt = cfg.get("initial_prompt", None)
                    initial_prompt = str(initial_prompt) if initial_prompt is not None and str(initial_prompt).strip() else None

                    segments, info = self._fw_model.transcribe(
                        wav_path,
                        language=language,
                        beam_size=beam_size,
                        vad_filter=vad_filter,
                        initial_prompt=initial_prompt,
                    )
                    parts = []
                    for seg in segments:
                        t = getattr(seg, "text", None)
                        if t:
                            parts.append(str(t))
                    text = "".join(parts).strip()
                    if not text:
                        self._logger.warning(f"asr_faster_whisper_empty lang={language} beam={beam_size} vad={vad_filter}")
                    return text
                if provider in ("faster_whisper", "whisper"):
                    self._logger.warning("asr_provider_faster_whisper_unavailable -> fallback")
                # fallthrough to dashscope

            # Final fallback: DashScope ASR
            if provider not in ("funasr", "faster_whisper", "whisper", "dashscope"):
                self._logger.warning(f"asr_provider_unknown provider={provider} -> fallback_to_dashscope")
                if not dashscope_api_key:
                    self._logger.error("asr_missing_api_key (set asr.dashscope.api_key or tts.bailian.api_key)")
                    return ""
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

            if not dashscope_api_key:
                self._logger.error("asr_missing_api_key (set asr.dashscope.api_key or tts.bailian.api_key)")
                return ""
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
