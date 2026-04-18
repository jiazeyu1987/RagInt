from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path

import pytest

from backend.services.pad_product_store import PadProductStore


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"pad_product_store_{uuid.uuid4().hex}"
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
        logger=logging.getLogger("test_pad_product_store"),
    )


def _product(*, product_id: str, sort_order: int, name: str, hall_id: str = "hall_01") -> dict:
    return {
        "product_id": product_id,
        "sort_order": sort_order,
        "product_name": name,
        "product_name_en": f"{name} EN",
        "intro_text": f"{name} intro",
        "registration_name": f"{name} reg",
        "registration_number": f"REG-{sort_order}",
        "effective_date": "2026-01-01",
        "company": "YingTai",
        "hall_id": hall_id,
    }


def _write_audio_file(store: PadProductStore, *, product_id: str, filename: str = "a.wav") -> str:
    rel_path = store.build_audio_rel_path(product_id=product_id, filename=filename)
    path = store.resolve_audio_rel_path(rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"RIFF\x00\x00\x00\x00WAVE")
    return rel_path


def _write_image_file(store: PadProductStore, *, product_id: str, filename: str = "a.png") -> str:
    rel_path = store.build_image_rel_path(product_id=product_id, filename=filename)
    path = store.resolve_image_rel_path(rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
    return rel_path


def _write_scene_background_file(
    store: PadProductStore,
    *,
    hall_id: str,
    scene_id: str,
    filename: str = "scene.png",
) -> str:
    rel_path = store.build_scene_background_rel_path(hall_id=hall_id, scene_id=scene_id, filename=filename)
    path = store.resolve_image_rel_path(rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
    return rel_path


def _write_station_asset_file(
    store: PadProductStore,
    *,
    hall_id: str,
    station_key: str,
    filename: str = "background.png",
) -> str:
    rel_path = store.build_station_asset_rel_path(hall_id=hall_id, station_key=station_key, filename=filename)
    path = store.resolve_image_rel_path(rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
    return rel_path


def test_binding_listing_and_hall_product_summary_roundtrip(work_dir: Path):
    store = _store(work_dir)
    store.upsert_hall_binding(client_id="pad-a", hall_id="hall_01", hall_name="Hall One")
    store.upsert_hall_binding(client_id="pad-b", hall_id="hall_02", hall_name="Hall Two", enabled=False)

    store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_001", sort_order=1, name="Product A"),
            _product(product_id="product_002", sort_order=2, name="Product B"),
        ],
    )
    store.replace_hall_products(
        hall_id="hall_02",
        products=[_product(product_id="product_003", sort_order=1, name="Product C", hall_id="hall_02")],
    )

    rel_path = _write_audio_file(store, product_id="product_001")
    asset = store.create_audio_asset(
        product_id="product_001",
        source_type="recorded",
        text_snapshot="",
        rel_path=rel_path,
        mimetype="audio/wav",
        activate=True,
    )

    assert store.get_binding("pad-a") == {
        "client_id": "pad-a",
        "hall_id": "hall_01",
        "hall_name": "Hall One",
        "enabled": 1,
        "updated_at_ms": store.get_binding("pad-a")["updated_at_ms"],
    }
    assert store.get_binding("pad-b") is None
    assert len(store.list_bindings(enabled_only=False)) == 2

    hall_products = store.list_hall_products("hall_01")
    assert [item["product_id"] for item in hall_products] == ["product_001", "product_002"]
    assert hall_products[0]["active_audio_asset_id"] == asset["audio_asset_id"]
    assert hall_products[0]["active_audio_text_snapshot"] == ""
    assert hall_products[1]["active_audio_asset_id"] is None

    summary = store.get_hall_summary("hall_01")
    assert summary["product_count"] == 2
    assert summary["active_audio_count"] == 1
    assert summary["updated_at_ms"] >= int(asset["updated_at_ms"])


def test_active_audio_switch_and_product_replace_cleanup(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )

    rel_path_v1 = _write_audio_file(store, product_id="product_001", filename="v1.wav")
    asset_v1 = store.create_audio_asset(
        product_id="product_001",
        source_type="recorded",
        text_snapshot="",
        rel_path=rel_path_v1,
        mimetype="audio/wav",
        activate=True,
    )
    rel_path_v2 = _write_audio_file(store, product_id="product_001", filename="v2.wav")
    asset_v2 = store.create_audio_asset(
        product_id="product_001",
        source_type="tts",
        text_snapshot="new intro",
        rel_path=rel_path_v2,
        mimetype="audio/wav",
        activate=True,
    )

    current_asset = store.get_current_audio_asset("product_001")
    assert current_asset is not None
    assert current_asset["audio_asset_id"] == asset_v2["audio_asset_id"]
    assert current_asset["source_type"] == "tts"
    assert current_asset["text_snapshot"] == "new intro"

    conn = store._connect()  # noqa: SLF001 - unit test validates persisted uniqueness.
    try:
        rows = conn.execute(
            "SELECT audio_asset_id, is_active FROM product_audio_assets WHERE product_id=? ORDER BY created_at_ms ASC",
            ("product_001",),
        ).fetchall()
    finally:
        conn.close()
    assert [int(row["is_active"]) for row in rows] == [0, 1]
    assert [str(row["audio_asset_id"]) for row in rows] == [asset_v1["audio_asset_id"], asset_v2["audio_asset_id"]]

    product_audio_dir = store.product_audio_dir("product_001")
    assert product_audio_dir.exists()

    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_004", sort_order=1, name="Product D")],
    )

    assert store.get_product("product_001") is None
    assert store.get_current_audio_asset("product_001") is None
    assert not product_audio_dir.exists()


