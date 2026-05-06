from __future__ import annotations

import logging
import math
import os
import sqlite3
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from backend.services.audio_utils import ensure_wav_bytes, patch_wav_header_sizes
from backend.services.question_normalizer import normalize_question


@dataclass(frozen=True)
class QaAudioPair:
    id: int
    normalized_question: str
    question_text: str
    answer_text: str
    audio_rel_path: str
    tts_provider: str
    tts_voice: str
    tts_speed: float
    source_request_id: str
    created_at_ms: int
    updated_at_ms: int


@dataclass(frozen=True)
class QaAudioCandidate:
    pair_id: int
    question_text: str
    answer_text: str
    audio_rel_path: str
    tts_provider: str
    tts_voice: str
    tts_speed: float
    score: float


class QaAudioCacheStore:
    """
    SQLite-backed QA audio cache with vector recall.
    - Global shared cache
    - Isolated by tts_provider + tts_voice + tts_speed
    - Hard-delete supported
    """

    def __init__(self, *, root_dir: Path, db_path: Path, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._root_dir = Path(root_dir)
        self._audio_dir = self._root_dir / "audio"
        self._db_path = Path(db_path)
        self._lock = threading.Lock()
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        self._root_dir.mkdir(parents=True, exist_ok=True)
        self._audio_dir.mkdir(parents=True, exist_ok=True)
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
                    CREATE TABLE IF NOT EXISTS qa_audio_pairs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        normalized_question TEXT NOT NULL,
                        question_text TEXT NOT NULL,
                        answer_text TEXT NOT NULL,
                        audio_rel_path TEXT NOT NULL,
                        tts_provider TEXT NOT NULL,
                        tts_voice TEXT NOT NULL,
                        tts_speed REAL NOT NULL,
                        source_request_id TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_audio_pair_uq
                    ON qa_audio_pairs(normalized_question, tts_provider, tts_voice, tts_speed);
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_qa_audio_pair_updated ON qa_audio_pairs(updated_at_ms DESC);")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS qa_audio_embeddings (
                        pair_id INTEGER PRIMARY KEY,
                        embedding_model TEXT NOT NULL,
                        embedding_dim INTEGER NOT NULL,
                        vector_blob BLOB NOT NULL,
                        updated_at_ms INTEGER NOT NULL,
                        FOREIGN KEY(pair_id) REFERENCES qa_audio_pairs(id) ON DELETE CASCADE
                    );
                    """
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _to_blob(vec: np.ndarray) -> tuple[int, bytes]:
        arr = np.asarray(vec, dtype=np.float32).reshape(-1)
        return int(arr.shape[0]), arr.tobytes()

    @staticmethod
    def _from_blob(dim: int, blob: bytes) -> np.ndarray:
        arr = np.frombuffer(blob, dtype=np.float32)
        if int(arr.shape[0]) != int(dim):
            raise ValueError(f"embedding dim mismatch expected={dim} actual={arr.shape[0]}")
        return arr

    @staticmethod
    def _cosine(a: np.ndarray, b: np.ndarray) -> float:
        a_n = float(np.linalg.norm(a))
        b_n = float(np.linalg.norm(b))
        if a_n <= 1e-12 or b_n <= 1e-12:
            return 0.0
        return float(np.dot(a, b) / (a_n * b_n))

    @staticmethod
    def _norm_tts_speed(v: float | int | str | None) -> float:
        if v is None:
            return 1.0
        try:
            speed = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_tts_speed value={v!r}") from exc
        if not math.isfinite(speed) or speed < 0.5 or speed > 2.0:
            raise ValueError(f"invalid_tts_speed value={v!r}")
        return round(speed, 2)

    @staticmethod
    def _normalize_audio_ext(v: str | None) -> str:
        ext = str(v or "").strip().lower()
        if not ext:
            return ".wav"
        if not ext.startswith("."):
            ext = f".{ext}"
        if ext in (".wav", ".mp3", ".ogg", ".flac"):
            return ext
        raise ValueError(f"unsupported_audio_ext ext={ext}")

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _safe_audio_path(self, rel_path: str) -> Path:
        rel = str(rel_path or "")
        if not rel or "\\" in rel or rel.startswith("/") or ".." in rel.split("/"):
            raise ValueError("bad_rel_path")
        p = (self._root_dir / rel).resolve()
        base = self._root_dir.resolve()
        if str(p).lower().startswith(str(base).lower() + os.sep.lower()) or str(p).lower() == str(base).lower():
            return p
        raise ValueError("audio_path_outside_root")

    def audio_url_for_pair(self, *, base_url: str, pair_id: int) -> str:
        return f"{str(base_url).rstrip('/')}/api/qa_audio_cache/audio/{int(pair_id)}"

    def get_pair(self, *, pair_id: int) -> QaAudioPair | None:
        pid = int(pair_id)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                        id, normalized_question, question_text, answer_text, audio_rel_path,
                        tts_provider, tts_voice, tts_speed, source_request_id, created_at_ms, updated_at_ms
                    FROM qa_audio_pairs
                    WHERE id = ?
                    """,
                    (pid,),
                ).fetchone()
                if row:
                    return QaAudioPair(
                        id=int(row["id"]),
                        normalized_question=str(row["normalized_question"] or ""),
                        question_text=str(row["question_text"] or ""),
                        answer_text=str(row["answer_text"] or ""),
                        audio_rel_path=str(row["audio_rel_path"] or ""),
                        tts_provider=str(row["tts_provider"] or ""),
                        tts_voice=str(row["tts_voice"] or ""),
                        tts_speed=float(row["tts_speed"] or 1.0),
                        source_request_id=str(row["source_request_id"] or ""),
                        created_at_ms=int(row["created_at_ms"] or 0),
                        updated_at_ms=int(row["updated_at_ms"] or 0),
                    )
                return None
            finally:
                conn.close()

    def find_exact_pair(
        self,
        *,
        question_text: str,
        tts_provider: str,
        tts_voice: str,
        tts_speed: float,
    ) -> QaAudioPair | None:
        nq = normalize_question(str(question_text or ""))
        if not nq:
            return None
        provider = str(tts_provider or "").strip()
        voice = str(tts_voice or "").strip()
        speed = self._norm_tts_speed(tts_speed)
        where = ["normalized_question = ?", "tts_speed = ?"]
        params: list[object] = [nq, float(speed)]
        if provider:
            where.append("tts_provider = ?")
            params.append(provider)
        if voice:
            where.append("tts_voice = ?")
            params.append(voice)

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    (
                        """
                    SELECT
                        id, normalized_question, question_text, answer_text, audio_rel_path,
                        tts_provider, tts_voice, tts_speed, source_request_id, created_at_ms, updated_at_ms
                    FROM qa_audio_pairs
                    WHERE """
                        + " AND ".join(where)
                        + " ORDER BY updated_at_ms DESC, id DESC LIMIT 1"
                    ),
                    tuple(params),
                ).fetchone()
                if row:
                    return QaAudioPair(
                        id=int(row["id"]),
                        normalized_question=str(row["normalized_question"] or ""),
                        question_text=str(row["question_text"] or ""),
                        answer_text=str(row["answer_text"] or ""),
                        audio_rel_path=str(row["audio_rel_path"] or ""),
                        tts_provider=str(row["tts_provider"] or ""),
                        tts_voice=str(row["tts_voice"] or ""),
                        tts_speed=float(row["tts_speed"] or 1.0),
                        source_request_id=str(row["source_request_id"] or ""),
                        created_at_ms=int(row["created_at_ms"] or 0),
                        updated_at_ms=int(row["updated_at_ms"] or 0),
                    )

                return None
            finally:
                conn.close()

    def get_audio_file_path(self, *, pair_id: int) -> Path | None:
        pair = self.get_pair(pair_id=int(pair_id))
        if not pair:
            return None
        p = self._safe_audio_path(pair.audio_rel_path)
        if not (p.exists() and p.is_file()):
            raise FileNotFoundError(f"qa_audio_file_missing pair_id={int(pair_id)} path={pair.audio_rel_path}")
        self._repair_audio_file_if_needed(p, tts_provider=pair.tts_provider)
        if int(p.stat().st_size) <= 0:
            raise ValueError(f"qa_audio_file_empty pair_id={int(pair_id)} path={pair.audio_rel_path}")
        return p

    def _repair_audio_file_if_needed(self, path: Path, *, tts_provider: str) -> None:
        raw = path.read_bytes()
        if not raw:
            return
        if not (len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WAVE"):
            return
        fixed, changed = patch_wav_header_sizes(raw)
        if not changed:
            return
        tmp = path.with_name(f"{path.name}.{int(time.time() * 1000)}.fix")
        try:
            with open(tmp, "wb") as f:
                f.write(fixed)
            os.replace(str(tmp), str(path))
            self._logger.info(f"[QA_AUDIO] repaired_audio_file file={path.name} bytes={len(fixed)}")
        except Exception:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            raise

    def search_candidates(
        self,
        *,
        query_embedding: np.ndarray,
        tts_provider: str,
        tts_voice: str,
        tts_speed: float | None,
        top_k: int = 20,
    ) -> list[QaAudioCandidate]:
        q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
        top_k = max(1, min(int(top_k or 20), 100))
        provider = str(tts_provider or "").strip()
        voice = str(tts_voice or "").strip()
        where = []
        params: list[object] = []
        if tts_speed is not None:
            speed = self._norm_tts_speed(tts_speed)
            where.append("p.tts_speed = ?")
            params.append(float(speed))
        if provider:
            where.append("p.tts_provider = ?")
            params.append(provider)
        if voice:
            where.append("p.tts_voice = ?")
            params.append(voice)
        rows = []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    (
                        """
                    SELECT
                        p.id,
                        p.question_text,
                        p.answer_text,
                        p.audio_rel_path,
                        p.tts_provider,
                        p.tts_voice,
                        p.tts_speed,
                        e.embedding_dim,
                        e.vector_blob
                    FROM qa_audio_pairs p
                    JOIN qa_audio_embeddings e ON e.pair_id = p.id
                    """
                        + (("WHERE " + " AND ".join(where)) if where else "")
                    ),
                    tuple(params),
                ).fetchall()
            finally:
                conn.close()

        out: list[QaAudioCandidate] = []
        for r in rows:
            v = self._from_blob(int(r["embedding_dim"]), r["vector_blob"])
            score = self._cosine(q, v)
            out.append(
                QaAudioCandidate(
                    pair_id=int(r["id"]),
                    question_text=str(r["question_text"] or ""),
                    answer_text=str(r["answer_text"] or ""),
                    audio_rel_path=str(r["audio_rel_path"] or ""),
                    tts_provider=str(r["tts_provider"] or ""),
                    tts_voice=str(r["tts_voice"] or ""),
                    tts_speed=float(r["tts_speed"] or 1.0),
                    score=float(score),
                )
            )
        out.sort(key=lambda x: x.score, reverse=True)
        return out[:top_k]

    def upsert_pair_with_audio(
        self,
        *,
        question_text: str,
        answer_text: str,
        audio_bytes: bytes,
        audio_ext: str = ".wav",
        tts_provider: str,
        tts_voice: str,
        tts_speed: float,
        source_request_id: str,
        embedding: np.ndarray,
        embedding_model: str = "hash_char_ngram_v1",
    ) -> int | None:
        q = str(question_text or "").strip()
        a = str(answer_text or "").strip()
        if not q or not a or not audio_bytes:
            return None
        normalized_question = normalize_question(q)
        if not normalized_question:
            return None

        provider = str(tts_provider or "").strip()
        voice = str(tts_voice or "").strip()
        speed = self._norm_tts_speed(tts_speed)
        ext = self._normalize_audio_ext(audio_ext)
        now_ms = self._now_ms()
        dim, blob = self._to_blob(np.asarray(embedding, dtype=np.float32))

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT id, audio_rel_path
                    FROM qa_audio_pairs
                    WHERE normalized_question = ? AND tts_provider = ? AND tts_voice = ? AND tts_speed = ?
                    """,
                    (normalized_question, provider, voice, float(speed)),
                ).fetchone()

                old_rel_path = str(row["audio_rel_path"] or "") if row else ""
                if row:
                    pair_id = int(row["id"])
                else:
                    cur = conn.execute(
                        """
                        INSERT INTO qa_audio_pairs (
                            normalized_question, question_text, answer_text, audio_rel_path,
                            tts_provider, tts_voice, tts_speed, source_request_id, created_at_ms, updated_at_ms
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            normalized_question,
                            q,
                            a,
                            "",
                            provider,
                            voice,
                            float(speed),
                            str(source_request_id or ""),
                            int(now_ms),
                            int(now_ms),
                        ),
                    )
                    pair_id = int(cur.lastrowid or 0)

                audio_name = f"pair_{pair_id}_{now_ms}{ext}"
                rel_path = f"audio/{audio_name}"
                audio_path = self._safe_audio_path(rel_path)
                audio_path.parent.mkdir(parents=True, exist_ok=True)
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)

                conn.execute(
                    """
                    UPDATE qa_audio_pairs
                    SET question_text = ?, answer_text = ?, audio_rel_path = ?,
                        source_request_id = ?, updated_at_ms = ?
                    WHERE id = ?
                    """,
                    (q, a, rel_path, str(source_request_id or ""), int(now_ms), int(pair_id)),
                )
                conn.execute(
                    """
                    INSERT INTO qa_audio_embeddings (pair_id, embedding_model, embedding_dim, vector_blob, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(pair_id) DO UPDATE SET
                        embedding_model = excluded.embedding_model,
                        embedding_dim = excluded.embedding_dim,
                        vector_blob = excluded.vector_blob,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (int(pair_id), str(embedding_model or "hash_char_ngram_v1"), int(dim), blob, int(now_ms)),
                )
                conn.commit()

                if old_rel_path and old_rel_path != rel_path:
                    old_path = self._safe_audio_path(old_rel_path)
                    if old_path.exists() and old_path.is_file():
                        old_path.unlink(missing_ok=True)
                return pair_id
            finally:
                conn.close()

    def list_pairs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        tts_provider: str = "",
        tts_voice: str = "",
        tts_speed: float | None = None,
    ) -> list[dict]:
        limit = max(1, min(int(limit or 100), 500))
        offset = max(0, int(offset or 0))
        where = []
        params: list[object] = []
        if str(tts_provider or "").strip():
            where.append("tts_provider = ?")
            params.append(str(tts_provider).strip())
        if str(tts_voice or "").strip():
            where.append("tts_voice = ?")
            params.append(str(tts_voice).strip())
        if tts_speed is not None:
            where.append("tts_speed = ?")
            params.append(float(self._norm_tts_speed(tts_speed)))

        sql = (
            """
            SELECT
                id, normalized_question, question_text, answer_text, audio_rel_path,
                tts_provider, tts_voice, tts_speed, source_request_id, created_at_ms, updated_at_ms
            FROM qa_audio_pairs
            """
            + (f" WHERE {' AND '.join(where)}" if where else "")
            + " ORDER BY updated_at_ms DESC, id DESC LIMIT ? OFFSET ?"
        )
        params.extend([limit, offset])

        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(sql, tuple(params)).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    @staticmethod
    def _wav_duration_seconds(path: Path) -> float | None:
        try:
            with wave.open(str(path), "rb") as wf:
                frames = int(wf.getnframes() or 0)
                sample_rate = int(wf.getframerate() or 0)
                if sample_rate <= 0:
                    return 0.0
                return float(frames) / float(sample_rate)
        except (wave.Error, EOFError) as exc:
            raise ValueError(f"wav_duration_unreadable path={path}") from exc

    @staticmethod
    def _is_riff_wav_file(path: Path) -> bool:
        with open(path, "rb") as f:
            head = bytes(f.read(12) or b"")
        return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WAVE"

    def cleanup_invalid_audio_pairs(self) -> dict:
        """
        Hard-delete cache pairs whose audio is invalid:
        - missing audio path
        - unsafe/invalid relative path
        - missing file
        - empty file
        - WAV file with duration <= 0
        """
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT id, audio_rel_path, tts_provider
                    FROM qa_audio_pairs
                    ORDER BY id ASC
                    """
                ).fetchall()
            finally:
                conn.close()

        invalid_items: list[dict] = []
        reason_counts: dict[str, int] = {}
        for row in rows:
            pair_id = int(row["id"] or 0)
            rel_path = str(row["audio_rel_path"] or "")
            tts_provider = str(row["tts_provider"] or "")
            reason = ""
            path: Path | None = None

            if not rel_path.strip():
                reason = "audio_rel_path_empty"
            else:
                try:
                    path = self._safe_audio_path(rel_path)
                except Exception:
                    reason = "audio_rel_path_invalid"

            if not reason and path is not None:
                if not (path.exists() and path.is_file()):
                    reason = "audio_file_missing"
                else:
                    self._repair_audio_file_if_needed(path, tts_provider=tts_provider)
                    file_size = int(path.stat().st_size)
                    if file_size <= 0:
                        reason = "audio_file_empty"
                    elif self._is_riff_wav_file(path):
                        duration_s = self._wav_duration_seconds(path)
                        if duration_s is not None and duration_s <= 0:
                            reason = "wav_duration_zero"

            if reason:
                invalid_items.append({"pair_id": int(pair_id), "audio_rel_path": rel_path, "reason": reason})
                reason_counts[reason] = int(reason_counts.get(reason) or 0) + 1

        deleted_ids: list[int] = []
        deleted_paths: list[str] = []
        if invalid_items:
            ids_to_delete = [int(item["pair_id"]) for item in invalid_items if int(item.get("pair_id") or 0) > 0]
            ids_set = set(ids_to_delete)
            with self._lock:
                conn = self._connect()
                try:
                    if ids_set:
                        marks = ",".join(["?"] * len(ids_set))
                        existing = conn.execute(
                            f"SELECT id, audio_rel_path FROM qa_audio_pairs WHERE id IN ({marks})",
                            tuple(sorted(ids_set)),
                        ).fetchall()
                        for row in existing:
                            pid = int(row["id"] or 0)
                            if pid <= 0:
                                continue
                            deleted_ids.append(pid)
                            deleted_paths.append(str(row["audio_rel_path"] or ""))
                finally:
                    conn.close()

            for rel_path in deleted_paths:
                if not rel_path:
                    continue
                try:
                    p = self._safe_audio_path(rel_path)
                except ValueError:
                    continue
                if p.exists() and p.is_file():
                    p.unlink(missing_ok=True)

            with self._lock:
                conn = self._connect()
                try:
                    if deleted_ids:
                        for pid in deleted_ids:
                            conn.execute("DELETE FROM qa_audio_embeddings WHERE pair_id = ?", (pid,))
                            conn.execute("DELETE FROM qa_audio_pairs WHERE id = ?", (pid,))
                    conn.commit()
                finally:
                    conn.close()

        return {
            "scanned": int(len(rows)),
            "invalid": int(len(invalid_items)),
            "deleted": int(len(deleted_ids)),
            "deleted_ids": sorted(int(x) for x in deleted_ids),
            "reason_counts": reason_counts,
        }

    def delete_pair_hard(self, *, pair_id: int) -> bool:
        pid = int(pair_id)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute("SELECT audio_rel_path FROM qa_audio_pairs WHERE id = ?", (pid,)).fetchone()
                if not row:
                    return False
                rel = str(row["audio_rel_path"] or "")
                conn.execute("DELETE FROM qa_audio_embeddings WHERE pair_id = ?", (pid,))
                conn.execute("DELETE FROM qa_audio_pairs WHERE id = ?", (pid,))
                conn.commit()
            finally:
                conn.close()

        if rel:
            p = self._safe_audio_path(rel)
            if p.exists() and p.is_file():
                p.unlink(missing_ok=True)
        return True
