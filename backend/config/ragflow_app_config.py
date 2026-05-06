from __future__ import annotations

import math
import re
from dataclasses import dataclass


_PERCENT_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$")


def _as_dict(v, path: str) -> dict:
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise TypeError(f"{path} must be an object")
    return v


def _as_list(v, path: str) -> list:
    if v is None:
        return []
    if not isinstance(v, list):
        raise TypeError(f"{path} must be a list")
    return v


def _s(v, default: str = "") -> str:
    return str(v or default).strip()


def _i(v, default: int, path: str) -> int:
    if v is None:
        return int(default)
    if isinstance(v, bool):
        raise ValueError(f"{path} must be an integer")
    if isinstance(v, float) and not v.is_integer():
        raise ValueError(f"{path} must be an integer")
    try:
        return int(v)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{path} must be an integer") from exc


def _f(v, default: float, path: str) -> float:
    if v is None:
        return float(default)
    if isinstance(v, bool):
        raise ValueError(f"{path} must be a number")
    try:
        value = float(v)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{path} must be a number") from exc
    if not math.isfinite(value):
        raise ValueError(f"{path} must be a finite number")
    return value


def _edge_percent(v, default: str, path: str) -> str:
    if v is None:
        return default
    if isinstance(v, bool):
        raise ValueError(f"{path} must be a signed percent")
    if isinstance(v, (int, float)):
        n = float(v)
        if not math.isfinite(n):
            raise ValueError(f"{path} must be a finite percent")
        sign = "+" if n >= 0 else ""
        return f"{sign}{n:.0f}%"
    s = str(v).strip()
    if not s or not _PERCENT_RE.fullmatch(s):
        raise ValueError(f"{path} must be a signed percent")
    if s[:1] not in ("+", "-"):
        return f"+{s}"
    return s


def _b(v, default: bool, path: str) -> bool:
    if v is None:
        return bool(default)
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    raise ValueError(f"{path} must be a boolean")


@dataclass(frozen=True)
class AsrDashscopeConfig:
    api_key: str
    model: str
    ws_url: str

    @staticmethod
    def from_any(cfg: object) -> "AsrDashscopeConfig":
        d = _as_dict(cfg, "asr.dashscope")
        return AsrDashscopeConfig(
            api_key=_s(d.get("api_key"), ""),
            model=_s(d.get("model"), "paraformer-realtime-v2") or "paraformer-realtime-v2",
            ws_url=_s(d.get("ws_url") or d.get("dashscope_ws_url"), ""),
        )


@dataclass(frozen=True)
class TtsBailianConfig:
    api_key: str
    voice: str
    model: str
    speech_rate: float

    @staticmethod
    def from_any(cfg: object) -> "TtsBailianConfig":
        d = _as_dict(cfg, "tts.bailian")
        return TtsBailianConfig(
            api_key=_s(d.get("api_key"), ""),
            voice=_s(d.get("voice"), ""),
            model=_s(d.get("model"), ""),
            speech_rate=_f(d.get("speech_rate"), 1.0, "tts.bailian.speech_rate"),
        )


@dataclass(frozen=True)
class TtsEdgeConfig:
    enabled: bool
    voice: str
    output_format: str
    rate: object
    volume: object
    timeout_s: float
    first_audio_timeout_s: float
    queue_max_chunks: int

    @staticmethod
    def from_any(cfg: object) -> "TtsEdgeConfig":
        d = _as_dict(cfg, "tts.edge")
        return TtsEdgeConfig(
            enabled=_b(d.get("enabled"), True, "tts.edge.enabled"),
            voice=_s(d.get("voice"), "zh-CN-XiaoxiaoNeural") or "zh-CN-XiaoxiaoNeural",
            output_format=_s(d.get("output_format"), "riff-16khz-16bit-mono-pcm") or "riff-16khz-16bit-mono-pcm",
            rate=_edge_percent(d.get("rate"), "0%", "tts.edge.rate"),
            volume=_edge_percent(d.get("volume"), "0%", "tts.edge.volume"),
            timeout_s=_f(d.get("timeout_s"), 30.0, "tts.edge.timeout_s"),
            first_audio_timeout_s=_f(d.get("first_audio_timeout_s"), 12.0, "tts.edge.first_audio_timeout_s"),
            queue_max_chunks=max(16, _i(d.get("queue_max_chunks"), 256, "tts.edge.queue_max_chunks")),
        )