def test_product_image_assets_roundtrip_and_cleanup(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )

    rel_path_v1 = _write_image_file(store, product_id="product_001", filename="v1.png")
    image_v1 = store.create_image_asset(
        product_id="product_001",
        rel_path=rel_path_v1,
        mimetype="image/png",
    )
    rel_path_v2 = _write_image_file(store, product_id="product_001", filename="v2.jpg")
    image_v2 = store.create_image_asset(
        product_id="product_001",
        rel_path=rel_path_v2,
        mimetype="image/jpeg",
    )

    images = store.list_product_image_assets("product_001")
    assert [item["image_asset_id"] for item in images] == [image_v2["image_asset_id"], image_v1["image_asset_id"]]
    assert images[0]["mimetype"] == "image/jpeg"
    assert store.get_image_asset(image_v1["image_asset_id"])["mimetype"] == "image/png"

    summary = store.get_hall_summary("hall_01")
    assert summary["updated_at_ms"] >= int(image_v2["updated_at_ms"])

    product_image_dir = store.product_image_dir("product_001")
    assert product_image_dir.exists()

    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_004", sort_order=1, name="Product D")],
    )

    assert store.get_image_asset(image_v1["image_asset_id"]) is None
    assert store.list_product_image_assets("product_001") == []
    assert not product_image_dir.exists()


def test_hall_scenes_and_hotspots_roundtrip_and_cleanup(work_dir: Path):
    store = _store(work_dir)
    scene_id = "scene_001"
    rel_path = _write_scene_background_file(store, hall_id="hall_01", scene_id=scene_id)
    scene = store.create_hall_scene(
        scene_id=scene_id,
        hall_id="hall_01",
        name="Scene One",
        sort_order=1,
        background_rel_path=rel_path,
        background_mimetype="image/png",
        base_width=1200,
        base_height=800,
    )
    hotspot = store.create_scene_hotspot(
        scene_id=scene_id,
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.3,
        height_pct=0.15,
        title="Hotspot A",
        content_text="Scene content",
    )

    listed_scenes = store.list_hall_scenes("hall_01")
    assert [item["scene_id"] for item in listed_scenes] == [scene_id]
    assert listed_scenes[0]["hotspot_count"] == 1
    assert store.list_hall_scenes_with_hotspots("hall_01")[0]["hotspots"][0]["hotspot_id"] == hotspot["hotspot_id"]

    updated_scene = store.update_hall_scene(scene_id=scene_id, name="Scene One Updated", sort_order=2)
    assert updated_scene["name"] == "Scene One Updated"
    assert updated_scene["sort_order"] == 2

    updated_hotspot = store.update_scene_hotspot(
        scene_id=scene_id,
        hotspot_id=hotspot["hotspot_id"],
        sort_order=3,
        x_pct=0.12,
        y_pct=0.22,
        width_pct=0.32,
        height_pct=0.18,
        title="Hotspot B",
        content_text="Updated scene content",
    )
    assert updated_hotspot["title"] == "Hotspot B"
    assert updated_hotspot["sort_order"] == 3
    assert float(updated_hotspot["x_pct"]) == pytest.approx(0.12)

    summary = store.get_hall_summary("hall_01")
    assert summary["updated_at_ms"] >= int(updated_hotspot["updated_at_ms"])

    deleted_hotspot = store.delete_scene_hotspot(scene_id=scene_id, hotspot_id=hotspot["hotspot_id"])
    assert deleted_hotspot is not None
    assert store.list_scene_hotspots(scene_id) == []

    deleted_scene = store.delete_hall_scene(scene_id=scene_id)
    assert deleted_scene is not None
    assert store.get_hall_scene(scene_id) is None


