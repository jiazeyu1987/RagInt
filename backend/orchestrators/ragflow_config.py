from __future__ import annotations

from dataclasses import dataclass

from backend.orchestrators.text_cleaning import TextCleaningCfg, _parse_text_cleaning_cfg


@dataclass(frozen=True)
class QaCacheCfg:
    enabled: bool
    ttl_s: float


@dataclass(frozen=True)
class QaConstraintsCfg:
    enabled: bool
    no_self_intro: bool
    max_answer_chars: int


@dataclass(frozen=True)
class QaAudioCacheCfg:
    enabled: bool
    recall_top_k: int
    classifier_threshold: float
    classifier_chat_name: str


@dataclass(frozen=True)
class RagflowRuntimeConfig:
    """
    Typed view over ragflow_config JSON.

    Keep `raw` for downstream components that still expect the original dict shape.
    """

    raw: dict
    kb_version: str
    qa_cache: QaCacheCfg
    qa_constraints: QaConstraintsCfg
    qa_audio_cache: QaAudioCacheCfg
    text_cleaning: TextCleaningCfg

    @staticmethod
    def from_any(ragflow_config: dict | None) -> RagflowRuntimeConfig:
        raw = ragflow_config if isinstance(ragflow_config, dict) else {}
        kb_version = _get_kb_version(raw)
        qa_cache = _parse_qa_cache_cfg(raw)
        qa_constraints = _parse_qa_constraints_cfg(raw)
        qa_audio_cache = _parse_qa_audio_cache_cfg(raw)
        text_cleaning = _parse_text_cleaning_cfg(raw)
        return RagflowRuntimeConfig(
            raw=raw,
            kb_version=kb_version,
            qa_cache=qa_cache,
            qa_constraints=qa_constraints,
            qa_audio_cache=qa_audio_cache,
            text_cleaning=text_cleaning,
        )


def _get_kb_version(ragflow_config: dict) -> str:
    try:
        kb = ragflow_config.get("kb")
        kb_version = ragflow_config.get("kb_version") or (kb.get("version") if isinstance(kb, dict) else "")
        return str(kb_version or "").strip()
    except Exception:
        return ""


def _parse_qa_cache_cfg(ragflow_config: dict) -> QaCacheCfg:
    cache_cfg = ragflow_config.get("qa_cache", {}) if isinstance(ragflow_config, dict) else {}
    if not isinstance(cache_cfg, dict):
        cache_cfg = {}
    enabled = bool(cache_cfg.get("enabled", True))
    try:
        ttl_s = float(cache_cfg.get("ttl_s", 3600.0))
    except Exception:
        ttl_s = 3600.0
    return QaCacheCfg(enabled=enabled, ttl_s=max(0.0, ttl_s))


def _parse_qa_constraints_cfg(ragflow_config: dict) -> QaConstraintsCfg:
    qa_cfg = ragflow_config.get("qa_constraints", {}) if isinstance(ragflow_config, dict) else {}
    if not isinstance(qa_cfg, dict):
        qa_cfg = {}
    enabled = bool(qa_cfg.get("enabled", True))
    no_self_intro = bool(qa_cfg.get("no_self_intro", True))
    try:
        max_answer_chars = int(qa_cfg.get("max_answer_chars") or 150)
    except Exception:
        max_answer_chars = 150
    return QaConstraintsCfg(enabled=enabled, no_self_intro=no_self_intro, max_answer_chars=max(0, max_answer_chars))


def _parse_qa_audio_cache_cfg(ragflow_config: dict) -> QaAudioCacheCfg:
    cfg = ragflow_config.get("qa_audio_cache", {}) if isinstance(ragflow_config, dict) else {}
    if not isinstance(cfg, dict):
        cfg = {}
    enabled = bool(cfg.get("enabled", True))
    try:
        recall_top_k = int(cfg.get("recall_top_k") or 20)
    except Exception:
        recall_top_k = 20
    try:
        classifier_threshold = float(cfg.get("classifier_threshold") or 0.85)
    except Exception:
        classifier_threshold = 0.85
    classifier_chat_name = str(cfg.get("classifier_chat_name") or "__qa_audio_classifier__").strip() or "__qa_audio_classifier__"
    recall_top_k = max(1, min(recall_top_k, 50))
    classifier_threshold = max(0.0, min(classifier_threshold, 1.0))
    return QaAudioCacheCfg(
        enabled=enabled,
        recall_top_k=recall_top_k,
        classifier_threshold=classifier_threshold,
        classifier_chat_name=classifier_chat_name,
    )

