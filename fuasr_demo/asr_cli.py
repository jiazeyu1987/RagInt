# -*- coding: utf-8 -*-
import argparse
import contextlib
import logging
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np


class SuppressOutput:
    def __enter__(self):
        import sys

        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open("nul", "w")
        sys.stderr = open("nul", "w")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys

        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr


def _ffmpeg_convert_to_wav16k_mono(input_path: str, output_path: str) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input_path,
        "-vn",
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
        err = ((p.stderr or "") + "\n" + (p.stdout or "")).strip()
        raise RuntimeError(f"ffmpeg_convert_failed rc={p.returncode} err={err[:500]}")


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


def _ensure_wav16k_mono(input_path: str) -> str:
    # If already WAV 16k mono PCM16 -> return directly; otherwise convert via ffmpeg.
    try:
        _read_wav_pcm16_mono_16k(input_path)
        return input_path
    except Exception:
        pass

    with tempfile.TemporaryDirectory() as td:
        out = str(Path(td) / "converted.wav")
        _ffmpeg_convert_to_wav16k_mono(input_path, out)
        # Copy to a stable temp file because we return a path.
        fd, stable_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        shutil.copyfile(out, stable_path)
        return stable_path


def main() -> int:
    os.environ.setdefault("FUNASR_DISABLE_UPDATE", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    logging.getLogger().setLevel(logging.ERROR)

    parser = argparse.ArgumentParser(description="最简单的中文语音识别命令行 Demo（FunASR）")
    parser.add_argument("audio", nargs="?", help="输入音频文件路径（任意格式，推荐 wav/mp3）；不传则默认用麦克风")
    parser.add_argument(
        "--model",
        default="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        help="FunASR 模型名（默认：paraformer zh-cn 16k）",
    )
    parser.add_argument("--device", default="cpu", help="设备：cpu / cuda:0 等")
    parser.add_argument(
        "--enable-update",
        action="store_false",
        dest="disable_update",
        help="启用 FunASR 自动更新（默认禁用）",
    )
    parser.add_argument(
        "--mic",
        action="store_true",
        help="强制使用麦克风实时识别（不传 audio 也会默认进入麦克风模式）",
    )
    parser.add_argument(
        "--chunk-seconds",
        type=float,
        default=2.0,
        help="麦克风模式：每次识别的音频长度（秒），越大越准但延迟越高",
    )
    args = parser.parse_args()

    try:
        from funasr import AutoModel
    except Exception as e:
        print(f"未安装 funasr：{e}")
        print("请先安装依赖：pip install funasr")
        return 2

    tmp_path: str | None = None
    try:
        with SuppressOutput():
            model = AutoModel(model=args.model, device=args.device, disable_update=bool(args.disable_update))

        if args.mic or not args.audio:
            try:
                import pyaudio
            except Exception as e:
                print(f"未安装 pyaudio，无法使用麦克风：{e}")
                print("请先安装依赖：pip install pyaudio")
                return 2

            rate = 16000
            frames_per_buffer = 1600  # 100ms
            chunk_samples = max(1, int(float(args.chunk_seconds) * rate))

            pa = pyaudio.PyAudio()
            stream = pa.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=rate,
                input=True,
                frames_per_buffer=frames_per_buffer,
            )
            last_text = ""
            buf: list[np.ndarray] = []
            buf_samples = 0

            print("开始监听麦克风...（Ctrl+C 结束）")
            try:
                while True:
                    b = stream.read(frames_per_buffer, exception_on_overflow=False)
                    x = np.frombuffer(b, dtype=np.int16).astype(np.float32) / 32768.0
                    buf.append(x)
                    buf_samples += int(x.size)
                    if buf_samples >= chunk_samples:
                        audio = np.concatenate(buf, axis=0)
                        buf.clear()
                        buf_samples = 0
                        with SuppressOutput():
                            result = model.generate(input=audio, is_final=True)
                        text = ""
                        if isinstance(result, list) and result and isinstance(result[0], dict):
                            text = str(result[0].get("text") or "").strip()
                        if text and text != last_text:
                            print(text, flush=True)
                            last_text = text
            except KeyboardInterrupt:
                print("\n结束")
                return 0
            finally:
                with contextlib.suppress(Exception):
                    stream.stop_stream()
                with contextlib.suppress(Exception):
                    stream.close()
                with contextlib.suppress(Exception):
                    pa.terminate()

        input_path = str(Path(args.audio).expanduser().resolve())
        if not Path(input_path).exists():
            print(f"找不到文件：{input_path}")
            return 2

        try:
            wav_path = _ensure_wav16k_mono(input_path)
            if wav_path != input_path:
                tmp_path = wav_path
        except FileNotFoundError:
            print("未找到 ffmpeg，且输入音频不是 16k/单声道/PCM16 WAV；请安装 ffmpeg 或先转成 wav。")
            return 2

        audio = _read_wav_pcm16_mono_16k(wav_path)
        with SuppressOutput():
            result = model.generate(input=audio, is_final=True)

        text = ""
        if isinstance(result, list) and result and isinstance(result[0], dict):
            text = str(result[0].get("text") or "").strip()
        print(text)
        return 0
    finally:
        if tmp_path:
            with contextlib.suppress(Exception):
                Path(tmp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