def test_scene_hotspot_validation_rejects_out_of_bounds_geometry(work_dir: Path):
    store = _store(work_dir)
    scene_id = "scene_bounds"
    rel_path = _write_scene_background_file(store, hall_id="hall_01", scene_id=scene_id)
    store.create_hall_scene(
        scene_id=scene_id,
        hall_id="hall_01",
        name="Bounds Scene",
        sort_order=1,
        background_rel_path=rel_path,
        background_mimetype="image/png",
        base_width=1000,
        base_height=600,
    )

    with pytest.raises(ValueError, match="hotspot_bounds_invalid"):
        store.create_scene_hotspot(
            scene_id=scene_id,
            sort_order=1,
            x_pct=0.8,
            y_pct=0.1,
            width_pct=0.25,
            height_pct=0.2,
            title="Overflow",
            content_text="Bad geometry",
        )


def test_station_configs_and_hotspots_roundtrip(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )

    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="入口站点",
        recording_id="recording_001",
        stop_index=1,
        stop_name="入口",
    )
    background_rel = _write_station_asset_file(store, hall_id="hall_01", station_key="station_a", filename="background.png")
    wireframe_rel = _write_station_asset_file(store, hall_id="hall_01", station_key="station_a", filename="wireframe.png")
    updated = store.update_station_visual_assets(
        hall_id="hall_01",
        station_key="station_a",
        background_rel_path=background_rel,
        background_mimetype="image/png",
        wireframe_rel_path=wireframe_rel,
        wireframe_mimetype="image/png",
        base_width=1200,
        base_height=800,
    )
    assert updated["base_width"] == 1200

    hotspot = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.25,
        height_pct=0.15,
    )
    assert hotspot["product_id"] == "product_001"
    listed = store.list_station_configs(hall_id="hall_01")
    assert [item["station_key"] for item in listed] == ["station_a"]
    assert listed[0]["background_rel_path"] == background_rel
    listed_hotspots = store.list_station_hotspots(hall_id="hall_01", station_key="station_a")
    assert any(item["hotspot_id"] == hotspot["hotspot_id"] for item in listed_hotspots)

    updated_hotspot = store.update_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        hotspot_id=hotspot["hotspot_id"],
        product_id="product_001",
        sort_order=2,
        x_pct=0.2,
        y_pct=0.25,
        width_pct=0.2,
        height_pct=0.2,
    )
    assert updated_hotspot["sort_order"] == 2
    assert float(updated_hotspot["x_pct"]) == pytest.approx(0.2)

    deleted = store.delete_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        hotspot_id=hotspot["hotspot_id"],
    )
    assert deleted is not None
    assert all(
        item["hotspot_id"] != hotspot["hotspot_id"]
        for item in store.list_station_hotspots(hall_id="hall_01", station_key="station_a")
    )


def test_station_timeline_events_roundtrip(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=0,
        stop_name="Stop A",
    )
    hotspot = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )
    events = store.replace_station_narration_timeline_events(
        hall_id="hall_01",
        station_id="station_a",
        events=[
            {
                "sort_order": 0,
                "time_ms": 0,
                "product_id": "product_001",
                "station_hotspot_id": hotspot["hotspot_id"],
                "event_type": "focus_switch",
            }
        ],
    )
    assert len(events) == 1
    assert events[0]["station_hotspot_id"] == hotspot["hotspot_id"]
    assert store.list_station_narration_timeline_events(hall_id="hall_01", station_id="station_a")[0]["product_id"] == "product_001"


