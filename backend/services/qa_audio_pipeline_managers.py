from __future__ import annotations

import contextlib
import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.config import resolve_tts_request
from backend.services.audio_utils import ensure_wav_bytes, is_riff_wav
from backend.services.qa_audio_utils import char_ngrams
from backend.services.qa_audio_utils import compact_debug_raw
from backend.services.qa_audio_utils import detect_entity_conflict
from backend.services.qa_audio_utils import embed_question
from backend.services.qa_audio_utils import extract_core_terms
from backend.services.qa_audio_utils import extract_json
from backend.services.qa_audio_utils import extract_json_objects
from backend.services.qa_audio_utils import jaccard
from backend.services.qa_audio_utils import lexical_similarity
from backend.services.qa_audio_utils import parse_classification
from backend.services.qa_audio_utils import sanitize_classifier_text
from backend.services.qa_audio_utils import try_parse_json_like


@dataclass(frozen=True)
class AskMatchContext:
    question: str
    provider: str
    voice: str
    speed: float
    top_k: int
    threshold: float
    classifier_chat_name: str
    base_url: str


class QuestionIntakeManager:
    def build(
        self,
        *,
        question: str,
        provider: str,
        voice: str,
        speed: float,
        top_k: int,
        threshold: float,
        classifier_chat_name: str,
        base_url: str,
    ) -> AskMatchContext:
        q = str(question or "").strip()
        p = str(provider or "").strip()
        v = str(voice or "").strip()
        try:
            s = float(speed if speed is not None else 1.0)
        except Exception:
            s = 1.0
        s = round(max(0.5, min(s, 2.0)), 2)
        try:
            k = int(top_k if top_k is not None else 20)
        except Exception:
            k = 20
        k = max(1, min(k, 50))
        try:
            t = float(threshold if threshold is not None else 0.85)
        except Exception:
            t = 0.85
        t = max(0.0, min(t, 1.0))
        chat = str(classifier_chat_name or "问题比对").strip() or "问题比对"
        base = str(base_url or "")
        return AskMatchContext(
            question=q,
            provider=p,
            voice=v,
            speed=s,
            top_k=k,
            threshold=t,
            classifier_chat_name=chat,
            base_url=base,
        )


class QuestionNormalizationManager:
    def __init__(self, *, core_terms: tuple[str, ...]):
        self._core_terms = tuple(t for t in core_terms if str(t or "").strip())

    @staticmethod
    def char_ngrams(text: str, n: int) -> set[str]:
        return char_ngrams(text, n)

    @staticmethod
    def jaccard(a: set[str], b: set[str]) -> float:
        return jaccard(a, b)

    def lexical_similarity(self, a: str, b: str) -> float:
        return lexical_similarity(a, b)

    def extract_core_terms(self, text: str) -> set[str]:
        return extract_core_terms(text, core_terms=self._core_terms)

    def detect_entity_conflict(self, *, query: str, candidate: str) -> tuple[bool, list[str], list[str]]:
        return detect_entity_conflict(query=query, candidate=candidate, core_terms=self._core_terms)


class CacheRecallManager:
    def __init__(self, *, store):
        self._store = store

    @staticmethod
    def embed_question(text: str, *, dim: int = 512) -> np.ndarray:
        return embed_question(text, dim=dim)

    def find_exact_pair(self, *, question: str, tts_speed: float):
        return self._store.find_exact_pair(
            question_text=str(question or ""),
            tts_provider="",
            tts_voice="",
            tts_speed=float(tts_speed if tts_speed is not None else 1.0),
        )

    def search_candidates(self, *, question: str, tts_speed: float, top_k: int):
        emb = self.embed_question(question)
        return self._store.search_candidates(
            query_embedding=emb,
            tts_provider="",
            tts_voice="",
            tts_speed=float(tts_speed if tts_speed is not None else 1.0),
            top_k=max(1, min(int(top_k or 20), 50)),
        )

    def select_best(
        self,
        *,
        question: str,
        candidates: list[Any],
        lexical_similarity_fn,
        base_url: str,
    ) -> tuple[Any | None, Any | None, float, float, str]:
        best_candidate = None
        best_pair = None
        best_audio_url = ""
        best_recall = 0.0
        best_lexical = 0.0
        q = str(question or "")
        for c in candidates or []:
            pair = self._store.get_pair(pair_id=int(c.pair_id))
            if not pair:
                continue
            audio_path = self._store.get_audio_file_path(pair_id=int(c.pair_id))
            if not audio_path:
                continue
            lexical = float(lexical_similarity_fn(q, str(pair.question_text or "")))
            recall = float(c.score)
            if (lexical + (0.15 * recall)) > (best_lexical + (0.15 * best_recall)):
                best_candidate = c
                best_pair = pair
                best_audio_url = self._store.audio_url_for_pair(base_url=base_url, pair_id=int(pair.id))
                best_recall = recall
                best_lexical = lexical
        return best_candidate, best_pair, best_recall, best_lexical, best_audio_url


