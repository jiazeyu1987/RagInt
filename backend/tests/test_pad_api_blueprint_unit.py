from __future__ import annotations

import base64
from io import BytesIO
import shutil
import uuid
from pathlib import Path

import pytest
from flask import Flask

from backend.api.pad import create_blueprint
from backend.services.pad_hall_scene_service import PadHallSceneService
from backend.services.pad_hall_station_service import PadHallStationService
from backend.services.pad_product_audio_service import PadProductAudioService
from backend.services.pad_product_image_service import PadProductImageService
from backend.services.pad_product_store import PadProductStore
from scripts import generate_pad_default_tts as default_tts_script


MOCK_IMAGE_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+b3X8AAAAASUVORK5CYII="
)


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        return None


class _TtsSvc:
    def stream(self, **kwargs):  # noqa: ANN003
        del kwargs
        yield b"\x00\x00" * 160


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {"tts": {"provider": "edge", "edge": {"output_format": "riff-16khz-16bit-mono-pcm"}}}


class _Deps:
    def __init__(self, work_dir: Path):
        self.logger = _Logger()
        self.pad_product_store = PadProductStore(
            work_dir / "pad_products.db",
            work_dir / "pad_product_audio",
            work_dir / "pad_product_images",
            logger=self.logger,
        )
        self.tts_service = _TtsSvc()
        self.pad_product_audio_service = PadProductAudioService(
            store=self.pad_product_store,
            tts_service=self.tts_service,
            logger=self.logger,
        )
        self.pad_product_image_service = PadProductImageService(
            store=self.pad_product_store,
            logger=self.logger,
        )
        self.pad_hall_scene_service = PadHallSceneService(
            store=self.pad_product_store,
            logger=self.logger,
        )
        self.pad_hall_station_service = PadHallStationService(
            store=self.pad_product_store,
            logger=self.logger,
        )
        self.ragflow_service = _RagflowService()


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"pad_api_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _build_app(work_dir: Path) -> tuple[Flask, _Deps]:
    deps = _Deps(work_dir)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app, deps


def _seed_products_and_bindings(deps: _Deps) -> None:
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            {
                "product_id": "product_001",
                "sort_order": 1,
                "product_name": "Alpha",
                "product_name_en": "Alpha EN",
                "intro_text": "Alpha intro",
                "registration_name": "Alpha reg",
                "registration_number": "REG-1",
                "effective_date": "2026-01-01",
                "company": "YingTai",
            }
        ],
    )
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_02",
        products=[
            {
                "product_id": "product_002",
                "sort_order": 1,
                "product_name": "Beta",
                "product_name_en": "Beta EN",
                "intro_text": "Beta intro",
                "registration_name": "Beta reg",
                "registration_number": "REG-2",
                "effective_date": "2026-01-02",
                "company": "YingTai",
            }
        ],
    )
    deps.pad_product_store.upsert_hall_binding(client_id="pad-a", hall_id="hall_01", hall_name="Hall One")
    deps.pad_product_store.upsert_hall_binding(client_id="pad-b", hall_id="hall_02", hall_name="Hall Two")
    deps.pad_product_audio_service.save_uploaded_audio(
        product_id="product_001",
        filename="alpha.wav",
        audio_bytes=b"RIFF\x00\x00\x00\x00WAVE",
        mimetype="audio/wav",
        text_snapshot="Alpha recorded script",
        activate=True,
    )
    deps.pad_product_audio_service.save_uploaded_audio(
        product_id="product_002",
        filename="beta.wav",
        audio_bytes=b"RIFF\x00\x00\x00\x00WAVE",
        mimetype="audio/wav",
        text_snapshot="Beta recorded script",
        activate=True,
    )
    deps.pad_product_image_service.save_uploaded_image(
        product_id="product_001",
        filename="alpha.png",
        image_bytes=MOCK_IMAGE_BYTES,
        mimetype="image/png",
    )