def test_station_narration_nodes_roundtrip_supports_multi_hotspot_binding(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[
            _product(product_id="product_001", sort_order=1, name="Product A"),
            _product(product_id="product_002", sort_order=2, name="Product B"),
        ],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_station_default",
        stop_index=0,
        stop_name="Default Stop",
    )
    hotspot_a = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )
    hotspot_b = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_002",
        sort_order=2,
        x_pct=0.4,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )

    nodes = store.replace_station_narration_nodes(
        hall_id="hall_01",
        station_id="station_a",
        nodes=[
            {
                "sort_order": 0,
                "recording_id": "recording_001",
                "stop_index": 1,
                "stop_name": "Stop 1",
                "highlight_start_ms": 200,
                "highlight_end_ms": 900,
                "hotspot_ids": [hotspot_a["hotspot_id"], hotspot_b["hotspot_id"]],
            },
            {
                "sort_order": 1,
                "recording_id": "recording_002",
                "stop_index": 0,
                "stop_name": "Stop 2",
                "highlight_start_ms": 100,
                "highlight_end_ms": 500,
                "hotspot_ids": [hotspot_b["hotspot_id"]],
            },
        ],
    )

    assert len(nodes) == 2
    assert nodes[0]["recording_id"] == "recording_001"
    assert nodes[0]["hotspot_ids"] == [hotspot_a["hotspot_id"], hotspot_b["hotspot_id"]]
    assert nodes[1]["recording_id"] == "recording_002"
    assert store.list_station_narration_nodes(hall_id="hall_01", station_id="station_a")[1]["highlight_end_ms"] == 500


def test_station_narration_nodes_validate_required_fields(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_station_default",
        stop_index=0,
        stop_name="Default Stop",
    )
    hotspot = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )

    with pytest.raises(ValueError, match="narration_node_recording_required"):
        store.replace_station_narration_nodes(
            hall_id="hall_01",
            station_id="station_a",
            nodes=[
                {
                    "stop_index": 0,
                    "highlight_start_ms": 100,
                    "highlight_end_ms": 200,
                    "hotspot_ids": [hotspot["hotspot_id"]],
                }
            ],
        )

    with pytest.raises(ValueError, match="narration_node_hotspots_required"):
        store.replace_station_narration_nodes(
            hall_id="hall_01",
            station_id="station_a",
            nodes=[
                {
                    "recording_id": "recording_001",
                    "stop_index": 0,
                    "highlight_start_ms": 100,
                    "highlight_end_ms": 200,
                    "hotspot_ids": [],
                }
            ],
        )

    with pytest.raises(ValueError, match="station_hotspot_not_found"):
        store.replace_station_narration_nodes(
            hall_id="hall_01",
            station_id="station_a",
            nodes=[
                {
                    "recording_id": "recording_001",
                    "stop_index": 0,
                    "highlight_start_ms": 100,
                    "highlight_end_ms": 200,
                    "hotspot_ids": ["station_hotspot_missing"],
                }
            ],
        )


def test_station_narration_nodes_migrate_pairable_legacy_timeline(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=2,
        stop_name="Stop A",
    )
    hotspot = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )
    store.replace_station_narration_timeline_events(
        hall_id="hall_01",
        station_id="station_a",
        events=[
            {
                "sort_order": 0,
                "time_ms": 300,
                "product_id": "product_001",
                "station_hotspot_id": hotspot["hotspot_id"],
                "event_type": "highlight_on",
            },
            {
                "sort_order": 1,
                "time_ms": 900,
                "product_id": "product_001",
                "station_hotspot_id": hotspot["hotspot_id"],
                "event_type": "highlight_off",
            },
        ],
    )

    narration_state = store.get_station_narration_nodes_state(hall_id="hall_01", station_id="station_a")

    assert narration_state["narration_nodes_error"] == ""
    assert len(narration_state["narration_nodes"]) == 1
    assert narration_state["narration_nodes"][0]["recording_id"] == "recording_001"
    assert narration_state["narration_nodes"][0]["hotspot_ids"] == [hotspot["hotspot_id"]]
    assert store.list_station_narration_timeline_events(hall_id="hall_01", station_id="station_a") == []


