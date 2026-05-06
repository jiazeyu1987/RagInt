from __future__ import annotations

import logging
import shutil
import struct
import uuid
from pathlib import Path

import pytest

from backend.services.pad_hall_scene_service import PadHallSceneService
from backend.services.pad_hall_station_service import PadHallStationService
from backend.services.pad_product_image_service import PadProductImageService, _safe_file_part
from backend.services.pad_product_store import PadProductStore


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"pad_image_services_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _store(work_dir: Path) -> PadProductStore:
    return PadProductStore(
        work_dir / "pad_products.db",
        work_dir / "pad_product_audio",
        work_dir / "pad_product_images",
        logger=logging.getLogger("test_pad_image_services_no_fallback"),
    )


def _png_bytes(*, width: int = 1, height: int = 1) -> bytes:
    return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00"


def _product(product_id: str = "product_001") -> dict:
    return {
        "product_id": product_id,
        "sort_order": 1,
        "product_name": "Product A",
        "product_name_en": "Product A EN",
        "intro_text": "Product A intro",
        "registration_name": "Product A reg",
        "registration_number": "REG-1",
        "effective_date": "2026-01-01",
        "company": "YingTai",
        "hall_id": "hall_01",
    }


def test_safe_file_part_fails_fast_instead_of_defaulting_empty_ids():
    with pytest.raises(ValueError, match="product_id_required"):
        _safe_file_part("", field_name="product_id")

    with pytest.raises(ValueError, match="station_key_invalid"):
        _safe_file_part("../bad", field_name="station_key")


def test_product_image_upload_rejects_unrecognized_content_despite_claimed_image_type(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(hall_id="hall_01", products=[_product()])
    service = PadProductImageService(store=store)

    with pytest.raises(ValueError, match="image_format_unsupported"):
        service.save_uploaded_image(
            product_id="product_001",
            filename="fake.png",
            image_bytes=b"not-an-image",
            mimetype="image/png",
        )

    assert store.list_product_image_assets("product_001") == []
    assert not any(store.image_root().rglob("*fake*"))


def test_product_image_upload_uses_detected_type_extension_not_untrusted_filename(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(hall_id="hall_01", products=[_product()])
    service = PadProductImageService(store=store)

    asset = service.save_uploaded_image(
        product_id="product_001",
        filename="uploaded.txt",
        image_bytes=_png_bytes(),
        mimetype="image/png",
    )

    assert asset["mimetype"] == "image/png"
    assert asset["rel_path"].endswith(".png")
    assert not asset["rel_path"].endswith(".txt")


def test_scene_upload_uses_detected_type_extension_not_untrusted_filename(work_dir: Path):
    store = _store(work_dir)
    service = PadHallSceneService(store=store)

    scene = service.create_scene(
        hall_id="hall_01",
        name="Scene A",
        sort_order=1,
        filename="background.exe",
        image_bytes=_png_bytes(width=3, height=2),
        mimetype="image/png",
    )

    assert scene["background_mimetype"] == "image/png"
    assert scene["background_rel_path"].endswith(".png")
    assert not scene["background_rel_path"].endswith(".exe")


def test_station_upload_uses_detected_type_extension_not_untrusted_filename(work_dir: Path):
    store = _store(work_dir)
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=0,
        stop_name="Station A",
    )
    service = PadHallStationService(store=store)

    station = service.upload_station_background(
        hall_id="hall_01",
        station_key="station_a",
        filename="background.exe",
        image_bytes=_png_bytes(width=3, height=2),
        mimetype="image/png",
    )

    assert station["background_mimetype"] == "image/png"
    assert station["background_rel_path"].endswith(".png")
    assert not station["background_rel_path"].endswith(".exe")


def test_station_upload_fails_fast_when_station_config_is_missing(work_dir: Path):
    store = _store(work_dir)
    service = PadHallStationService(store=store)

    with pytest.raises(ValueError, match="station_config_not_found"):
        service.upload_station_background(
            hall_id="hall_01",
            station_key="station_a",
            filename="background.png",
            image_bytes=_png_bytes(width=3, height=2),
            mimetype="image/png",
        )
