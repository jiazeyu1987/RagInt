from __future__ import annotations

import contextlib
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StreamingTtsRecorder:
    recording_store: object
    logger: object
    recording_id: str | None
    stop_index: int | None
    request_id: str
    segment_index: int | str | None
    text: str

    _audio_file: object | None = None
    _tmp_path: Path | None = None
    _final_rel: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.recording_id) and self.stop_index is not None

    def open(self) -> None:
        if not self.enabled:
            return
        try:
            audio_dir = self.recording_store.audio_dir(self.recording_id)
            seg_name = f"{self.request_id}_{self.segment_index if self.segment_index is not None else 'x'}.wav"
            self._final_rel = seg_name
            # Use a unique temp file per request to avoid WinError32 when duplicated
            # segment requests race (same final target).
            suffix = f"{os.getpid()}_{threading.get_ident()}_{time.time_ns()}"
            self._tmp_path = (audio_dir / f"{seg_name}.{suffix}.part").resolve()
            self._audio_file = open(self._tmp_path, "wb")
        except Exception as e:  # noqa: BLE001
            self.logger.warning(f"[REC] tts_open_failed recording_id={self.recording_id} err={e}")
            self._audio_file = None
            self._tmp_path = None
            self._final_rel = None

    def write(self, chunk: bytes) -> None:
        if not chunk or self._audio_file is None:
            return
        try:
            self._audio_file.write(chunk)
        except Exception:  # noqa: BLE001
            self._audio_file = None

    def finalize(self) -> None:
        if self._audio_file is None or self._tmp_path is None or self._final_rel is None:
            return
        if not self.enabled:
            return
        try:
            self._audio_file.flush()
            self._audio_file.close()
            self._audio_file = None
        except Exception:  # noqa: BLE001
            self._audio_file = None
        try:
            audio_dir = self.recording_store.audio_dir(self.recording_id)
            final_path = (audio_dir / self._final_rel).resolve()
            os.replace(str(self._tmp_path), str(final_path))
            self.recording_store.add_tts_audio(
                recording_id=self.recording_id,
                stop_index=int(self.stop_index),
                request_id=self.request_id,
                segment_index=self.segment_index if self.segment_index is not None else None,
                text=self.text,
                rel_path=self._final_rel,
            )
            self._tmp_path = None
        except Exception as e:  # noqa: BLE001
            self.logger.warning(f"[REC] tts_save_failed recording_id={self.recording_id} err={e}")

    def cleanup(self) -> None:
        if self._audio_file is not None:
            with contextlib.suppress(Exception):
                self._audio_file.close()
            self._audio_file = None
        if self._tmp_path is not None:
            with contextlib.suppress(Exception):
                if Path(self._tmp_path).exists():
                    Path(self._tmp_path).unlink(missing_ok=True)
            self._tmp_path = None
