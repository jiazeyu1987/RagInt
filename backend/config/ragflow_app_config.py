from __future__ import annotations

from dataclasses import dataclass


def _as_dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def _as_list(v) -> list:
    return v if isinstance(v, list) else []


def _s(v, default: str = "") -> str:
    return str(v or default).strip()


def _i(v, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def _f(v, default: float) -> float:
    try:
        return float(v)
    except Exception:
        return float(default)


@dataclass(frozen=True)
class AsrDashscopeConfig:
    api_key: str
    model: str
    ws_url: str

    @staticmethod
    def from_any(cfg: object) -> "AsrDashscopeConfig":
        d = _as_dict(cfg)
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
        d = _as_dict(cfg)
        return TtsBailianConfig(
            api_key=_s(d.get("api_key"), ""),
            voice=_s(d.get("voice"), ""),
            model=_s(d.get("model"), ""),
            speech_rate=_f(d.get("speech_rate") or 1.0, 1.0),
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
        d = _as_dict(cfg)
        enabled = d.get("enabled")
        return TtsEdgeConfig(
            enabled=(True if enabled is None else bool(enabled)),
            voice=_s(d.get("voice"), "zh-CN-XiaoxiaoNeural") or "zh-CN-XiaoxiaoNeural",
            output_format=_s(d.get("output_format"), "riff-16khz-16bit-mono-pcm") or "riff-16khz-16bit-mono-pcm",
            rate=d.get("rate", "0%"),
            volume=d.get("volume", "0%"),
            timeout_s=_f(d.get("timeout_s") or 30, 30.0),
            first_audio_timeout_s=_f(d.get("first_audio_timeout_s") or 12, 12.0),
            queue_max_chunks=max(16, _i(d.get("queue_max_chunks") or 256, 256)),
        )


@dataclass(frozen=True)
class TourConfig:
    stops: list[str]

    @staticmethod
    def from_any(cfg: object) -> "TourConfig":
        d = _as_dict(cfg)
        raw = _as_list(d.get("stops"))
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
        d = _as_dict(cfg)
        tid = _s(d.get("id") or d.get("name"), "")
        name = _s(d.get("name") or tid, "")
        zone = _s(d.get("zone"), "")
        profile = _s(d.get("profile"), "")
        stops_raw = _as_list(d.get("stops"))
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
        d = _as_dict(cfg)
        return NavHttpConfig(
            base_url=_s(d.get("base_url"), "").rstrip("/"),
            go_to_path=_s(d.get("go_to_path"), "/go_to") or "/go_to",
            cancel_path=_s(d.get("cancel_path"), "/cancel") or "/cancel",
            state_path=_s(d.get("state_path"), "/state") or "/state",
            poll_interval_ms=max(100, min(_i(d.get("poll_interval_ms") or 400, 400), 2000)),
        )


@dataclass(frozen=True)
class NavMockConfig:
    arrive_delay_ms: int

    @staticmethod
    def from_any(cfg: object) -> "NavMockConfig":
        d = _as_dict(cfg)
        return NavMockConfig(arrive_delay_ms=max(0, _i(d.get("arrive_delay_ms") or 1500, 1500)))


@dataclass(frozen=True)
class NavConfig:
    provider: str
    timeout_s: float
    http: NavHttpConfig
    mock: NavMockConfig

    @staticmethod
    def from_any(cfg: object) -> "NavConfig":
        d = _as_dict(cfg)
        provider = _s(d.get("provider"), "disabled").lower() or "disabled"
        timeout_s = _f(d.get("timeout_s") or 30.0, 30.0)
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
        root = _as_dict(cfg)
        asr = _as_dict(root.get("asr"))
        tts = _as_dict(root.get("tts"))
        tour = _as_dict(root.get("tour"))
        templates_raw = _as_list(root.get("tour_templates"))

        templates: list[TourTemplateConfig] = []
        for item in templates_raw:
            t = TourTemplateConfig.from_any(item)
            if t is not None:
                templates.append(t)

        return RagflowAppConfig(
            asr_dashscope=AsrDashscopeConfig.from_any(_as_dict(asr).get("dashscope")),
            tts_bailian=TtsBailianConfig.from_any(_as_dict(tts).get("bailian")),
            tts_edge=TtsEdgeConfig.from_any(_as_dict(tts).get("edge")),
            tour=TourConfig.from_any(tour),
            tour_templates=templates,
            nav=NavConfig.from_any(root.get("nav")),
        )

    def dashscope_api_key(self) -> str:
        return self.asr_dashscope.api_key or self.tts_bailian.api_key

