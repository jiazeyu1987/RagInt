from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.services.ragflow_chat_manager import RagflowChatManager
from backend.services.qa_audio_pipeline_managers import CacheRecallManager
from backend.services.qa_audio_pipeline_managers import CacheWritebackManager
from backend.services.qa_audio_pipeline_managers import HitResponseManager
from backend.services.qa_audio_pipeline_managers import MatchClassifierManager
from backend.services.qa_audio_pipeline_managers import MatchDecisionManager
from backend.services.qa_audio_pipeline_managers import MissExecutionManager
from backend.services.qa_audio_pipeline_managers import QuestionIntakeManager
from backend.services.qa_audio_pipeline_managers import QuestionNormalizationManager
from backend.services.qa_audio_utils import DEFAULT_CORE_ENTITY_TERMS


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

    _CORE_ENTITY_TERMS: tuple[str, ...] = DEFAULT_CORE_ENTITY_TERMS

    def __init__(self, *, store, ragflow_service, tts_service, ragflow_chat_manager=None, logger: logging.Logger | None = None):
        self._store = store
        self._ragflow_service = ragflow_service
        self._ragflow_chat_manager = ragflow_chat_manager or RagflowChatManager(
            ragflow_service=ragflow_service,
            default_session=None,
        )
        self._tts_service = tts_service
        self._logger = logger or logging.getLogger(__name__)
        self._debug_local = threading.local()

        self._intake_manager = QuestionIntakeManager()
        self._normalization_manager = QuestionNormalizationManager(core_terms=self._CORE_ENTITY_TERMS)
        self._recall_manager = CacheRecallManager(store=store)
        self._classifier_manager = MatchClassifierManager(
            ragflow_chat_manager=self._ragflow_chat_manager,
            logger=self._logger,
        )
        self._decision_manager = MatchDecisionManager()
        self._hit_manager = HitResponseManager()
        self._miss_manager = MissExecutionManager()
        self._writeback_manager = CacheWritebackManager(store=store, tts_service=tts_service, logger=self._logger)

    def _set_last_debug(self, data: dict | None) -> None:
        self._debug_local.last = dict(data or {})

    def get_last_debug(self) -> dict:
        data = getattr(self._debug_local, "last", None)
        return dict(data) if isinstance(data, dict) else {}

    @staticmethod
    def _norm_speed(v: float | int | str | None) -> float:
        x = float(v if v is not None else 1.0)
        return round(max(0.5, min(x, 2.0)), 2)

    # Compatibility wrappers (tests and callers may use these private methods).
    def _embed_question(self, text: str, *, dim: int = 512) -> np.ndarray:
        return self._recall_manager.embed_question(text, dim=dim)

    @staticmethod
    def _build_prompt(*, user_question: str, candidates: list[dict]) -> str:
        return MatchClassifierManager.build_prompt(user_question=user_question, candidates=candidates)

    @staticmethod
    def _sanitize_classifier_text(raw_text: str) -> str:
        return MatchClassifierManager.sanitize_text(raw_text)

    @staticmethod
    def _extract_json(raw_text: str) -> str:
        return MatchClassifierManager.extract_json(raw_text)

    @staticmethod
    def _try_parse_json_like(raw_text: str) -> dict | None:
        return MatchClassifierManager.try_parse_json_like(raw_text)

    @staticmethod
    def _extract_json_objects(raw_text: str) -> list[str]:
        return MatchClassifierManager.extract_json_objects(raw_text)

    @staticmethod
    def _build_classifier_prompt(*, user_question: str, candidates: list[dict]) -> str:
        return MatchClassifierManager.build_prompt(user_question=user_question, candidates=candidates)

    @staticmethod
    def _char_ngrams(text: str, n: int) -> set[str]:
        return QuestionNormalizationManager.char_ngrams(text, n)

    @staticmethod
    def _jaccard(a: set[str], b: set[str]) -> float:
        return QuestionNormalizationManager.jaccard(a, b)

    @classmethod
    def _lexical_similarity(cls, a: str, b: str) -> float:
        manager = QuestionNormalizationManager(core_terms=cls._CORE_ENTITY_TERMS)
        return manager.lexical_similarity(a, b)

    @classmethod
    def _extract_core_terms(cls, text: str) -> set[str]:
        manager = QuestionNormalizationManager(core_terms=cls._CORE_ENTITY_TERMS)
        return manager.extract_core_terms(text)

    @classmethod
    def _detect_entity_conflict(cls, *, query: str, candidate: str) -> tuple[bool, list[str], list[str]]:
        manager = QuestionNormalizationManager(core_terms=cls._CORE_ENTITY_TERMS)
        return manager.detect_entity_conflict(query=query, candidate=candidate)

    @staticmethod
    def _candidate_hit_payload(*, pair, audio_url: str, confidence: float, recall_score: float, reason: str) -> dict:
        return HitResponseManager.build_payload(
            pair=pair,
            audio_url=audio_url,
            confidence=confidence,
            recall_score=recall_score,
            reason=reason,
        )

    @staticmethod
    def _compact_debug_raw(raw_text: str, *, head: int = 2000, tail: int = 2000) -> tuple[str, bool]:
        return MatchClassifierManager.compact_debug_raw(raw_text, head=head, tail=tail)

    def _parse_classification(self, raw_text: str) -> dict:
        return self._classifier_manager.parse_classification(raw_text)

    def _ask_classifier_model(self, *, prompt: str, classifier_chat_name: str) -> str:
        return self._classifier_manager.ask_model(prompt=prompt, classifier_chat_name=classifier_chat_name)

    def find_match(
        self,
        *,
        question: str,
        tts_profile: TtsProfile,
        top_k: int = 20,
        threshold: float = 0.85,
        classifier_chat_name: str = "问题比对",
        base_url: str = "",
    ) -> dict | None:
        ctx = self._intake_manager.build(
            question=question,
            provider=str(tts_profile.provider or ""),
            voice=str(tts_profile.voice or ""),
            speed=tts_profile.speed,
            top_k=top_k,
            threshold=threshold,
            classifier_chat_name=classifier_chat_name,
            base_url=base_url,
        )

        debug: dict[str, Any] = {
            "hit": False,
            "reason": "",
            "question": ctx.question[:160],
            "tts_provider": ctx.provider,
            "tts_voice": ctx.voice,
            "tts_speed": ctx.speed,
            "classifier_chat_name": ctx.classifier_chat_name,
            "classifier_called": False,
        }

        if not ctx.question:
            self._miss_manager.mark(debug, reason="empty_question")
            self._set_last_debug(debug)
            return None

        exact = self._recall_manager.find_exact_pair(question=ctx.question, tts_speed=ctx.speed)
        if exact is not None:
            audio_path = self._store.get_audio_file_path(pair_id=int(exact.id))
            if audio_path:
                debug["hit"] = True
                debug["reason"] = "exact_normalized_question"
                debug["pair_id"] = int(exact.id)
                self._set_last_debug(debug)
                return self._hit_manager.build_payload(
                    pair=exact,
                    audio_url=self._store.audio_url_for_pair(base_url=ctx.base_url, pair_id=int(exact.id)),
                    confidence=1.0,
                    recall_score=1.0,
                    reason="exact_normalized_question",
                )
            debug["exact_pair_audio_missing"] = True

        candidates = self._recall_manager.search_candidates(question=ctx.question, tts_speed=ctx.speed, top_k=ctx.top_k)
        debug["candidate_source"] = "tts_bucket"
        debug["candidate_count_in_tts_bucket"] = int(len(candidates))
        if not candidates:
            cross_bucket_candidates = self._recall_manager.search_candidates_any_bucket(question=ctx.question, top_k=ctx.top_k)
            debug["candidate_count_any_bucket"] = int(len(cross_bucket_candidates))
            if cross_bucket_candidates:
                candidates = cross_bucket_candidates
                debug["candidate_source"] = "cross_tts_bucket_recall"
                debug["cross_bucket_recall_used"] = True
            else:
                debug["candidate_source"] = "no_candidates_any_bucket"
                debug["cross_bucket_recall_used"] = True
                debug["no_candidates_in_any_bucket"] = True
        debug["candidate_count"] = int(len(candidates))
        if not candidates:
            self._miss_manager.mark(debug, reason="no_candidates_any_bucket")
            self._set_last_debug(debug)
            return None

        best_candidate, best_pair, best_recall, best_lexical, best_audio_url = self._recall_manager.select_best(
            question=ctx.question,
            candidates=candidates,
            lexical_similarity_fn=self._normalization_manager.lexical_similarity,
            base_url=ctx.base_url,
        )

        if best_pair is not None:
            debug["best_pair_id"] = int(best_pair.id)
            if debug.get("candidate_id") is None:
                debug["candidate_id"] = int(best_pair.id)

        best_entity_conflict = False
        if best_pair is not None:
            best_entity_conflict, q_terms, c_terms = self._normalization_manager.detect_entity_conflict(
                query=ctx.question,
                candidate=str(best_pair.question_text or ""),
            )
            if best_entity_conflict:
                debug["entity_conflict"] = True
                debug["entity_query_terms"] = q_terms
                debug["entity_candidate_terms"] = c_terms

        if best_candidate is not None and best_pair is not None and self._decision_manager.should_use_heuristic(
            lexical=best_lexical,
            recall=best_recall,
            entity_conflict=best_entity_conflict,
        ):
            debug["hit"] = True
            debug["reason"] = "heuristic_similarity_match"
            debug["pair_id"] = int(best_pair.id)
            debug["best_lexical"] = round(float(best_lexical), 4)
            debug["best_recall"] = round(float(best_recall), 4)
            self._set_last_debug(debug)
            return self._hit_manager.build_payload(
                pair=best_pair,
                audio_url=best_audio_url,
                confidence=self._decision_manager.heuristic_confidence(lexical=best_lexical, recall=best_recall),
                recall_score=best_recall,
                reason="heuristic_similarity_match",
            )

        raw_candidates = [
            {
                "pair_id": int(c.pair_id),
                "question_text": str(c.question_text or ""),
                "score": float(c.score),
            }
            for c in candidates
        ]
        prompt = self._build_classifier_prompt(user_question=ctx.question, candidates=raw_candidates)
        debug["classifier_called"] = True
        raw_text = self._ask_classifier_model(prompt=prompt, classifier_chat_name=ctx.classifier_chat_name)
        raw_text_str = str(raw_text or "")
        debug["classifier_raw_len"] = len(raw_text_str)
        debug["classifier_raw_preview"] = raw_text_str[:260]
        compact_raw, is_truncated = self._compact_debug_raw(raw_text_str, head=2000, tail=2000)
        debug["classifier_raw"] = compact_raw
        debug["classifier_raw_truncated"] = bool(is_truncated)
        debug["classifier_raw_head"] = raw_text_str[:800]
        debug["classifier_raw_tail"] = raw_text_str[-800:] if raw_text_str else ""

        parsed = self._parse_classification(raw_text_str)
        debug["classifier_match"] = bool(parsed.get("match"))
        debug["classifier_confidence"] = round(float(parsed.get("confidence") or 0.0), 4)
        debug["classifier_reason"] = str(parsed.get("reason") or "")
        if parsed.get("candidate_id") is not None:
            debug["candidate_id"] = int(parsed.get("candidate_id"))

        if not parsed.get("match"):
            self._miss_manager.mark(debug, reason=f"classifier_no_match:{str(parsed.get('reason') or '')}")
            self._set_last_debug(debug)
            return None

        cid = parsed.get("candidate_id")
        conf = float(parsed.get("confidence") or 0.0)
        candidate_map = {int(c.pair_id): c for c in candidates}
        hit = candidate_map.get(int(cid)) if cid is not None else None

        if cid is None:
            self._miss_manager.mark(debug, reason="classifier_missing_candidate_id")
            self._set_last_debug(debug)
            return None

        if conf < float(ctx.threshold):
            low_conf_pair = self._store.get_pair(pair_id=int(cid)) if hit else None
            low_conf_audio = self._store.get_audio_file_path(pair_id=int(cid)) if low_conf_pair else None
            if low_conf_pair and low_conf_audio:
                low_conflict, q_terms, c_terms = self._normalization_manager.detect_entity_conflict(
                    query=ctx.question,
                    candidate=str(low_conf_pair.question_text or ""),
                )
                if low_conflict:
                    self._miss_manager.mark(
                        debug,
                        reason="classifier_entity_mismatch_guard",
                        candidate_id=int(cid),
                        entity_conflict=True,
                        entity_query_terms=q_terms,
                        entity_candidate_terms=c_terms,
                        classifier_confidence=round(min(float(conf), 0.2), 4),
                    )
                    self._set_last_debug(debug)
                    return None

                recall_score = float(hit.score)
                lexical = self._normalization_manager.lexical_similarity(ctx.question, str(low_conf_pair.question_text or ""))
                if self._decision_manager.should_soft_accept(
                    confidence=conf,
                    lexical=lexical,
                    recall=recall_score,
                    entity_conflict=low_conflict,
                ):
                    debug["hit"] = True
                    debug["reason"] = "classifier_match_soft_accept"
                    debug["pair_id"] = int(low_conf_pair.id)
                    debug["threshold"] = float(ctx.threshold)
                    debug["lexical"] = round(float(lexical), 4)
                    debug["recall_score"] = round(float(recall_score), 4)
                    self._set_last_debug(debug)
                    return self._hit_manager.build_payload(
                        pair=low_conf_pair,
                        audio_url=self._store.audio_url_for_pair(base_url=ctx.base_url, pair_id=int(low_conf_pair.id)),
                        confidence=max(float(conf), 0.75),
                        recall_score=recall_score,
                        reason="classifier_match_soft_accept",
                    )

            self._miss_manager.mark(
                debug,
                reason="classifier_confidence_below_threshold",
                threshold=float(ctx.threshold),
            )
            self._set_last_debug(debug)
            return None

        if not hit:
            self._miss_manager.mark(
                debug,
                reason="classifier_candidate_not_in_recall_set",
                candidate_id=int(cid),
            )
            self._set_last_debug(debug)
            return None

        pair = self._store.get_pair(pair_id=int(cid))
        if not pair:
            self._miss_manager.mark(
                debug,
                reason="candidate_pair_not_found",
                candidate_id=int(cid),
            )
            self._set_last_debug(debug)
            return None

        audio_path = self._store.get_audio_file_path(pair_id=int(cid))
        if not audio_path:
            self._miss_manager.mark(
                debug,
                reason="candidate_audio_missing",
                candidate_id=int(cid),
            )
            self._set_last_debug(debug)
            return None

        final_conflict, q_terms, c_terms = self._normalization_manager.detect_entity_conflict(
            query=ctx.question,
            candidate=str(pair.question_text or ""),
        )
        if final_conflict:
            self._miss_manager.mark(
                debug,
                reason="classifier_entity_mismatch_guard",
                candidate_id=int(cid),
                entity_conflict=True,
                entity_query_terms=q_terms,
                entity_candidate_terms=c_terms,
                classifier_confidence=round(min(float(conf), 0.2), 4),
            )
            self._set_last_debug(debug)
            return None

        debug["hit"] = True
        debug["reason"] = "classifier_match"
        debug["pair_id"] = int(pair.id)
        self._set_last_debug(debug)
        return self._hit_manager.build_payload(
            pair=pair,
            audio_url=self._store.audio_url_for_pair(base_url=ctx.base_url, pair_id=int(pair.id)),
            confidence=conf,
            recall_score=float(hit.score),
            reason=str(parsed.get("reason") or ""),
        )

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
            self._upsert_from_answer_sync(
                question=q,
                answer=a,
                request_id=str(request_id or ""),
                tts_profile=tts_profile,
                app_config=app_config if isinstance(app_config, dict) else {},
            )

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
        pair_id = self._writeback_manager.upsert_from_answer(
            question=str(question or "").strip(),
            answer=str(answer or "").strip(),
            request_id=str(request_id or ""),
            provider=str(tts_profile.provider or ""),
            voice=str(tts_profile.voice or ""),
            speed=self._norm_speed(tts_profile.speed),
            app_config=app_config if isinstance(app_config, dict) else {},
            guess_sample_rate_fn=self._guess_sample_rate,
            embed_fn=self._embed_question,
        )
        if pair_id:
            self._logger.info(
                "[QA_AUDIO] upsert_ok pair_id=%s request_id=%s provider=%s voice=%s speed=%s",
                pair_id,
                request_id,
                str(tts_profile.provider or ""),
                str(tts_profile.voice or ""),
                self._norm_speed(tts_profile.speed),
            )

    @staticmethod
    def _guess_sample_rate(*, resolved_cfg: dict, provider: str) -> int:
        cfg = resolved_cfg if isinstance(resolved_cfg, dict) else {}
        p = str(provider or "").strip().lower()

        if p in ("modelscope", "bailian", "dashscope", "flash"):
            sr = (((cfg.get("tts") or {}).get("bailian") or {}).get("sample_rate"))
            if sr is not None and str(sr).strip() != "":
                return max(8000, int(sr))

        if p == "edge":
            fmt = str((((cfg.get("tts") or {}).get("edge") or {}).get("output_format") or "")).strip().lower()
            m = re.search(r"(\d+)\s*khz", fmt)
            if m:
                return max(8000, int(m.group(1)) * 1000)

        return 16000
