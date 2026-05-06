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
    def __init__(self):
        self.calls: list[dict] = []

    def stream(self, **kwargs):  # noqa: ANN003
        self.calls.append(dict(kwargs))
        yield b"\x00\x00" * 160


class _FailingDict(dict):
    def get(self, key, default=None):  # type: ignore[override]
        if key == "tts":
            raise RuntimeError("config_store_unavailable")
        return super().get(key, default)


def _service(tmp_path: Path, *, tts_service: _TtsSvc | None = None) -> tuple[PadProductAudioService, _Store]:
    store = _Store(tmp_path / "audio")
    return PadProductAudioService(store=store, tts_service=tts_service or _TtsSvc()), store


def _wav_payload() -> bytes:
    return b"RIFF\x24\x00\x00\x00WAVEfmt " + (b"\x00" * 24)


def test_upload_rejects_unknown_audio_format_without_bin_asset(tmp_path: Path):
    # Given a product audio upload has bytes that do not identify a supported audio container
    service, store = _service(tmp_path)

    # When the upload has no trusted filename extension or mimetype
    # Then storage fails fast instead of creating a default .bin asset
    with pytest.raises(ValueError, match="audio_format_unsupported"):
        service.save_uploaded_audio(
            product_id="product_001",
            filename="clip",
            audio_bytes=b"not-an-audio-container",
            mimetype="",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


def test_upload_rejects_missing_product_id_without_product_filename_fallback(tmp_path: Path):
    # Given product audio storage requires a concrete product id
    service, store = _service(tmp_path)

    # When the product id is blank
    # Then storage fails fast instead of naming the file with a generic product token
    with pytest.raises(ValueError, match="product_id_required"):
        service.save_uploaded_audio(
            product_id=" ",
            filename="clip.wav",
            audio_bytes=_wav_payload(),
            mimetype="audio/wav",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


def test_regenerate_rejects_missing_product_id_without_product_filename_fallback(tmp_path: Path):
    # Given regenerated product audio must be attached to a concrete product id
    service, store = _service(tmp_path)

    # When the product id cleans down to an empty filename part
    # Then storage fails fast instead of naming the file with a generic product token
    with pytest.raises(ValueError, match="product_id_invalid"):
        service.regenerate_product_audio(
            product_id="...",
            text="Alpha intro",
            resolved_cfg={"tts": {"provider": "edge", "edge": {"output_format": "riff-16khz-16bit-mono-pcm"}}},
            provider="edge",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


def test_regenerate_requires_explicit_provider_without_modelscope_fallback(tmp_path: Path):
    # Given product audio regeneration depends on the selected TTS provider
    tts_service = _TtsSvc()
    service, store = _service(tmp_path, tts_service=tts_service)

    # When no provider is supplied
    # Then the request is rejected before streaming instead of silently using modelscope
    with pytest.raises(ValueError, match="tts_provider_required"):
        service.regenerate_product_audio(
            product_id="product_001",
            text="Alpha intro",
            resolved_cfg={"tts": {"provider": "edge"}},
            provider=" ",
        )

    assert tts_service.calls == []
    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


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


def test_regenerate_rejects_missing_bailian_sample_rate_without_defaulting_to_16khz(tmp_path: Path):
    # Given a provider whose PCM sample rate must come from configuration
    service, store = _service(tmp_path)

    # When the sample-rate field is missing
    # Then regeneration fails instead of silently assuming 16kHz
    with pytest.raises(ValueError, match="tts.bailian.sample_rate_missing"):
        service.regenerate_product_audio(
            product_id="product_001",
            text="Alpha intro",
            resolved_cfg={"tts": {"bailian": {}}},
            provider="bailian",
        )

    assert store.created_assets == []
    assert not (tmp_path / "audio").exists()


def test_regenerate_rejects_edge_output_format_without_sample_rate(tmp_path: Path):
    # Given Edge output format is the source of generated PCM sample rate
    service, store = _service(tmp_path)

    # When the configured format does not expose a khz token
    # Then regeneration fails instead of silently assuming 16kHz
    with pytest.raises(ValueError, match="tts.edge.output_format_sample_rate_missing"):
        service.regenerate_product_audio(
            product_id="product_001",
            text="Alpha intro",
            resolved_cfg={"tts": {"edge": {"output_format": "riff-pcm"}}},
            provider="edge",
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