def _seed_scene(deps: _Deps, *, hall_id: str = "hall_01", name: str = "Scene One") -> dict:
    return deps.pad_hall_scene_service.create_scene(
        hall_id=hall_id,
        name=name,
        sort_order=1,
        filename="scene.png",
        image_bytes=MOCK_IMAGE_BYTES,
        mimetype="image/png",
    )


def _seed_station_assets(deps: _Deps, *, hall_id: str = "hall_01", station_key: str = "station_a") -> dict:
    deps.pad_product_store.upsert_station_config(
        hall_id=hall_id,
        station_key=station_key,
        label="入口站点",
        recording_id="recording_001",
        stop_index=1,
        stop_name="入口介绍",
    )
    deps.pad_product_store.update_station_visual_assets(
        hall_id=hall_id,
        station_key=station_key,
        background_rel_path=deps.pad_product_store.build_station_asset_rel_path(
            hall_id=hall_id,
            station_key=station_key,
            filename="background.png",
        ),
        background_mimetype="image/png",
        base_width=1,
        base_height=1,
    )
    background_path = deps.pad_product_store.resolve_image_rel_path(
        deps.pad_product_store.get_station_config(hall_id=hall_id, station_key=station_key)["background_rel_path"]
    )
    background_path.parent.mkdir(parents=True, exist_ok=True)
    background_path.write_bytes(MOCK_IMAGE_BYTES)
    deps.pad_hall_station_service.upload_station_wireframe(
        hall_id=hall_id,
        station_key=station_key,
        filename="wireframe.png",
        image_bytes=MOCK_IMAGE_BYTES,
        mimetype="image/png",
    )
    return deps.pad_product_store.create_station_hotspot(
        hall_id=hall_id,
        station_key=station_key,
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.3,
        height_pct=0.25,
    )


