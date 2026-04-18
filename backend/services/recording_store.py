from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
import shutil
import wave
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RecordingInfo:
    recording_id: str
    created_at_ms: int
    finished_at_ms: int | None
    stops: list[str]
    metadata: dict


class RecordingStore:
    """
    Persist tour recordings (per stop):
    - Ask SSE events: chunk/segment/done
    - TTS audio files (wav) for each segment (exact bytes)
    """

    def __init__(self, root_dir: Path, *, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._root = Path(root_dir)
        self._db_path = self._root / "recordings.db"
        self._lock = threading.Lock()
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        self._root.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS recordings (
                        recording_id TEXT PRIMARY KEY,
                        created_at_ms INTEGER NOT NULL,
                        finished_at_ms INTEGER,
                        stops_json TEXT NOT NULL,
                        display_name TEXT,
                        metadata_json TEXT
                    );
                    """
                )
                # Backward compatible migration: add display_name column if missing.
                try:
                    cols = [str(r["name"]) for r in conn.execute("PRAGMA table_info(recordings);").fetchall()]
                    if "display_name" not in cols:
                        conn.execute("ALTER TABLE recordings ADD COLUMN display_name TEXT;")
                    if "metadata_json" not in cols:
                        conn.execute("ALTER TABLE recordings ADD COLUMN metadata_json TEXT;")
                except Exception:
                    pass
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS recording_ask_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        recording_id TEXT NOT NULL,
                        stop_index INTEGER NOT NULL,
                        request_id TEXT NOT NULL,
                        seq INTEGER NOT NULL,
                        kind TEXT NOT NULL, -- 'chunk' | 'segment' | 'done'
                        text TEXT,
                        created_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_rec_events_lookup ON recording_ask_events(recording_id, stop_index, seq);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS recording_tts_audio (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        recording_id TEXT NOT NULL,
                        stop_index INTEGER NOT NULL,
                        request_id TEXT NOT NULL,
                        segment_index INTEGER,
                        seq INTEGER NOT NULL,
                        text TEXT,
                        rel_path TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_rec_tts_lookup ON recording_tts_audio(recording_id, stop_index, seq);"
                )
                # Backward compatible migration: add updated_at_ms to support
                # per-segment text/audio regeneration with cache-busting URLs.
                try:
                    cols_tts = [str(r["name"]) for r in conn.execute("PRAGMA table_info(recording_tts_audio);").fetchall()]
                    if "updated_at_ms" not in cols_tts:
                        conn.execute("ALTER TABLE recording_tts_audio ADD COLUMN updated_at_ms INTEGER;")
                except Exception:
                    pass
                conn.commit()
            finally:
                conn.close()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def create(self, *, recording_id: str, stops: list[str], metadata: dict | None = None) -> RecordingInfo:
        rid = str(recording_id or "").strip()
        if not rid:
            raise ValueError("recording_id_empty")
        if not isinstance(stops, list) or not stops:
            raise ValueError("stops_empty")
        created_at_ms = self._now_ms()
        payload = json.dumps([str(s or "").strip() for s in stops], ensure_ascii=False)
        metadata_payload = json.dumps(metadata if isinstance(metadata, dict) else {}, ensure_ascii=False)

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO recordings (recording_id, created_at_ms, finished_at_ms, stops_json, metadata_json)
                    VALUES (?, ?, NULL, ?, ?)
                    """,
                    (rid, int(created_at_ms), payload, metadata_payload),
                )
                conn.commit()
            finally:
                conn.close()

        self._logger.info(f"[REC] created recording_id={rid} stops={len(stops)}")
        return RecordingInfo(
            recording_id=rid,
            created_at_ms=created_at_ms,
            finished_at_ms=None,
            stops=stops,
            metadata=metadata if isinstance(metadata, dict) else {},
        )

    def finish(self, recording_id: str) -> None:
        rid = str(recording_id or "").strip()
        if not rid:
            return
        finished_at_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "UPDATE recordings SET finished_at_ms=? WHERE recording_id=?",
                    (int(finished_at_ms), rid),
                )
                conn.commit()
            finally:
                conn.close()
        self._logger.info(f"[REC] finished recording_id={rid}")

    def list(self, *, limit: int = 50) -> list[dict]:
        limit = max(1, min(int(limit or 50), 200))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT recording_id, created_at_ms, finished_at_ms, display_name, metadata_json, stops_json
                    FROM recordings
                    ORDER BY created_at_ms DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                out = []
                for r in rows:
                    item = dict(r)
                    try:
                        item["metadata"] = json.loads(item.get("metadata_json") or "{}")
                    except Exception:
                        item["metadata"] = {}
                    try:
                        stops = json.loads(item.get("stops_json") or "[]")
                        item["stop_count"] = len(stops) if isinstance(stops, list) else 0
                    except Exception:
                        item["stop_count"] = 0
                    item.pop("metadata_json", None)
                    item.pop("stops_json", None)
                    out.append(item)
                return out
            finally:
                conn.close()

    def get(self, recording_id: str) -> dict | None:
        rid = str(recording_id or "").strip()
        if not rid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT recording_id, created_at_ms, finished_at_ms, stops_json, display_name, metadata_json FROM recordings WHERE recording_id=?",
                    (rid,),
                ).fetchone()
                if not row:
                    return None
                out = dict(row)
                try:
                    out["stops"] = json.loads(out.get("stops_json") or "[]")
                except Exception:
                    out["stops"] = []
                try:
                    out["metadata"] = json.loads(out.get("metadata_json") or "{}")
                except Exception:
                    out["metadata"] = {}
                out.pop("stops_json", None)
                out.pop("metadata_json", None)
                return out
            finally:
                conn.close()

    def set_display_name(self, recording_id: str, display_name: str) -> None:
        rid = str(recording_id or "").strip()
        if not rid:
            raise ValueError("recording_id_empty")
        name = str(display_name or "").strip()
        if len(name) > 120:
            name = name[:120]
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("UPDATE recordings SET display_name=? WHERE recording_id=?", (name, rid))
                conn.commit()
            finally:
                conn.close()

    def delete(self, recording_id: str) -> None:
        rid = str(recording_id or "").strip()
        if not rid:
            return
        # Delete DB rows first (audio files are best-effort).
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM recording_ask_events WHERE recording_id=?", (rid,))
                conn.execute("DELETE FROM recording_tts_audio WHERE recording_id=?", (rid,))
                conn.execute("DELETE FROM recordings WHERE recording_id=?", (rid,))
                conn.commit()
            finally:
                conn.close()

        # Delete files.
        try:
            root = (self._root / rid).resolve()
            base = self._root.resolve()
            if not str(root).lower().startswith(str(base).lower() + os.sep.lower()):
                raise ValueError("path_outside_store")
            if root.exists() and root.is_dir():
                shutil.rmtree(root, ignore_errors=True)
        except Exception:
            pass

    def _next_seq(self, *, conn: sqlite3.Connection, table: str, recording_id: str, stop_index: int) -> int:
        row = conn.execute(
            f"SELECT MAX(seq) AS m FROM {table} WHERE recording_id=? AND stop_index=?",
            (recording_id, int(stop_index)),
        ).fetchone()
        m = int(row["m"]) if row and row["m"] is not None else -1
        return m + 1

    def add_ask_event(self, *, recording_id: str, stop_index: int, request_id: str, kind: str, text: str | None) -> None:
        rid = str(recording_id or "").strip()
        if not rid:
            return
        req = str(request_id or "").strip()
        if not req:
            return
        kind = str(kind or "").strip()
        if kind not in ("chunk", "segment", "done"):
            return
        t = None if text is None else str(text)
        created_at_ms = self._now_ms()

        with self._lock:
            conn = self._connect()
            try:
                seq = self._next_seq(conn=conn, table="recording_ask_events", recording_id=rid, stop_index=int(stop_index))
                conn.execute(
                    """
                    INSERT INTO recording_ask_events (recording_id, stop_index, request_id, seq, kind, text, created_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (rid, int(stop_index), req, int(seq), kind, t, int(created_at_ms)),
                )
                conn.commit()
            finally:
                conn.close()

    def add_tts_audio(
        self,
        *,
        recording_id: str,
        stop_index: int,
        request_id: str,
        segment_index: int | None,
        text: str | None,
        rel_path: str,
    ) -> None:
        rid = str(recording_id or "").strip()
        if not rid:
            return
        req = str(request_id or "").strip()
        if not req:
            return
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rel:
            return
        created_at_ms = self._now_ms()
        seg_i = None
        try:
            seg_i = int(segment_index) if segment_index is not None and str(segment_index).strip() != "" else None
        except Exception:
            seg_i = None

        with self._lock:
            conn = self._connect()
            try:
                seq = self._next_seq(conn=conn, table="recording_tts_audio", recording_id=rid, stop_index=int(stop_index))
                conn.execute(
                    """
                    INSERT INTO recording_tts_audio
                      (recording_id, stop_index, request_id, segment_index, seq, text, rel_path, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rid,
                        int(stop_index),
                        req,
                        seg_i,
                        int(seq),
                        None if text is None else str(text),
                        rel,
                        int(created_at_ms),
                        int(created_at_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()

    def get_tts_segment(self, *, recording_id: str, segment_id: int) -> dict | None:
        rid = str(recording_id or "").strip()
        if not rid:
            return None
        try:
            seg_id = int(segment_id)
        except Exception:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT id, recording_id, stop_index, request_id, segment_index, seq, text, rel_path, created_at_ms, updated_at_ms
                    FROM recording_tts_audio
                    WHERE recording_id=? AND id=?
                    LIMIT 1
                    """,
                    (rid, seg_id),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def update_tts_segment(self, *, recording_id: str, segment_id: int, text: str | None, rel_path: str) -> dict | None:
        rid = str(recording_id or "").strip()
        if not rid:
            return None
        try:
            seg_id = int(segment_id)
        except Exception:
            return None
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rel:
            return None
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE recording_tts_audio
                    SET text=?, rel_path=?, updated_at_ms=?
                    WHERE recording_id=? AND id=?
                    """,
                    (None if text is None else str(text), rel, int(now_ms), rid, seg_id),
                )
                row = conn.execute(
                    """
                    SELECT id, recording_id, stop_index, request_id, segment_index, seq, text, rel_path, created_at_ms, updated_at_ms
                    FROM recording_tts_audio
                    WHERE recording_id=? AND id=?
                    LIMIT 1
                    """,
                    (rid, seg_id),
                ).fetchone()
                conn.commit()
                return dict(row) if row else None
            finally:
                conn.close()

    def count_tts_rel_path_refs(self, *, recording_id: str, rel_path: str, exclude_segment_id: int | None = None) -> int:
        rid = str(recording_id or "").strip()
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rid or not rel:
            return 0
        with self._lock:
            conn = self._connect()
            try:
                if exclude_segment_id is None:
                    row = conn.execute(
                        "SELECT COUNT(1) AS c FROM recording_tts_audio WHERE recording_id=? AND rel_path=?",
                        (rid, rel),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT COUNT(1) AS c FROM recording_tts_audio WHERE recording_id=? AND rel_path=? AND id<>?",
                        (rid, rel, int(exclude_segment_id)),
                    ).fetchone()
                return int(row["c"]) if row and row["c"] is not None else 0
            finally:
                conn.close()

    def get_stop_payload(self, *, recording_id: str, stop_index: int, base_url: str) -> dict | None:
        rid = str(recording_id or "").strip()
        if not rid:
            return None
        try:
            idx = int(stop_index)
        except Exception:
            return None

        with self._lock:
            conn = self._connect()
            try:
                meta = conn.execute(
                    "SELECT recording_id, created_at_ms, finished_at_ms, stops_json FROM recordings WHERE recording_id=?",
                    (rid,),
                ).fetchone()
                if not meta:
                    return None
                stops = []
                try:
                    stops = json.loads(meta["stops_json"] or "[]")
                except Exception:
                    stops = []
                if idx < 0 or (isinstance(stops, list) and idx >= len(stops)):
                    # allow out-of-range queries (return empty)
                    pass

                ev_rows = conn.execute(
                    """
                    SELECT seq, kind, text
                    FROM recording_ask_events
                    WHERE recording_id=? AND stop_index=?
                    ORDER BY seq ASC
                    """,
                    (rid, int(idx)),
                ).fetchall()
                chunks: list[str] = []
                for r in ev_rows:
                    if str(r["kind"]) == "chunk" and r["text"] is not None:
                        chunks.append(str(r["text"]))

                tts_rows = conn.execute(
                    """
                    SELECT id, segment_index, seq, text, rel_path, created_at_ms, updated_at_ms
                    FROM recording_tts_audio
                    WHERE recording_id=? AND stop_index=?
                    ORDER BY seq ASC
                    """,
                    (rid, int(idx)),
                ).fetchall()
                segments = []
                segment_text_chunks: list[str] = []
                for r in tts_rows:
                    rel = str(r["rel_path"] or "").replace("\\", "/").lstrip("/")
                    v = int(r["updated_at_ms"] or r["created_at_ms"] or 0)
                    duration_ms = self._audio_duration_ms_for_rel_path(rid, rel)
                    if str(base_url or "").strip():
                        url = f"{str(base_url).rstrip('/')}/api/recordings/{rid}/audio/{rel}"
                    else:
                        url = f"/api/recordings/{rid}/audio/{rel}"
                    if v > 0:
                        url = f"{url}?v={v}"
                    seg_text = str(r["text"] or "")
                    if seg_text.strip():
                        segment_text_chunks.append(seg_text)
                    segment = {
                        "segment_id": int(r["id"]),
                        "segment_index": int(r["segment_index"]) if r["segment_index"] is not None else None,
                        "seq": int(r["seq"]),
                        "text": seg_text,
                        "audio_url": url,
                        "updated_at_ms": v if v > 0 else None,
                    }
                    if duration_ms is not None:
                        segment["duration_ms"] = int(duration_ms)
                    segments.append(segment)

                effective_chunks = segment_text_chunks if segment_text_chunks else chunks
                answer_text = "".join(effective_chunks).strip()
                tail = answer_text[-80:] if answer_text else ""
                return {
                    "recording_id": rid,
                    "stop_index": int(idx),
                    "stop_name": str(stops[idx] if isinstance(stops, list) and idx < len(stops) else ""),
                    "chunks": effective_chunks,
                    "answer_text": answer_text,
                    "tail": tail,
                    "segments": segments,
                    "created_at_ms": int(meta["created_at_ms"]),
                    "finished_at_ms": int(meta["finished_at_ms"]) if meta["finished_at_ms"] is not None else None,
                }
            finally:
                conn.close()

    def audio_dir(self, recording_id: str) -> Path:
        rid = str(recording_id or "").strip()
        if not rid:
            raise ValueError("recording_id_empty")
        d = self._root / rid / "audio"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def safe_rel_audio_path(self, recording_id: str, filename: str) -> Path:
        rid = str(recording_id or "").strip()
        if not rid:
            raise ValueError("recording_id_empty")
        fn = str(filename or "").replace("\\", "/")
        fn = fn.lstrip("/")
        # Disallow path traversal.
        if not fn or ".." in fn.split("/"):
            raise ValueError("bad_filename")
        return (self._root / rid / "audio" / fn).resolve()

    def ensure_within_audio_dir(self, recording_id: str, path: Path) -> Path:
        base = (self._root / str(recording_id) / "audio").resolve()
        p = Path(path).resolve()
        if str(p).lower().startswith(str(base).lower() + os.sep.lower()) or str(p).lower() == str(base).lower():
            return p
        raise ValueError("path_outside_audio_dir")

    def _audio_duration_ms_for_rel_path(self, recording_id: str, rel_path: str) -> int | None:
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rel:
            return None
        try:
            path = self.safe_rel_audio_path(recording_id, rel)
            path = self.ensure_within_audio_dir(recording_id, path)
        except Exception:
            return None
        if not path.exists() or not path.is_file():
            return None
        try:
            with wave.open(str(path), "rb") as wf:
                frames = int(wf.getnframes() or 0)
                sample_rate = int(wf.getframerate() or 0)
        except Exception:
            return None
        if sample_rate <= 0 or frames < 0:
            return None
        return max(0, round((float(frames) / float(sample_rate)) * 1000))