def test_station_narration_nodes_report_invalid_legacy_timeline(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=0,
        stop_name="Stop A",
    )
    hotspot = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )
    store.replace_station_narration_timeline_events(
        hall_id="hall_01",
        station_id="station_a",
        events=[
            {
                "sort_order": 0,
                "time_ms": 0,
                "product_id": "product_001",
                "station_hotspot_id": hotspot["hotspot_id"],
                "event_type": "focus_switch",
            }
        ],
    )

    narration_state = store.get_station_narration_nodes_state(hall_id="hall_01", station_id="station_a")

    assert narration_state["narration_nodes"] == []
    assert narration_state["narration_nodes_error"] == "legacy_timeline_focus_switch_unsupported"


def test_station_hotspot_validates_product_scope_and_custom_station_ids(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Product A")],
    )

    custom_station = store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_north",
        label="North Station",
        recording_id="recording_north",
        stop_index=0,
        stop_name="North Stop",
    )
    assert custom_station["station_key"] == "station_north"

    with pytest.raises(ValueError, match="product_not_found"):
        store.create_station_hotspot(
            hall_id="hall_01",
            station_key="station_north",
            product_id="product_missing",
            sort_order=1,
            x_pct=0.1,
            y_pct=0.1,
            width_pct=0.2,
            height_pct=0.2,
        )


def test_manual_placeholder_products_are_preserved_and_searchable(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Alpha")],
    )
    placeholder = store.create_manual_placeholder_product(
        hall_id="hall_01",
        product_name="Alpha Placeholder",
    )
    assert placeholder["product_source"] == "manual_placeholder"

    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_002", sort_order=2, name="Gamma")],
    )

    assert store.get_product(str(placeholder["product_id"])) is not None
    assert store.get_product("product_001") is None
    search_results = store.search_products(query="Alpha Placeholder", limit=10)
    assert search_results[0]["product_id"] == placeholder["product_id"]


def test_station_hotspot_supports_unbound_placeholder_and_cross_hall_products(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Alpha")],
    )
    store.replace_hall_products(
        hall_id="hall_02",
        products=[_product(product_id="product_002", sort_order=1, name="Beta", hall_id="hall_02")],
    )
    rel_path = _write_audio_file(store, product_id="product_002", filename="beta.wav")
    store.create_audio_asset(
        product_id="product_002",
        source_type="recorded",
        text_snapshot="beta audio",
        rel_path=rel_path,
        mimetype="audio/wav",
        activate=True,
    )

    unbound = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="",
        manual_product_name="",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.1,
        width_pct=0.2,
        height_pct=0.2,
    )
    assert unbound["product_id"] in {"", None}

    placeholder_bound = store.update_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        hotspot_id=str(unbound["hotspot_id"]),
        product_id="",
        manual_product_name="Manual New Product",
        sort_order=2,
        x_pct=0.12,
        y_pct=0.12,
        width_pct=0.22,
        height_pct=0.22,
    )
    placeholder_product = store.get_product(str(placeholder_bound["product_id"]))
    assert placeholder_product is not None
    assert placeholder_product["product_source"] == "manual_placeholder"

    cross_hall = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_b",
        product_id="product_002",
        sort_order=3,
        x_pct=0.2,
        y_pct=0.2,
        width_pct=0.2,
        height_pct=0.2,
    )
    listed = store.list_station_hotspots(hall_id="hall_01", station_key="station_b")
    matched = next(item for item in listed if item["hotspot_id"] == cross_hall["hotspot_id"])
    assert matched["product_hall_id"] == "hall_02"
    assert matched["product_name"] == "Beta"
    assert matched["active_audio_asset_id"]