def test_bootstrap_products_and_manifest_are_scoped_by_client_id(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    bootstrap = client.get("/api/pad/bootstrap", headers={"X-Client-ID": "pad-a"})
    assert bootstrap.status_code == 200
    bootstrap_body = bootstrap.get_json()
    assert bootstrap_body["hall"]["hall_id"] == "hall_01"
    assert bootstrap_body["hall"]["hall_name"] == "Hall One"
    assert bootstrap_body["display"]["slot_station_ids"] == ["station_a", "station_b"]
    assert bootstrap_body["offline"]["product_count"] == 1

    display = client.get("/api/pad/display/current", headers={"X-Client-ID": "pad-a"})
    assert display.status_code == 200
    display_body = display.get_json()
    assert display_body["display"]["display_id"] == "pad-a"
    assert len(display_body["station_catalog"]) == 2

    products = client.get("/api/pad/halls/current/products", headers={"X-Client-ID": "pad-a"})
    assert products.status_code == 200
    products_body = products.get_json()
    assert len(products_body["items"]) == 1
    assert products_body["items"][0]["product_id"] == "product_001"
    assert products_body["items"][0]["current_audio"]["audio_asset_id"]
    assert products_body["items"][0]["current_audio"]["text_snapshot"] == "Alpha recorded script"
    assert products_body["items"][0]["has_images"] is True
    assert products_body["items"][0]["primary_image"]["image_asset_id"]
    assert products_body["items"][0]["images"][0]["image_url"].startswith("/api/pad/products/product_001/images/")

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    assert manifest.status_code == 200
    manifest_body = manifest.get_json()
    assert manifest_body["hall"]["hall_id"] == "hall_01"
    assert len(manifest_body["items"]) == 1
    assert manifest_body["items"][0]["product_id"] == "product_001"
    assert manifest_body["items"][0]["audio"]["audio_asset_id"]
    assert manifest_body["items"][0]["audio"]["text_snapshot"] == "Alpha recorded script"
    assert manifest_body["items"][0]["primary_image"]["image_asset_id"]
    assert manifest_body["items"][0]["images"][0]["image_url"].startswith("/api/pad/offline/images/")

    missing_client = client.get("/api/pad/bootstrap")
    assert missing_client.status_code == 400
    assert missing_client.get_json()["error"] == "client_id_required"

    unknown_client = client.get("/api/pad/bootstrap", headers={"X-Client-ID": "missing"})
    assert unknown_client.status_code == 404
    assert unknown_client.get_json()["error"] == "display_binding_not_found"


def test_current_audio_and_offline_audio_require_current_hall_scope(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    ok = client.get("/api/pad/products/product_001/audio/current", headers={"X-Client-ID": "pad-a"})
    assert ok.status_code == 200
    assert "audio/wav" in str(ok.headers.get("content-type", "")).lower()

    wrong_hall = client.get("/api/pad/products/product_002/audio/current", headers={"X-Client-ID": "pad-a"})
    assert wrong_hall.status_code == 404
    assert wrong_hall.get_json()["error"] == "product_not_found"

    current_asset = deps.pad_product_store.get_current_audio_asset("product_001")
    assert current_asset is not None
    offline_ok = client.get(
        f"/api/pad/offline/audio/{current_asset['audio_asset_id']}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert offline_ok.status_code == 200
    assert "audio/wav" in str(offline_ok.headers.get("content-type", "")).lower()

    offline_wrong_hall = client.get(
        f"/api/pad/offline/audio/{current_asset['audio_asset_id']}",
        headers={"X-Client-ID": "pad-b"},
    )
    assert offline_wrong_hall.status_code == 404
    assert offline_wrong_hall.get_json()["error"] == "audio_not_found"

    image_asset = deps.pad_product_store.list_product_image_assets("product_001")[0]
    image_ok = client.get(
        f"/api/pad/products/product_001/images/{image_asset['image_asset_id']}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert image_ok.status_code == 200
    assert "image/png" in str(image_ok.headers.get("content-type", "")).lower()

    image_wrong_hall = client.get(
        f"/api/pad/products/product_001/images/{image_asset['image_asset_id']}",
        headers={"X-Client-ID": "pad-b"},
    )
    assert image_wrong_hall.status_code == 404
    assert image_wrong_hall.get_json()["error"] == "product_not_found"

    offline_image_ok = client.get(
        f"/api/pad/offline/images/{image_asset['image_asset_id']}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert offline_image_ok.status_code == 200
    assert "image/png" in str(offline_image_ok.headers.get("content-type", "")).lower()

    offline_image_wrong_hall = client.get(
        f"/api/pad/offline/images/{image_asset['image_asset_id']}",
        headers={"X-Client-ID": "pad-b"},
    )
    assert offline_image_wrong_hall.status_code == 404
    assert offline_image_wrong_hall.get_json()["error"] == "image_not_found"


def test_upload_and_regenerate_switch_current_active_audio(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    upload = client.post(
        "/api/pad/products/product_001/audio/upload",
        data={
            "activate": "true",
            "file": (BytesIO(b"RIFF\x00\x00\x00\x00WAVE"), "manual.wav"),
        },
        content_type="multipart/form-data",
    )
    assert upload.status_code == 200
    upload_body = upload.get_json()
    first_audio_id = upload_body["audio"]["audio_asset_id"]
    assert upload_body["audio"]["source_type"] == "recorded"
    assert upload_body["audio"]["text_snapshot"] == ""

    regenerate = client.post(
        "/api/pad/products/product_001/audio/regenerate",
        json={"text": "Custom regenerated script"},
    )
    assert regenerate.status_code == 200
    regenerate_body = regenerate.get_json()
    second_audio_id = regenerate_body["audio"]["audio_asset_id"]
    assert regenerate_body["audio"]["source_type"] == "tts"
    assert regenerate_body["audio"]["text_snapshot"] == "Custom regenerated script"
    assert second_audio_id != first_audio_id

    current_asset = deps.pad_product_store.get_current_audio_asset("product_001")
    assert current_asset is not None
    assert current_asset["audio_asset_id"] == second_audio_id
    assert current_asset["text_snapshot"] == "Custom regenerated script"

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    manifest_body = manifest.get_json()
    assert manifest_body["items"][0]["audio"]["audio_asset_id"] == second_audio_id
    assert manifest_body["items"][0]["audio"]["text_snapshot"] == "Custom regenerated script"


def test_upload_can_bind_text_snapshot_and_blank_regenerate_text_is_rejected(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    upload = client.post(
        "/api/pad/products/product_001/audio/upload",
        data={
            "activate": "true",
            "text_snapshot": "Manual narration script",
            "file": (BytesIO(b"RIFF\x00\x00\x00\x00WAVE"), "manual.wav"),
        },
        content_type="multipart/form-data",
    )
    assert upload.status_code == 200
    upload_body = upload.get_json()
    assert upload_body["audio"]["text_snapshot"] == "Manual narration script"

    products = client.get("/api/pad/halls/current/products", headers={"X-Client-ID": "pad-a"})
    products_body = products.get_json()
    assert products_body["items"][0]["current_audio"]["text_snapshot"] == "Manual narration script"

    regenerate = client.post("/api/pad/products/product_001/audio/regenerate", json={"text": "   "})
    assert regenerate.status_code == 400
    assert regenerate.get_json()["error"] == "audio_text_required"


def test_upload_product_image_is_visible_via_products_and_manifest(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    upload = client.post(
        "/api/pad/products/product_001/images/upload",
        data={
            "file": (BytesIO(MOCK_IMAGE_BYTES), "product.png"),
        },
        content_type="multipart/form-data",
    )
    assert upload.status_code == 200
    upload_body = upload.get_json()
    image_asset_id = upload_body["image"]["image_asset_id"]
    assert upload_body["image"]["mimetype"] == "image/png"

    products = client.get("/api/pad/halls/current/products", headers={"X-Client-ID": "pad-a"})
    products_body = products.get_json()
    image_ids = [item["image_asset_id"] for item in products_body["items"][0]["images"]]
    assert image_asset_id in image_ids
    assert products_body["items"][0]["primary_image"]["image_asset_id"] == image_asset_id

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    manifest_body = manifest.get_json()
    assert manifest_body["items"][0]["primary_image"]["image_asset_id"] == image_asset_id

    bad_upload = client.post(
        "/api/pad/products/product_001/images/upload",
        data={
            "file": (BytesIO(b"not-an-image"), "bad.txt"),
        },
        content_type="multipart/form-data",
    )
    assert bad_upload.status_code == 400
    assert bad_upload.get_json()["error"] == "image_format_unsupported"


def test_scene_and_hotspot_endpoints_roundtrip_with_offline_manifest(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    create_scene = client.post(
        "/api/pad/halls/current/scenes",
        headers={"X-Client-ID": "pad-a"},
        data={
            "name": "Scene Alpha",
            "sort_order": "1",
            "file": (BytesIO(MOCK_IMAGE_BYTES), "scene.png"),
        },
        content_type="multipart/form-data",
    )
    assert create_scene.status_code == 200
    scene_body = create_scene.get_json()["scene"]
    scene_id = scene_body["scene_id"]
    assert scene_body["background"]["width"] == 1
    assert scene_body["background"]["height"] == 1

    create_hotspot = client.post(
        f"/api/pad/halls/current/scenes/{scene_id}/hotspots",
        headers={"X-Client-ID": "pad-a"},
        json={
            "sort_order": 1,
            "x_pct": 0.1,
            "y_pct": 0.2,
            "width_pct": 0.3,
            "height_pct": 0.25,
            "title": "Area A",
            "content_text": "Area detail",
        },
    )
    assert create_hotspot.status_code == 200
    hotspot_id = create_hotspot.get_json()["hotspot"]["hotspot_id"]

    scenes = client.get("/api/pad/halls/current/scenes", headers={"X-Client-ID": "pad-a"})
    assert scenes.status_code == 200
    scenes_body = scenes.get_json()
    assert len(scenes_body["items"]) == 1
    assert scenes_body["items"][0]["hotspots"][0]["hotspot_id"] == hotspot_id

    scene_background = client.get(
        f"/api/pad/halls/current/scenes/{scene_id}/background",
        headers={"X-Client-ID": "pad-a"},
    )
    assert scene_background.status_code == 200
    assert "image/png" in str(scene_background.headers.get("content-type", "")).lower()

    update_scene = client.put(
        f"/api/pad/halls/current/scenes/{scene_id}",
        headers={"X-Client-ID": "pad-a"},
        json={"name": "Scene Alpha Updated", "sort_order": 2},
    )
    assert update_scene.status_code == 200
    assert update_scene.get_json()["scene"]["name"] == "Scene Alpha Updated"

    update_hotspot = client.put(
        f"/api/pad/halls/current/scenes/{scene_id}/hotspots/{hotspot_id}",
        headers={"X-Client-ID": "pad-a"},
        json={
            "sort_order": 3,
            "x_pct": 0.12,
            "y_pct": 0.18,
            "width_pct": 0.28,
            "height_pct": 0.2,
            "title": "Area B",
            "content_text": "Updated detail",
        },
    )
    assert update_hotspot.status_code == 200
    assert update_hotspot.get_json()["hotspot"]["title"] == "Area B"

    replace_background = client.post(
        f"/api/pad/halls/current/scenes/{scene_id}/background",
        headers={"X-Client-ID": "pad-a"},
        data={"file": (BytesIO(MOCK_IMAGE_BYTES), "scene-replaced.png")},
        content_type="multipart/form-data",
    )
    assert replace_background.status_code == 200
    assert replace_background.get_json()["scene"]["background"]["width"] == 1

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    assert manifest.status_code == 200
    manifest_body = manifest.get_json()
    assert len(manifest_body["scenes"]) == 1
    assert manifest_body["scenes"][0]["hotspots"][0]["title"] == "Area B"

    offline_background = client.get(
        f"/api/pad/offline/scenes/{scene_id}/background",
        headers={"X-Client-ID": "pad-a"},
    )
    assert offline_background.status_code == 200
    assert "image/png" in str(offline_background.headers.get("content-type", "")).lower()

    delete_hotspot = client.delete(
        f"/api/pad/halls/current/scenes/{scene_id}/hotspots/{hotspot_id}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert delete_hotspot.status_code == 200

    delete_scene = client.delete(
        f"/api/pad/halls/current/scenes/{scene_id}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert delete_scene.status_code == 200

    scenes_after_delete = client.get("/api/pad/halls/current/scenes", headers={"X-Client-ID": "pad-a"})
    assert scenes_after_delete.get_json()["items"] == []


def test_scene_endpoints_respect_hall_scope(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    scene = _seed_scene(deps, hall_id="hall_01", name="Scoped Scene")
    client = app.test_client()

    other_hall_get = client.get(
        f"/api/pad/halls/current/scenes/{scene['scene_id']}/background",
        headers={"X-Client-ID": "pad-b"},
    )
    assert other_hall_get.status_code == 404
    assert other_hall_get.get_json()["error"] == "scene_not_found"

    other_hall_update = client.put(
        f"/api/pad/halls/current/scenes/{scene['scene_id']}",
        headers={"X-Client-ID": "pad-b"},
        json={"name": "Nope", "sort_order": 99},
    )
    assert other_hall_update.status_code == 404
    assert other_hall_update.get_json()["error"] == "scene_not_found"


def test_station_endpoints_roundtrip_and_manifest_payload(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    hotspot = _seed_station_assets(deps)
    client = app.test_client()

    stations = client.get("/api/pad/halls/current/stations", headers={"X-Client-ID": "pad-a"})
    assert stations.status_code == 200
    station_body = stations.get_json()["items"]
    assert len(station_body) == 2
    assert station_body[0]["station_key"] == "display_slot_1"
    assert station_body[0]["station_id"] == "station_a"
    assert station_body[0]["background"]["width"] == 1
    assert station_body[0]["wireframe"]["width"] == 1
    assert any(item["hotspot_id"] == hotspot["hotspot_id"] for item in station_body[0]["hotspots"])

    update_station = client.put(
        "/api/pad/halls/current/stations/display_slot_1",
        headers={"X-Client-ID": "pad-a"},
        json={
            "label": "入口站点V2",
            "recording_id": "recording_002",
            "stop_index": 2,
            "stop_name": "新的入口介绍",
        },
    )
    assert update_station.status_code == 200
    assert update_station.get_json()["station"]["label"] == "入口站点V2"

    background = client.get("/api/pad/halls/current/stations/display_slot_1/background", headers={"X-Client-ID": "pad-a"})
    assert background.status_code == 200
    wireframe = client.get("/api/pad/halls/current/stations/display_slot_1/wireframe", headers={"X-Client-ID": "pad-a"})
    assert wireframe.status_code == 200

    create_hotspot = client.post(
        "/api/pad/halls/current/stations/display_slot_2/hotspots",
        headers={"X-Client-ID": "pad-a"},
        json={
            "product_id": "product_001",
            "sort_order": 1,
            "x_pct": 0.2,
            "y_pct": 0.2,
            "width_pct": 0.2,
            "height_pct": 0.2,
        },
    )
    assert create_hotspot.status_code == 200
    hotspot_id = create_hotspot.get_json()["hotspot"]["hotspot_id"]

    update_hotspot = client.put(
        f"/api/pad/halls/current/stations/display_slot_2/hotspots/{hotspot_id}",
        headers={"X-Client-ID": "pad-a"},
        json={
            "product_id": "product_001",
            "sort_order": 2,
            "x_pct": 0.25,
            "y_pct": 0.25,
            "width_pct": 0.2,
            "height_pct": 0.2,
        },
    )
    assert update_hotspot.status_code == 200
    assert update_hotspot.get_json()["hotspot"]["sort_order"] == 2

    timeline = client.put(
        "/api/pad/halls/current/stations/display_slot_1/timeline",
        headers={"X-Client-ID": "pad-a"},
        json={
            "timeline_events": [
                {
                    "sort_order": 0,
                    "time_ms": 0,
                    "product_id": "product_001",
                    "station_hotspot_id": hotspot["hotspot_id"],
                    "event_type": "focus_switch",
                }
            ]
        },
    )
    assert timeline.status_code == 200
    assert timeline.get_json()["timeline_events"][0]["station_hotspot_id"] == hotspot["hotspot_id"]

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    assert manifest.status_code == 200
    manifest_body = manifest.get_json()
    assert len(manifest_body["stations"]) == 2
    assert manifest_body["stations"][0]["background"]["image_url"].startswith("/api/pad/offline/stations/display_slot_1/background")
    assert manifest_body["stations"][0]["timeline_events"][0]["station_hotspot_id"] == hotspot["hotspot_id"]

    offline_background = client.get("/api/pad/offline/stations/display_slot_1/background", headers={"X-Client-ID": "pad-a"})
    assert offline_background.status_code == 200
    offline_wireframe = client.get("/api/pad/offline/stations/display_slot_1/wireframe", headers={"X-Client-ID": "pad-a"})
    assert offline_wireframe.status_code == 200

    delete_hotspot = client.delete(
        f"/api/pad/halls/current/stations/display_slot_2/hotspots/{hotspot_id}",
        headers={"X-Client-ID": "pad-a"},
    )
    assert delete_hotspot.status_code == 200


def test_station_wireframe_requires_background_and_product_scope(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    client = app.test_client()

    no_background = client.post(
        "/api/pad/halls/current/stations/display_slot_1/wireframe",
        headers={"X-Client-ID": "pad-a"},
        data={"file": (BytesIO(MOCK_IMAGE_BYTES), "wireframe.png")},
        content_type="multipart/form-data",
    )
    assert no_background.status_code == 400
    assert no_background.get_json()["error"] == "background_required_before_wireframe"

    background = client.post(
        "/api/pad/halls/current/stations/display_slot_1/background",
        headers={"X-Client-ID": "pad-a"},
        data={"file": (BytesIO(MOCK_IMAGE_BYTES), "background.png")},
        content_type="multipart/form-data",
    )
    assert background.status_code == 200

    bad_hotspot = client.post(
        "/api/pad/halls/current/stations/display_slot_1/hotspots",
        headers={"X-Client-ID": "pad-a"},
        json={
            "product_id": "product_002",
            "sort_order": 1,
            "x_pct": 0.1,
            "y_pct": 0.1,
            "width_pct": 0.2,
            "height_pct": 0.2,
        },
    )
    assert bad_hotspot.status_code == 400
    assert bad_hotspot.get_json()["error"] == "product_not_found"


def test_station_control_hotspot_update_response_keeps_control_metadata(work_dir: Path):
    app, deps = _build_app(work_dir)
    _seed_products_and_bindings(deps)
    _seed_station_assets(deps)
    client = app.test_client()

    stations = client.get("/api/pad/halls/current/stations", headers={"X-Client-ID": "pad-a"})
    assert stations.status_code == 200
    exit_hotspot = next(
        item
        for item in stations.get_json()["items"][0]["hotspots"]
        if item.get("control_action") == "exit_app"
    )

    update_hotspot = client.put(
        f"/api/pad/halls/current/stations/display_slot_1/hotspots/{exit_hotspot['hotspot_id']}",
        headers={"X-Client-ID": "pad-a"},
        json={
            "product_id": "__control_exit_app__",
            "sort_order": exit_hotspot["sort_order"],
            "x_pct": 0.08,
            "y_pct": 0.76,
            "width_pct": exit_hotspot["width_pct"],
            "height_pct": exit_hotspot["height_pct"],
        },
    )
    assert update_hotspot.status_code == 200
    hotspot_body = update_hotspot.get_json()["hotspot"]
    assert hotspot_body["control_action"] == "exit_app"
    assert hotspot_body["control_label"] == "退出"


def test_batch_default_tts_generation_is_visible_via_products_and_manifest_endpoints(work_dir: Path):
    app, deps = _build_app(work_dir)
    deps.pad_product_store.replace_hall_products(
        hall_id="hall_01",
        products=[
            {
                "product_id": "product_001",
                "sort_order": 1,
                "product_name": "Alpha",
                "product_name_en": "Alpha EN",
                "intro_text": "Alpha intro",
                "registration_name": "Alpha reg",
                "registration_number": "REG-1",
                "effective_date": "2026-01-01",
                "company": "YingTai",
            }
        ],
    )
    deps.pad_product_store.upsert_hall_binding(client_id="pad-a", hall_id="hall_01", hall_name="Hall One")
    result = default_tts_script.run_batch(
        deps=deps,
        hall_ids=default_tts_script.select_hall_ids(["hall_01"]),
        dry_run=False,
    )
    assert result["ok"] is True
    assert result["generated_count"] == 1

    client = app.test_client()
    products = client.get("/api/pad/halls/current/products", headers={"X-Client-ID": "pad-a"})
    assert products.status_code == 200
    product_body = products.get_json()["items"][0]
    assert product_body["has_active_audio"] is True
    assert product_body["current_audio"]["source_type"] == "tts"
    assert product_body["current_audio"]["text_snapshot"] == "Alpha intro"

    manifest = client.get("/api/pad/offline/manifest", headers={"X-Client-ID": "pad-a"})
    assert manifest.status_code == 200
    manifest_audio = manifest.get_json()["items"][0]["audio"]
    assert manifest_audio["source_type"] == "tts"
    assert manifest_audio["text_snapshot"] == "Alpha intro"