class MatchClassifierManager:
    def __init__(self, *, ragflow_service, logger: logging.Logger):
        self._ragflow_service = ragflow_service
        self._logger = logger

    @staticmethod
    def build_prompt(*, user_question: str, candidates: list[dict]) -> str:
        lines = []
        for c in candidates:
            lines.append(
                f"- id={int(c.get('pair_id', 0))} | score={float(c.get('score', 0.0)):.3f} | question={str(c.get('question_text') or '')}"
            )
        if not lines:
            lines = ["- none"]
        return (
            "You are a question-cache matcher.\n"
            "Task: decide whether the user question can reuse one candidate question's cached audio.\n"
            "Rules:\n"
            "- Judge intent similarity only.\n"
            "- Core entity term must be consistent. If product/entity differs, return match=false.\n"
            "- Example of mismatch: '指引导丝' vs '指引导管' (one-char difference but different product).\n"
            "- For entity mismatch, confidence must be <= 0.20.\n"
            "- Be conservative when uncertain.\n"
            "- Return strict JSON only, no markdown, no extra text.\n"
            "- Do NOT output any thinking text or tags like <think>.</think>\n"
            "JSON schema:\n"
            '{"match": true|false, "candidate_id": number|null, "confidence": 0~1, "reason": "..."}\n\n'
            f"User question:\n{str(user_question or '').strip()}\n\n"
            f"Candidates:\n{chr(10).join(lines)}\n"
        )

    @staticmethod
    def sanitize_text(raw_text: str) -> str:
        return sanitize_classifier_text(raw_text)

    @classmethod
    def extract_json(cls, raw_text: str) -> str:
        return extract_json(raw_text)

    @classmethod
    def try_parse_json_like(cls, raw_text: str) -> dict | None:
        return try_parse_json_like(raw_text)

    @classmethod
    def extract_json_objects(cls, raw_text: str) -> list[str]:
        return extract_json_objects(raw_text)

    @classmethod
    def parse_classification(cls, raw_text: str) -> dict:
        return parse_classification(raw_text)

    @staticmethod
    def compact_debug_raw(raw_text: str, *, head: int = 2000, tail: int = 2000) -> tuple[str, bool]:
        return compact_debug_raw(raw_text, head=head, tail=tail)

    def ask_model(self, *, prompt: str, classifier_chat_name: str) -> str:
        def _to_text(v: Any) -> str:
            if v is None:
                return ""
            if isinstance(v, str):
                return v
            if isinstance(v, (dict, list)):
                with contextlib.suppress(Exception):
                    return json.dumps(v, ensure_ascii=False)
            return str(v)

        def _chunk_text(chunk: Any) -> str:
            if chunk is None:
                return ""
            if isinstance(chunk, str):
                return chunk
            for attr in ("content", "answer", "text"):
                if hasattr(chunk, attr):
                    txt = _to_text(getattr(chunk, attr))
                    if txt:
                        return txt
            if isinstance(chunk, dict):
                for k in ("answer", "content", "text"):
                    if chunk.get(k):
                        return _to_text(chunk.get(k))
                return _to_text(chunk)
            return _to_text(chunk)

        try:
            sess = self._ragflow_service.get_session(classifier_chat_name)
            if not sess:
                return ""
            resp = sess.ask(prompt, stream=False)
            if isinstance(resp, str):
                return resp
            if hasattr(resp, "content"):
                return _to_text(getattr(resp, "content"))
            if isinstance(resp, dict):
                for k in ("answer", "content", "text"):
                    if k in resp and resp.get(k):
                        return _to_text(resp.get(k))
            if hasattr(resp, "__iter__"):
                parts: list[str] = []
                current = ""
                for chunk in resp:
                    txt = _chunk_text(chunk)
                    if not txt:
                        continue
                    if not current:
                        current = txt
                        continue
                    if txt.startswith(current):
                        current = txt
                        continue
                    if current.startswith(txt):
                        continue
                    parts.append(current)
                    current = txt
                if current:
                    parts.append(current)
                return "".join(parts)
            return str(resp or "")
        except Exception as e:  # noqa: BLE001
            self._logger.warning(f"[QA_AUDIO] classifier_call_failed err={e}")
            return ""