def test_list_exportable_station_hotspots_includes_control_hotspots(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Alpha")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=0,
        stop_name="Stop A",
    )
    store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.1,
        width_pct=0.2,
        height_pct=0.2,
    )
    store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="",
        manual_product_name="Manual Placeholder",
        sort_order=2,
        x_pct=0.3,
        y_pct=0.15,
        width_pct=0.18,
        height_pct=0.22,
    )

    exported = store.list_exportable_station_hotspots(hall_id="hall_01", station_key="station_a")

    assert len(exported) == 6
    assert {item["product_id"] for item in exported} != set()
    assert sum(1 for item in exported if str(item["product_id"]).startswith("__control_")) == 4
    business_items = [item for item in exported if not str(item["product_id"]).startswith("__control_")]
    assert business_items[0]["manual_product_name"] == ""
    assert business_items[1]["manual_product_name"] == "Manual Placeholder"
    assert business_items[1]["width_pct"] == pytest.approx(0.18)


def test_replace_station_hotspots_replaces_all_station_hotspots(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Alpha")],
    )
    store.upsert_station_config(
        hall_id="hall_01",
        station_key="station_a",
        label="Station A",
        recording_id="recording_001",
        stop_index=0,
        stop_name="Stop A",
    )
    first = store.create_station_hotspot(
        hall_id="hall_01",
        station_key="station_a",
        product_id="product_001",
        sort_order=1,
        x_pct=0.1,
        y_pct=0.1,
        width_pct=0.2,
        height_pct=0.2,
    )

    replaced = store.replace_station_hotspots(
        hall_id="hall_01",
        station_key="station_a",
        hotspots=[
            {
                "product_id": "__control_toggle_station__",
                "sort_order": 100,
                "x_pct": 0.01,
                "y_pct": 0.9,
                "width_pct": 0.08,
                "height_pct": 0.08,
            },
            {
                "product_id": "__control_enter_ops__",
                "sort_order": 101,
                "x_pct": 0.42,
                "y_pct": 0.9,
                "width_pct": 0.08,
                "height_pct": 0.08,
            },
            {
                "product_id": "__control_exit_app__",
                "sort_order": 102,
                "x_pct": 0.9,
                "y_pct": 0.01,
                "width_pct": 0.08,
                "height_pct": 0.08,
            },
            {
                "product_id": "__control_toggle_station_narration__",
                "sort_order": 103,
                "x_pct": 0.01,
                "y_pct": 0.01,
                "width_pct": 0.08,
                "height_pct": 0.08,
            },
            {
                "product_id": "",
                "manual_product_name": "Imported Placeholder",
                "sort_order": 10,
                "x_pct": 0.45,
                "y_pct": 0.2,
                "width_pct": 0.15,
                "height_pct": 0.25,
            }
        ],
    )

    control_hotspots = [item for item in replaced if str(item.get("product_id") or "").startswith("__control_")]
    business_hotspots = [item for item in replaced if not str(item.get("product_id") or "").startswith("__control_")]
    assert len(control_hotspots) == 4
    assert len(business_hotspots) == 1
    assert business_hotspots[0]["sort_order"] == 10
    assert business_hotspots[0]["product_name"] == "Imported Placeholder"
    assert all(item["hotspot_id"] != first["hotspot_id"] for item in business_hotspots)
    assert {item["product_id"] for item in control_hotspots} == {
        "__control_toggle_station__",
        "__control_enter_ops__",
        "__control_exit_app__",
        "__control_toggle_station_narration__",
    }


def test_replace_station_hotspots_validates_required_fields(work_dir: Path):
    store = _store(work_dir)
    store.replace_hall_products(
        hall_id="hall_01",
        products=[_product(product_id="product_001", sort_order=1, name="Alpha")],
    )

    with pytest.raises(ValueError, match="product_binding_required"):
        store.replace_station_hotspots(
            hall_id="hall_01",
            station_key="station_a",
            hotspots=[
                {
                    "product_id": "",
                    "manual_product_name": "",
                    "sort_order": 1,
                    "x_pct": 0.1,
                    "y_pct": 0.1,
                    "width_pct": 0.2,
                    "height_pct": 0.2,
                }
            ],
        )

    with pytest.raises(ValueError, match="product_not_found"):
        store.replace_station_hotspots(
            hall_id="hall_01",
            station_key="station_a",
            hotspots=[
                {
                    "product_id": "missing",
                    "sort_order": 1,
                    "x_pct": 0.1,
                    "y_pct": 0.1,
                    "width_pct": 0.2,
                    "height_pct": 0.2,
                }
            ],
        )