@dataclass(frozen=True)
class TourConfig:
    stops: list[str]

    @staticmethod
    def from_any(cfg: object) -> "TourConfig":
        d = _as_dict(cfg, "tour")
        raw = _as_list(d.get("stops"), "tour.stops")
        stops = [_s(x, "") for x in raw]
        stops = [s for s in stops if s]
        return TourConfig(stops=stops)


@dataclass(frozen=True)
class TourTemplateConfig:
    id: str
    name: str
    zone: str
    profile: str
    stops: list[str]

    @staticmethod
    def from_any(cfg: object) -> "TourTemplateConfig | None":
        d = _as_dict(cfg, "tour_templates[]")
        tid = _s(d.get("id") or d.get("name"), "")
        name = _s(d.get("name") or tid, "")
        zone = _s(d.get("zone"), "")
        profile = _s(d.get("profile"), "")
        stops_raw = _as_list(d.get("stops"), "tour_templates[].stops")
        stops = [_s(x, "") for x in stops_raw]
        stops = [s for s in stops if s]
        if not tid or not name or not stops:
            return None
        return TourTemplateConfig(id=tid, name=name, zone=zone, profile=profile, stops=stops)


@dataclass(frozen=True)
class NavHttpConfig:
    base_url: str
    go_to_path: str
    cancel_path: str
    state_path: str
    poll_interval_ms: int

    @staticmethod
    def from_any(cfg: object) -> "NavHttpConfig":
        d = _as_dict(cfg, "nav.http")
        return NavHttpConfig(
            base_url=_s(d.get("base_url"), "").rstrip("/"),
            go_to_path=_s(d.get("go_to_path"), "/go_to") or "/go_to",
            cancel_path=_s(d.get("cancel_path"), "/cancel") or "/cancel",
            state_path=_s(d.get("state_path"), "/state") or "/state",
            poll_interval_ms=max(100, min(_i(d.get("poll_interval_ms"), 400, "nav.http.poll_interval_ms"), 2000)),
        )


@dataclass(frozen=True)
class NavMockConfig:
    arrive_delay_ms: int

    @staticmethod
    def from_any(cfg: object) -> "NavMockConfig":
        d = _as_dict(cfg, "nav.mock")
        return NavMockConfig(arrive_delay_ms=max(0, _i(d.get("arrive_delay_ms"), 1500, "nav.mock.arrive_delay_ms")))


@dataclass(frozen=True)
class NavConfig:
    provider: str
    timeout_s: float
    http: NavHttpConfig
    mock: NavMockConfig

    @staticmethod
    def from_any(cfg: object) -> "NavConfig":
        d = _as_dict(cfg, "nav")
        provider = _s(d.get("provider"), "disabled").lower() or "disabled"
        timeout_s = _f(d.get("timeout_s"), 30.0, "nav.timeout_s")
        timeout_s = max(5.0, min(timeout_s, 600.0))
        return NavConfig(
            provider=provider,
            timeout_s=timeout_s,
            http=NavHttpConfig.from_any(d.get("http")),
            mock=NavMockConfig.from_any(d.get("mock")),
        )


@dataclass(frozen=True)
class RagflowAppConfig:
    asr_dashscope: AsrDashscopeConfig
    tts_bailian: TtsBailianConfig
    tts_edge: TtsEdgeConfig
    tour: TourConfig
    tour_templates: list[TourTemplateConfig]
    nav: NavConfig

    @staticmethod
    def from_any(cfg: object) -> "RagflowAppConfig":
        root = _as_dict(cfg, "ragflow config")
        asr = _as_dict(root.get("asr"), "asr")
        tts = _as_dict(root.get("tts"), "tts")
        tour = _as_dict(root.get("tour"), "tour")
        templates_raw = _as_list(root.get("tour_templates"), "tour_templates")

        templates: list[TourTemplateConfig] = []
        for item in templates_raw:
            t = TourTemplateConfig.from_any(item)
            if t is not None:
                templates.append(t)

        return RagflowAppConfig(
            asr_dashscope=AsrDashscopeConfig.from_any(asr.get("dashscope")),
            tts_bailian=TtsBailianConfig.from_any(tts.get("bailian")),
            tts_edge=TtsEdgeConfig.from_any(tts.get("edge")),
            tour=TourConfig.from_any(tour),
            tour_templates=templates,
            nav=NavConfig.from_any(root.get("nav")),
        )

    def dashscope_api_key(self) -> str:
        return self.asr_dashscope.api_key or self.tts_bailian.api_key
