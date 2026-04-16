from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest

from backend.services.pad_product_audio_service import PadProductAudioService
from backend.services.pad_product_store import PadProductStore
from scripts import generate_pad_default_tts as script


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None


class _TtsSvc:
    def __init__(self, fail_on_text: str = ""):
        self.calls: list[str] = []
        self.fail_on_text = str(fail_on_text or "")

    def stream(self, **kwargs):  # noqa: ANN003
        text = str(kwargs.get("text") or "")
        self.calls.append(text)
        if self.fail_on_text and text == self.fail_on_text:
            raise RuntimeError("tts_stream_failed")
        yield b"\x00\x00" * 160


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {"tts": {"provider": "edge", "edge": {"output_format": "riff-16khz-16bit-mono-pcm"}}}


class _Deps:
    def __init__(self, work_dir: Path, *, fail_on_text: str = ""):
        self.logger = _Logger()
        self.pad_product_store = PadProductStore(
            work_dir / "pad_products.db",
            work_dir / "pad_product_audio",
            work_dir / "pad_product_images",
            logger=self.logger,
        )
        self.tts_service = _TtsSvc(fail_on_text=fail_on_text)
        self.pad_product_audio_service = PadProductAudioService(
            store=self.pad_product_store,
            tts_service=self.tts_service,
            logger=self.logger,
        )
        self.ragflow_service = _RagflowService()


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"pad_default_tts_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _product(*, product_id: str, sort_order: int, name: str, intro_text: str, hall_id: str = "hall_01") -> dict:
    return {
        "product_id": product_id,
        "sort_order": sort_order,
        "product_name": name,
        "product_name_en": f"{name} EN",
        "intro_text": intro_text,
        "registration_name": f"{name} reg",
        "registration_number": f"REG-{product_id}",
        "effective_date": "2026-01-01",
        "company": "YingTai",
        "hall_id": hall_id,
    }


def _active_asset_count(store: PadProductStore) -> int:
    conn = store._connect()  # noqa: SLF001 - unit test inspects persisted rows.
    try:
        row = conn.execute("SELECT COUNT(*) AS count FROM product_audio_assets WHERE is_active=1").fetchone()
        return int(row["count"] or 0)
    finally:
        conn.close()


def _all_asset_count(store: PadProductStore) -> int:
    conn = store._connect()  # noqa: SLF001 - unit test inspects persisted rows.
    try:
        row = conn.execute("SELECT COUNT(*) AS count FROM product_audio_assets").fetchone()
        return int(row["count"] or 0)
    finally:
        conn.close()