class MatchDecisionManager:
    def __init__(self):
        self.heuristic_lexical_threshold = 0.45
        self.heuristic_recall_threshold = 0.62
        self.fallback_lexical_threshold = 0.35
        self.fallback_recall_threshold = 0.55
        self.soft_accept_lexical_threshold = 0.9
        self.soft_accept_confidence_threshold = 0.30
        self.soft_accept_recall_threshold = 0.20

    def should_use_heuristic(self, *, lexical: float, recall: float, entity_conflict: bool) -> bool:
        return (not entity_conflict) and lexical >= self.heuristic_lexical_threshold and recall >= self.heuristic_recall_threshold

    def should_use_fallback(self, *, lexical: float, recall: float, entity_conflict: bool) -> bool:
        return (not entity_conflict) and lexical >= self.fallback_lexical_threshold and recall >= self.fallback_recall_threshold

    @staticmethod
    def heuristic_confidence(*, lexical: float, recall: float) -> float:
        return min(0.98, max(0.86, (lexical * 0.6) + (recall * 0.4)))

    @staticmethod
    def fallback_confidence(*, lexical: float, recall: float) -> float:
        return min(0.92, max(0.78, (lexical * 0.65) + (recall * 0.35)))

    def should_soft_accept(self, *, confidence: float, lexical: float, recall: float, entity_conflict: bool) -> bool:
        if entity_conflict:
            return False
        return lexical >= self.soft_accept_lexical_threshold or (
            confidence >= self.soft_accept_confidence_threshold and recall >= self.soft_accept_recall_threshold
        )


class HitResponseManager:
    @staticmethod
    def build_payload(*, pair, audio_url: str, confidence: float, recall_score: float, reason: str) -> dict:
        return {
            "pair_id": int(pair.id),
            "question_text": str(pair.question_text or ""),
            "answer_text": str(pair.answer_text or ""),
            "audio_url": str(audio_url or ""),
            "confidence": max(0.0, min(float(confidence), 1.0)),
            "recall_score": max(0.0, min(float(recall_score), 1.0)),
            "reason": str(reason or ""),
        }


class MissExecutionManager:
    @staticmethod
    def mark(debug: dict, *, reason: str, **fields) -> None:
        debug["reason"] = str(reason or "")
        for k, v in (fields or {}).items():
            debug[k] = v


class CacheWritebackManager:
    def __init__(self, *, store, tts_service, logger: logging.Logger):
        self._store = store
        self._tts_service = tts_service
        self._logger = logger

    def upsert_from_answer(
        self,
        *,
        question: str,
        answer: str,
        request_id: str,
        provider: str,
        voice: str,
        speed: float,
        app_config: dict,
        guess_sample_rate_fn,
        embed_fn,
    ) -> int | None:
        data = {
            "tts_provider": str(provider or ""),
            "tts_voice": str(voice or ""),
            "tts_speed": float(speed if speed is not None else 1.0),
        }
        provider_resolved, resolved_cfg = resolve_tts_request(app_config, data=data, headers=None)
        req_for_tts = f"qa_audio_{request_id}_{int(time.time() * 1000)}"
        cancel_event = threading.Event()
        chunks: list[bytes] = []
        for chunk in self._tts_service.stream(
            text=answer,
            request_id=req_for_tts,
            config=resolved_cfg,
            provider=str(provider_resolved or ""),
            endpoint="/qa_audio_cache/synthesize",
            segment_index=0,
            cancel_event=cancel_event,
        ):
            if chunk:
                chunks.append(bytes(chunk))
        if not chunks:
            self._logger.warning(f"[QA_AUDIO] tts_no_audio request_id={request_id}")
            return None

        wav_bytes_raw = b"".join(chunks)
        wav_bytes = ensure_wav_bytes(
            wav_bytes_raw,
            sample_rate=guess_sample_rate_fn(resolved_cfg=resolved_cfg, provider=str(provider_resolved or "")),
            channels=1,
            bits_per_sample=16,
        )
        if not wav_bytes:
            self._logger.warning(
                f"[QA_AUDIO] tts_audio_unsupported_for_wav_cache request_id={request_id} bytes={len(wav_bytes_raw)}"
            )
            return None

        if is_riff_wav(wav_bytes_raw) and wav_bytes != wav_bytes_raw:
            self._logger.info(
                f"[QA_AUDIO] wav_header_patched request_id={request_id} before={len(wav_bytes_raw)} after={len(wav_bytes)}"
            )

        pair_id = self._store.upsert_pair_with_audio(
            question_text=question,
            answer_text=answer,
            audio_bytes=wav_bytes,
            tts_provider=str(provider or ""),
            tts_voice=str(voice or ""),
            tts_speed=float(speed if speed is not None else 1.0),
            source_request_id=str(request_id or ""),
            embedding=embed_fn(question),
            embedding_model="hash_char_ngram_v1",
        )
        return int(pair_id) if pair_id else None
