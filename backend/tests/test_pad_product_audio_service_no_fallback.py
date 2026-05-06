from __future__ import annotations

from pathlib import Path

import pytest

from backend.services.pad_product_audio_service import PadProductAudioService


class _Store:
    def __init__(self, root: Path):
        self.root = root
        self.created_assets: list[dict] = []

    def build_audio_rel_path(self, *, product_id: str, filename: str) -> str:
        return f"{product_id}/{filename}"

    def resolve_audio_rel_path(self, rel_path: str) -> Path:
        return self.root / rel_path

    def create_audio_asset(self, **kwargs):  # noqa: ANN003
        self.created_assets.append(dict(kwargs))
        return {"audio_asset_id": "audio_001", **kwargs}


class _TtsSvc:
    def stream(self, **kwargs):  # noqa: ANN003
        yield b"\x00\x00" * 160


class _FailingDict(dict):
    def get(self, key, default=None):  # type: ignore[override]
        if key == "tts":
            raise RuntimeError("config_store_unavailable")
        return super().get(key, default)


def _service(tmp_path: Path) -> tuple[PadProductAudioService, _Store]:
    store = _Store(tmp_path / "audio")
    return PadProductAudioService(store=store, tts_service=_TtsSvc()), store


def test_regenerate_rejects_invalid_bailian_sample_rate_without_defaulting_to_16khz(tmp_path: Path):
    # Given product audio regeneration is requested with an invalid provider sample-rate config
    service, store = _service(tmp_path)

    # When regeneration resolves the audio format
    # Then the configuration error is exposed instead of silently generating default-rate audio
    with pytest.raises(ValueError, match="tts.bailian.sample_rate_invalid"):
        service.regenerate_product_audio(
            product_id="product_001",
            text="Alpha intro",
            resolved_cfg={"tts": {"bailian": {"sample_rate": "not-a-number"}}},
            provider="bailian",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


def test_regenerate_propagates_edge_config_lookup_failure_without_defaulting_to_16khz(tmp_path: Path):
    # Given product audio regeneration depends on a config object that fails during lookup
    service, store = _service(tmp_path)

    # When regeneration resolves the audio format
    # Then the dependency failure is propagated instead of being swallowed as default-rate audio
    with pytest.raises(RuntimeError, match="config_store_unavailable"):
        service.regenerate_product_audio(
            product_id="product_001",
            text="Alpha intro",
            resolved_cfg=_FailingDict(),
            provider="edge",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()