def test_main_dry_run_reports_counts_without_writing_assets(work_dir: Path, monkeypatch, capsys: pytest.CaptureFixture[str]):
    deps = _Deps(work_dir)
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_001", sort_order=1, name="Alpha", intro_text="Alpha intro"),
            _product(product_id="product_002", sort_order=2, name="Beta", intro_text="Beta intro"),
        ],
    )
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_02",
        products=[_product(product_id="product_003", sort_order=1, name="Gamma", intro_text="Gamma intro", hall_id="hall_02")],
    )
    existing_asset = deps.pad_product_audio_service.save_uploaded_audio(
        product_id="product_002",
        filename="beta.wav",
        audio_bytes=b"RIFF\x00\x00\x00\x00WAVE",
        mimetype="audio/wav",
        text_snapshot="Beta recorded",
        activate=True,
    )

    monkeypatch.setattr(script, "build_runtime_deps", lambda: deps)
    exit_code = script.main(["--dry-run", "--hall-id", "hall_02", "--hall-id", "hall_01"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "phase: dry_run" in captured.out
    assert "halls: hall_01, hall_02" in captured.out
    assert "fallback_skip_missing_intro_text: 0" in captured.out
    assert "target_generation_count: 2" in captured.out
    assert "generated_count: 0" in captured.out
    assert "offline_sync_pending_audio_count: 2" in captured.out
    assert deps.tts_service.calls == []
    assert _all_asset_count(deps.pad_product_store) == 1
    current_existing = deps.pad_product_store.get_current_audio_asset("product_002")
    assert current_existing is not None
    assert current_existing["audio_asset_id"] == existing_asset["audio_asset_id"]


def test_run_batch_only_generates_missing_active_audio_and_is_idempotent(work_dir: Path):
    deps = _Deps(work_dir)
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_001", sort_order=1, name="Alpha", intro_text="Alpha intro"),
            _product(product_id="product_002", sort_order=2, name="Beta", intro_text="Beta intro"),
        ],
    )
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_02",
        products=[_product(product_id="product_003", sort_order=1, name="Gamma", intro_text="Gamma intro", hall_id="hall_02")],
    )
    existing_asset = deps.pad_product_audio_service.save_uploaded_audio(
        product_id="product_002",
        filename="beta.wav",
        audio_bytes=b"RIFF\x00\x00\x00\x00WAVE",
        mimetype="audio/wav",
        text_snapshot="Beta recorded",
        activate=True,
    )

    hall_ids = script.select_hall_ids(["hall_01", "hall_02"])
    first = script.run_batch(deps=deps, hall_ids=hall_ids, dry_run=False)
    assert first["ok"] is True
    assert first["phase"] == "completed"
    assert first["skip_count"] == 1
    assert first["target_count"] == 2
    assert first["generated_count"] == 2
    assert first["offline_sync_pending_audio_count"] == 2
    assert deps.tts_service.calls == ["Alpha intro", "Gamma intro"]

    current_alpha = deps.pad_product_store.get_current_audio_asset("product_001")
    current_beta = deps.pad_product_store.get_current_audio_asset("product_002")
    current_gamma = deps.pad_product_store.get_current_audio_asset("product_003")
    assert current_alpha is not None
    assert current_alpha["source_type"] == "tts"
    assert current_alpha["text_snapshot"] == "Alpha intro"
    assert current_gamma is not None
    assert current_gamma["source_type"] == "tts"
    assert current_gamma["text_snapshot"] == "Gamma intro"
    assert current_beta is not None
    assert current_beta["audio_asset_id"] == existing_asset["audio_asset_id"]
    assert current_beta["source_type"] == "recorded"

    asset_count_after_first = _all_asset_count(deps.pad_product_store)
    assert asset_count_after_first == 3
    assert _active_asset_count(deps.pad_product_store) == 3

    second = script.run_batch(deps=deps, hall_ids=hall_ids, dry_run=False)
    assert second["ok"] is True
    assert second["phase"] == "noop"
    assert second["skip_count"] == 3
    assert second["target_count"] == 0
    assert second["generated_count"] == 0
    assert _all_asset_count(deps.pad_product_store) == asset_count_after_first


def test_run_batch_skips_missing_intro_text_by_explicit_fallback_request(work_dir: Path):
    deps = _Deps(work_dir)
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_001", sort_order=1, name="Alpha", intro_text=""),
            _product(product_id="product_002", sort_order=2, name="Beta", intro_text="Beta intro"),
        ],
    )

    result = script.run_batch(deps=deps, hall_ids=script.select_hall_ids(["hall_01"]), dry_run=False)

    assert result["ok"] is True
    assert result["phase"] == "completed"
    assert result["generated_count"] == 1
    assert result["failure_count"] == 0
    assert result["skip_missing_intro_count"] == 1
    assert result["skipped"][0]["code"] == "fallback_skip_missing_intro_text"
    assert result["skipped"][0]["product_id"] == "product_001"
    assert deps.tts_service.calls == ["Beta intro"]
    assert _all_asset_count(deps.pad_product_store) == 1
    assert deps.pad_product_store.get_current_audio_asset("product_001") is None
    current_beta = deps.pad_product_store.get_current_audio_asset("product_002")
    assert current_beta is not None
    assert current_beta["text_snapshot"] == "Beta intro"


def test_run_batch_uses_fixed_hall_order_and_product_sort_order(work_dir: Path):
    deps = _Deps(work_dir)
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_003", sort_order=2, name="Alpha 2", intro_text="Alpha 2 intro"),
            _product(product_id="product_001", sort_order=1, name="Alpha 1", intro_text="Alpha 1 intro"),
        ],
    )
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_02",
        products=[
            _product(product_id="product_020", sort_order=2, name="Beta 2", intro_text="Beta 2 intro", hall_id="hall_02"),
            _product(product_id="product_010", sort_order=1, name="Beta 1", intro_text="Beta 1 intro", hall_id="hall_02"),
        ],
    )

    hall_ids = script.select_hall_ids(["hall_02", "hall_01"])
    result = script.run_batch(deps=deps, hall_ids=hall_ids, dry_run=False)

    assert result["ok"] is True
    assert deps.tts_service.calls == ["Alpha 1 intro", "Alpha 2 intro", "Beta 1 intro", "Beta 2 intro"]
