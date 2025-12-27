from __future__ import annotations

import base64
import logging
import os
import subprocess
import threading

from .config_utils import get_nested


def synthesize_wav_bytes_via_powershell(
    *,
    text: str,
    voice: str | None = None,
    rate: int = 0,
    volume: int = 100,
    timeout_s: float = 30.0,
) -> bytes:
    if os.name != "nt":
        raise RuntimeError("SAPI TTS is only supported on Windows")

    ps = r"""
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$text = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($text)) { exit 2 }
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:SAPI_VOICE -and $env:SAPI_VOICE.Trim().Length -gt 0) { $synth.SelectVoice($env:SAPI_VOICE) }
try { $synth.Rate = [int]$env:SAPI_RATE } catch { $synth.Rate = 0 }
try { $synth.Volume = [int]$env:SAPI_VOLUME } catch { $synth.Volume = 100 }
$ms = New-Object System.IO.MemoryStream
$synth.SetOutputToWaveStream($ms)
$synth.Speak($text)
$bytes = $ms.ToArray()
[Console]::Out.Write([Convert]::ToBase64String($bytes))
"""

    env = dict(os.environ)
    if voice is not None:
        env["SAPI_VOICE"] = str(voice)
    env["SAPI_RATE"] = str(int(rate))
    env["SAPI_VOLUME"] = str(int(volume))

    p = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
        input=(text or "").encode("utf-8", errors="replace"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=max(1.0, float(timeout_s)),
        env=env,
        check=False,
    )
    if p.returncode != 0:
        err = (p.stderr or b"").decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"sapi_tts_failed rc={p.returncode} err={err}")
    out = (p.stdout or b"").strip()
    if not out:
        raise RuntimeError("sapi_tts_failed: empty output")
    try:
        return base64.b64decode(out, validate=False)
    except Exception as e:
        preview = out[:120]
        raise RuntimeError(f"sapi_tts_failed: invalid_base64 err={e} out={preview!r}")


def stream_sapi(
    *,
    text: str,
    request_id: str,
    config: dict,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
):
    cfg = get_nested(config, ["tts", "sapi"], {}) or {}
    if cfg.get("enabled") is False:
        raise ValueError("tts.sapi.enabled=false")

    voice = str(cfg.get("voice", "")).strip() or None
    rate = int(cfg.get("rate", 0) or 0)
    volume = int(cfg.get("volume", 100) or 100)
    timeout_s = float(cfg.get("timeout_s", 30) or 30)

    cancel_event = cancel_event or threading.Event()
    if cancel_event.is_set():
        return

    logger.info(f"[{request_id}] sapi_tts_request voice={voice!r} rate={rate} volume={volume} timeout_s={timeout_s}")
    wav = synthesize_wav_bytes_via_powershell(
        text=text,
        voice=voice,
        rate=rate,
        volume=volume,
        timeout_s=timeout_s,
    )
    logger.info(f"[{request_id}] sapi_tts_ok bytes={len(wav)}")

    for i in range(0, len(wav), 4096):
        if cancel_event.is_set():
            logger.info(f"[{request_id}] sapi_tts_cancelled")
            return
        yield wav[i : i + 4096]

