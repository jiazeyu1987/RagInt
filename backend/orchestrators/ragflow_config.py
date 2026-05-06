from __future__ import annotations

import math
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
        if ragflow_config is None:
            raw = {}
        elif isinstance(ragflow_config, dict):
            raw = ragflow_config
        else:
            raise ValueError("ragflow_config must be an object")
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


def _optional_object(ragflow_config: dict, key: str) -> dict:
    cfg = ragflow_config.get(key, {})
    if not isinstance(cfg, dict):
        raise ValueError(f"{key} must be an object")
    return cfg


def _number_field(cfg: dict, key: str, *, default, cast, label: str):
    if key not in cfg:
        return default
    raw = cfg[key]
    if isinstance(raw, bool):
        raise ValueError(f"{label} must be a number")
    if cast is int and isinstance(raw, float) and not raw.is_integer():
        raise ValueError(f"{label} must be an integer")
    try:
        value = cast(raw)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{label} must be a number") from e
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    if cast is int and str(raw).strip().lower() in ("nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"):
        raise ValueError(f"{label} must be a finite number")
    return value


def _min_value(label: str, value, minimum):
    if value < minimum:
        raise ValueError(f"{label} must be >= {minimum}")
    return value


def _range_value(label: str, value, *, minimum, maximum):
    if value < minimum:
        raise ValueError(f"{label} must be >= {minimum}")
    if value > maximum:
        raise ValueError(f"{label} must be <= {maximum}")
    return value


def _get_kb_version(ragflow_config: dict) -> str:
    kb = ragflow_config.get("kb")
    kb_version = ragflow_config.get("kb_version") or (kb.get("version") if isinstance(kb, dict) else "")
    return str(kb_version or "").strip()


def _parse_qa_cache_cfg(ragflow_config: dict) -> QaCacheCfg:
    cache_cfg = _optional_object(ragflow_config, "qa_cache")
    enabled = bool(cache_cfg.get("enabled", True))
    ttl_s = _number_field(cache_cfg, "ttl_s", default=3600.0, cast=float, label="qa_cache.ttl_s")
    return QaCacheCfg(enabled=enabled, ttl_s=_min_value("qa_cache.ttl_s", ttl_s, 0.0))


def _parse_qa_constraints_cfg(ragflow_config: dict) -> QaConstraintsCfg:
    qa_cfg = _optional_object(ragflow_config, "qa_constraints")
    enabled = bool(qa_cfg.get("enabled", True))
    no_self_intro = bool(qa_cfg.get("no_self_intro", True))
    max_answer_chars = _number_field(
        qa_cfg,
        "max_answer_chars",
        default=150,
        cast=int,
        label="qa_constraints.max_answer_chars",
    )
    return QaConstraintsCfg(
        enabled=enabled,
        no_self_intro=no_self_intro,
        max_answer_chars=_min_value("qa_constraints.max_answer_chars", max_answer_chars, 0),
    )


def _parse_qa_audio_cache_cfg(ragflow_config: dict) -> QaAudioCacheCfg:
    cfg = _optional_object(ragflow_config, "qa_audio_cache")
    enabled = bool(cfg.get("enabled", True))
    recall_top_k = _number_field(cfg, "recall_top_k", default=20, cast=int, label="qa_audio_cache.recall_top_k")
    classifier_threshold = _number_field(
        cfg,
        "classifier_threshold",
        default=0.85,
        cast=float,
        label="qa_audio_cache.classifier_threshold",
    )
    classifier_chat_name = str(cfg.get("classifier_chat_name") or "问题比对").strip() or "问题比对"
    recall_top_k = _range_value("qa_audio_cache.recall_top_k", recall_top_k, minimum=1, maximum=50)
    classifier_threshold = _range_value(
        "qa_audio_cache.classifier_threshold",
        classifier_threshold,
        minimum=0,
        maximum=1,
    )
    return QaAudioCacheCfg(
        enabled=enabled,
        recall_top_k=recall_top_k,
        classifier_threshold=classifier_threshold,
        classifier_chat_name=classifier_chat_name,
    )

