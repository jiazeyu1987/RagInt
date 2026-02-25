from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(frozen=True)
class VectorHit:
    pair_id: int
    score: float
    question_text: str
    answer_text: str
    audio_path: str
    tts_provider: str
    tts_voice: str
    tts_speed: float


class VectorQaStore:
    """
    Minimal vector-cache demo:
    - SQLite storage
    - float32 vector blob
    - cosine top-k retrieval with TTS-parameter isolation
    """

    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self._db_path = str(db_path)
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._ensure_schema()

    def close(self) -> None:
        self._conn.close()

    def _ensure_schema(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS qa_audio_pairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_text TEXT NOT NULL,
                answer_text TEXT NOT NULL,
                audio_path TEXT NOT NULL,
                tts_provider TEXT NOT NULL,
                tts_voice TEXT NOT NULL,
                tts_speed REAL NOT NULL
            );
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS qa_audio_embeddings (
                pair_id INTEGER PRIMARY KEY,
                dim INTEGER NOT NULL,
                vector_blob BLOB NOT NULL,
                FOREIGN KEY(pair_id) REFERENCES qa_audio_pairs(id) ON DELETE CASCADE
            );
            """
        )
        self._conn.commit()

    @staticmethod
    def _to_blob(vec: np.ndarray) -> tuple[int, bytes]:
        a = np.asarray(vec, dtype=np.float32).reshape(-1)
        return int(a.shape[0]), a.tobytes()

    @staticmethod
    def _from_blob(dim: int, blob: bytes) -> np.ndarray:
        a = np.frombuffer(blob, dtype=np.float32)
        if int(a.shape[0]) != int(dim):
            raise ValueError(f"embedding dim mismatch: expected={dim} actual={a.shape[0]}")
        return a

    def add_pair(
        self,
        *,
        question_text: str,
        answer_text: str,
        audio_path: str,
        tts_provider: str,
        tts_voice: str,
        tts_speed: float,
        embedding: np.ndarray,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO qa_audio_pairs (
                question_text, answer_text, audio_path, tts_provider, tts_voice, tts_speed
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(question_text),
                str(answer_text),
                str(audio_path),
                str(tts_provider),
                str(tts_voice),
                float(tts_speed),
            ),
        )
        pair_id = int(cur.lastrowid or 0)
        dim, blob = self._to_blob(embedding)
        self._conn.execute(
            """
            INSERT INTO qa_audio_embeddings (pair_id, dim, vector_blob)
            VALUES (?, ?, ?)
            """,
            (pair_id, dim, blob),
        )
        self._conn.commit()
        return pair_id

    @staticmethod
    def _cosine(a: np.ndarray, b: np.ndarray) -> float:
        a_norm = float(np.linalg.norm(a))
        b_norm = float(np.linalg.norm(b))
        if a_norm <= 1e-12 or b_norm <= 1e-12:
            return 0.0
        return float(np.dot(a, b) / (a_norm * b_norm))

    def search_topk(
        self,
        *,
        query_embedding: np.ndarray,
        tts_provider: str,
        tts_voice: str,
        tts_speed: float,
        k: int = 5,
    ) -> list[VectorHit]:
        q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
        rows = self._conn.execute(
            """
            SELECT
                p.id,
                p.question_text,
                p.answer_text,
                p.audio_path,
                p.tts_provider,
                p.tts_voice,
                p.tts_speed,
                e.dim,
                e.vector_blob
            FROM qa_audio_pairs p
            JOIN qa_audio_embeddings e ON e.pair_id = p.id
            WHERE p.tts_provider = ? AND p.tts_voice = ? AND p.tts_speed = ?
            """,
            (str(tts_provider), str(tts_voice), float(tts_speed)),
        ).fetchall()

        scored: list[VectorHit] = []
        for r in rows:
            v = self._from_blob(int(r["dim"]), r["vector_blob"])
            score = self._cosine(q, v)
            scored.append(
                VectorHit(
                    pair_id=int(r["id"]),
                    score=score,
                    question_text=str(r["question_text"]),
                    answer_text=str(r["answer_text"]),
                    audio_path=str(r["audio_path"]),
                    tts_provider=str(r["tts_provider"]),
                    tts_voice=str(r["tts_voice"]),
                    tts_speed=float(r["tts_speed"]),
                )
            )
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[: max(1, int(k))]


def demo_payload(hit: VectorHit) -> dict[str, Any]:
    return {
        "audio_hit": True,
        "pair_id": hit.pair_id,
        "answer_text": hit.answer_text,
        "audio_url": hit.audio_path,
        "score": round(hit.score, 6),
        "tts_provider": hit.tts_provider,
        "tts_voice": hit.tts_voice,
        "tts_speed": hit.tts_speed,
    }

