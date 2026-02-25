from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.config import resolve_tts_request
from backend.services.audio_utils import ensure_wav_bytes, is_riff_wav


@dataclass(frozen=True)
class TtsProfile:
    provider: str
    voice: str
    speed: float


class QaAudioMatcher:
    """
    Two-stage matcher:
    1) vector recall (local hash embedding + cosine)
    2) RAGFlow small-model classification (JSON contract)
    """

    def __init__(self, *, store, ragflow_service, tts_service, logger: logging.Logger | None = None):
        self._store = store
        self._ragflow_service = ragflow_service
        self._tts_service = tts_service
        self._logger = logger or logging.getLogger(__name__)

    @staticmethod
    def _norm_speed(v: float | int | str | None) -> float:
        try:
            x = float(v if v is not None else 1.0)
        except Exception:
            x = 1.0
        return round(max(0.5, min(x, 2.0)), 2)

    def _embed_question(self, text: str, *, dim: int = 512) -> np.ndarray:
        """
        Cheap deterministic embedding:
        - char 1/2/3-gram hashing
        - signed bucket accumulation + l2 normalize
        """
        s = str(text or "").strip().lower()
        v = np.zeros((int(dim),), dtype=np.float32)
        if not s:
            return v

        for n in (1, 2, 3):
            if len(s) < n:
                continue
            for i in range(0, len(s) - n + 1):
                gram = s[i : i + n]
                h = hash((n, gram))
                idx = abs(h) % dim
                sign = 1.0 if (h & 1) == 0 else -1.0
                v[idx] += sign

        norm = float(np.linalg.norm(v))
        if norm > 1e-12:
            v /= norm
        return v

    @staticmethod
    def _build_prompt(*, user_question: str, candidates: list[dict]) -> str:
        lines = []
        for c in candidates:
            lines.append(f"- id={int(c.get('pair_id', 0))} | question={str(c.get('question_text') or '')}")
        if not lines:
            lines = ["- none"]
        return (
            "你是问答缓存匹配分类器。\n"
            "任务：判断用户问题是否可复用某条历史问题对应的同一语音答案。\n"
            "仅按问题语义意图判断，不要扩展知识。\n"
            "必须只输出严格 JSON，不要 markdown，不要多余文本。\n"
            "JSON schema:\n"
            '{"match": true|false, "candidate_id": number|null, "confidence": 0~1, "reason": "..."}\n\n'
            f"用户问题:\n{str(user_question or '').strip()}\n\n"
            f"候选历史问题:\n{chr(10).join(lines)}\n"
        )

    @staticmethod
    def _extract_json(raw_text: str) -> str:
        txt = str(raw_text or "").strip()
        if not txt:
            return "{}"
        txt = re.sub(r"^```(?:json)?\s*", "", txt, flags=re.IGNORECASE)
        txt = re.sub(r"\s*```$", "", txt)
        l = txt.find("{")
        r = txt.rfind("}")
        if l >= 0 and r > l:
            return txt[l : r + 1]
        return txt

    def _parse_classification(self, raw_text: str) -> dict:
        try:
            data = json.loads(self._extract_json(raw_text))
        except Exception:
            return {"match": False, "candidate_id": None, "confidence": 0.0, "reason": "invalid_json"}

        try:
            confidence = float(data.get("confidence", 0.0))
        except Exception:
            confidence = 0.0
        confidence = max(0.0, min(confidence, 1.0))
        cid = data.get("candidate_id")
        try:
            cid = int(cid) if cid is not None else None
        except Exception:
            cid = None
        return {
            "match": bool(data.get("match", False)),
            "candidate_id": cid,
            "confidence": confidence,
            "reason": str(data.get("reason", "") or ""),
        }

    def _ask_classifier_model(self, *, prompt: str, classifier_chat_name: str) -> str:
        try:
            sess = self._ragflow_service.get_session(classifier_chat_name)
            if not sess:
                return ""
            resp = sess.ask(prompt, stream=False)
            if isinstance(resp, str):
                return resp
            if hasattr(resp, "content"):
                return str(getattr(resp, "content") or "")
            if isinstance(resp, dict):
                for k in ("answer", "content", "text"):
                    if k in resp and resp.get(k):
                        return str(resp.get(k))
            return str(resp or "")
        except Exception as e:  # noqa: BLE001
            self._logger.warning(f"[QA_AUDIO] classifier_call_failed err={e}")
            return ""

    def find_match(
        self,
        *,
        question: str,
        tts_profile: TtsProfile,
        top_k: int = 20,
        threshold: float = 0.85,
        classifier_chat_name: str = "__qa_audio_classifier__",
        base_url: str = "",
    ) -> dict | None:
        q = str(question or "").strip()
        if not q:
            return None
        if not str(tts_profile.provider or "").strip():
            return None

        emb = self._embed_question(q)
        candidates = self._store.search_candidates(
            query_embedding=emb,
            tts_provider=str(tts_profile.provider or ""),
            tts_voice=str(tts_profile.voice or ""),
            tts_speed=self._norm_speed(tts_profile.speed),
            top_k=max(1, min(int(top_k or 20), 50)),
        )
        if not candidates:
            return None

        raw_candidates = [
            {
                "pair_id": int(c.pair_id),
                "question_text": str(c.question_text or ""),
                "score": float(c.score),
            }
            for c in candidates
        ]
        prompt = self._build_prompt(user_question=q, candidates=raw_candidates)
        raw_text = self._ask_classifier_model(prompt=prompt, classifier_chat_name=classifier_chat_name)
        parsed = self._parse_classification(raw_text)
        if not parsed.get("match"):
            return None

        cid = parsed.get("candidate_id")
        conf = float(parsed.get("confidence") or 0.0)
        if cid is None or conf < float(threshold):
            return None

        candidate_map = {int(c.pair_id): c for c in candidates}
        hit = candidate_map.get(int(cid))
        if not hit:
            return None

        pair = self._store.get_pair(pair_id=int(cid))
        if not pair:
            return None
        audio_path = self._store.get_audio_file_path(pair_id=int(cid))
        if not audio_path:
            return None

        return {
            "pair_id": int(pair.id),
            "question_text": str(pair.question_text or ""),
            "answer_text": str(pair.answer_text or ""),
            "audio_url": self._store.audio_url_for_pair(base_url=base_url, pair_id=int(pair.id)),
            "confidence": conf,
            "recall_score": float(hit.score),
            "reason": str(parsed.get("reason") or ""),
        }

    def schedule_upsert_from_answer(
        self,
        *,
        question: str,
        answer: str,
        request_id: str,
        tts_profile: TtsProfile,
        app_config: dict,
    ) -> None:
        q = str(question or "").strip()
        a = str(answer or "").strip()
        if not q or not a:
            return
        if not str(tts_profile.provider or "").strip():
            return

        def _task() -> None:
            try:
                self._upsert_from_answer_sync(
                    question=q,
                    answer=a,
                    request_id=str(request_id or ""),
                    tts_profile=tts_profile,
                    app_config=app_config if isinstance(app_config, dict) else {},
                )
            except Exception as e:  # noqa: BLE001
                self._logger.warning(f"[QA_AUDIO] upsert_task_failed request_id={request_id} err={e}", exc_info=True)

        th = threading.Thread(target=_task, name=f"qa_audio_upsert_{int(time.time() * 1000)}", daemon=True)
        th.start()

    def _upsert_from_answer_sync(
        self,
        *,
        question: str,
        answer: str,
        request_id: str,
        tts_profile: TtsProfile,
        app_config: dict,
    ) -> None:
        data = {
            "tts_provider": str(tts_profile.provider or ""),
            "tts_voice": str(tts_profile.voice or ""),
            "tts_speed": self._norm_speed(tts_profile.speed),
        }
        provider, resolved_cfg = resolve_tts_request(app_config, data=data, headers=None)
        req_for_tts = f"qa_audio_{request_id}_{int(time.time() * 1000)}"
        cancel_event = threading.Event()
        chunks: list[bytes] = []
        for chunk in self._tts_service.stream(
            text=answer,
            request_id=req_for_tts,
            config=resolved_cfg,
            provider=str(provider or ""),
            endpoint="/qa_audio_cache/synthesize",
            segment_index=0,
            cancel_event=cancel_event,
        ):
            if chunk:
                chunks.append(bytes(chunk))
        if not chunks:
            self._logger.warning(f"[QA_AUDIO] tts_no_audio request_id={request_id}")
            return

        wav_bytes_raw = b"".join(chunks)
        wav_bytes = ensure_wav_bytes(
            wav_bytes_raw,
            sample_rate=self._guess_sample_rate(resolved_cfg=resolved_cfg, provider=str(provider or "")),
            channels=1,
            bits_per_sample=16,
        )
        if not wav_bytes:
            self._logger.warning(f"[QA_AUDIO] tts_audio_unsupported_for_wav_cache request_id={request_id} bytes={len(wav_bytes_raw)}")
            return

        if is_riff_wav(wav_bytes_raw) and wav_bytes != wav_bytes_raw:
            self._logger.info(f"[QA_AUDIO] wav_header_patched request_id={request_id} before={len(wav_bytes_raw)} after={len(wav_bytes)}")

        emb = self._embed_question(question)
        pair_id = self._store.upsert_pair_with_audio(
            question_text=question,
            answer_text=answer,
            audio_bytes=wav_bytes,
            tts_provider=str(tts_profile.provider or ""),
            tts_voice=str(tts_profile.voice or ""),
            tts_speed=self._norm_speed(tts_profile.speed),
            source_request_id=str(request_id or ""),
            embedding=emb,
            embedding_model="hash_char_ngram_v1",
        )
        if pair_id:
            self._logger.info(
                f"[QA_AUDIO] upsert_ok pair_id={pair_id} request_id={request_id} provider={tts_profile.provider} voice={tts_profile.voice} speed={self._norm_speed(tts_profile.speed)}"
            )

    @staticmethod
    def _guess_sample_rate(*, resolved_cfg: dict, provider: str) -> int:
        cfg = resolved_cfg if isinstance(resolved_cfg, dict) else {}
        p = str(provider or "").strip().lower()

        # Prefer explicit provider config sample rates if present.
        if p in ("modelscope", "bailian", "dashscope", "flash"):
            try:
                sr = (((cfg.get("tts") or {}).get("bailian") or {}).get("sample_rate"))
                if sr is not None and str(sr).strip() != "":
                    return max(8000, int(sr))
            except Exception:
                pass

        if p == "edge":
            try:
                fmt = str((((cfg.get("tts") or {}).get("edge") or {}).get("output_format") or "")).strip().lower()
                m = re.search(r"(\d+)\s*khz", fmt)
                if m:
                    return max(8000, int(m.group(1)) * 1000)
            except Exception:
                pass

        return 16000
