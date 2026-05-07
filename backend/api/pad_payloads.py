from __future__ import annotations

from backend.services.pad_product_paths import CONTROL_HOTSPOT_SPECS


def _display_payload(binding: dict) -> dict:
    item = binding if isinstance(binding, dict) else {}
    return {
        "display_id": str(item.get("display_id") or item.get("client_id") or ""),
        "display_name": str(item.get("display_name") or item.get("display_id") or item.get("client_id") or ""),
        "slot_station_ids": [
            str(item.get("slot_1_station_id") or ""),
            str(item.get("slot_2_station_id") or ""),
        ],
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }


def _hall_summary_payload(*, deps, binding: dict) -> dict:
    hall_id = str(binding.get("hall_id") or "").strip()
    hall_summary = deps.pad_product_store.get_hall_summary(hall_id)
    version = max(int(binding.get("updated_at_ms") or 0), int(hall_summary.get("updated_at_ms") or 0))
    return {
        "hall_id": hall_id,
        "hall_name": str(binding.get("hall_name") or "").strip(),
        "product_count": int(hall_summary.get("product_count") or 0),
        "active_audio_count": int(hall_summary.get("active_audio_count") or 0),
        "updated_at_ms": version,
    }


def _asset_response_payload(*, product_id: str, asset: dict) -> dict:
    version = int(asset.get("updated_at_ms") or asset.get("created_at_ms") or 0)
    return {
        "product_id": str(product_id or ""),
        "audio_asset_id": str(asset.get("audio_asset_id") or ""),
        "source_type": str(asset.get("source_type") or ""),
        "text_snapshot": str(asset.get("text_snapshot") or ""),
        "mimetype": str(asset.get("mimetype") or "application/octet-stream"),
        "is_active": bool(asset.get("is_active")),
        "created_at_ms": int(asset.get("created_at_ms") or 0),
        "updated_at_ms": version,
        "audio_url": (
            f"/api/pad/products/{str(product_id or '')}/audio/current?v={version}"
            if version > 0
            else f"/api/pad/products/{str(product_id or '')}/audio/current"
        ),
        "offline_audio_url": (
            f"/api/pad/offline/audio/{str(asset.get('audio_asset_id') or '')}?v={version}"
            if version > 0
            else f"/api/pad/offline/audio/{str(asset.get('audio_asset_id') or '')}"
        ),
    }


def _image_response_payload(*, product_id: str, asset: dict, offline: bool = False) -> dict:
    version = int(asset.get("updated_at_ms") or asset.get("created_at_ms") or 0)
    image_asset_id = str(asset.get("image_asset_id") or "")
    image_url = (
        f"/api/pad/offline/images/{image_asset_id}"
        if offline
        else f"/api/pad/products/{str(product_id or '')}/images/{image_asset_id}"
    )
    if version > 0:
        image_url += f"?v={version}"
    offline_image_url = f"/api/pad/offline/images/{image_asset_id}"
    if version > 0:
        offline_image_url += f"?v={version}"
    return {
        "product_id": str(product_id or ""),
        "image_asset_id": image_asset_id,
        "mimetype": str(asset.get("mimetype") or "application/octet-stream"),
        "created_at_ms": int(asset.get("created_at_ms") or 0),
        "updated_at_ms": version,
        "image_url": image_url,
        "offline_image_url": offline_image_url,
    }


def _product_response_payload(*, deps, row: dict, offline: bool = False) -> dict:
    item = row if isinstance(row, dict) else {}
    product_id = str(item.get("product_id") or "")
    active_audio_id = str(item.get("active_audio_asset_id") or "").strip()
    payload = {
        "product_id": product_id,
        "hall_id": str(item.get("hall_id") or ""),
        "sort_order": int(item.get("sort_order") or 0),
        "product_name": str(item.get("product_name") or ""),
        "product_name_en": str(item.get("product_name_en") or ""),
        "intro_text": str(item.get("intro_text") or ""),
        "registration_name": str(item.get("registration_name") or ""),
        "registration_number": str(item.get("registration_number") or ""),
        "effective_date": str(item.get("effective_date") or ""),
        "company": str(item.get("company") or ""),
        "product_source": str(item.get("product_source") or "imported"),
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
        "has_active_audio": bool(active_audio_id),
    }
    if active_audio_id:
        version = int(item.get("active_audio_updated_at_ms") or 0)
        audio_url = (
            f"/api/pad/offline/audio/{active_audio_id}"
            if offline
            else f"/api/pad/products/{product_id}/audio/current"
        )
        if version > 0:
            audio_url = f"{audio_url}?v={version}"
        payload["current_audio"] = {
            "audio_asset_id": active_audio_id,
            "source_type": str(item.get("active_audio_source_type") or ""),
            "text_snapshot": str(item.get("active_audio_text_snapshot") or ""),
            "mimetype": str(item.get("active_audio_mimetype") or "application/octet-stream"),
            "updated_at_ms": version,
            "audio_url": audio_url,
        }
    else:
        payload["current_audio"] = None
    if offline:
        payload["audio"] = payload["current_audio"]
    image_assets = [
        _image_response_payload(product_id=product_id, asset=asset, offline=offline)
        for asset in deps.pad_product_store.list_product_image_assets(product_id)
    ]
    payload["images"] = image_assets
    payload["has_images"] = bool(image_assets)
    payload["primary_image"] = image_assets[0] if image_assets else None
    return payload


def _scene_background_response_payload(*, scene: dict, offline: bool = False) -> dict:
    item = scene if isinstance(scene, dict) else {}
    version = int(item.get("updated_at_ms") or item.get("created_at_ms") or 0)
    scene_id = str(item.get("scene_id") or "")
    image_url = (
        f"/api/pad/offline/scenes/{scene_id}/background"
        if offline
        else f"/api/pad/halls/current/scenes/{scene_id}/background"
    )
    if version > 0:
        image_url += f"?v={version}"
    offline_image_url = f"/api/pad/offline/scenes/{scene_id}/background"
    if version > 0:
        offline_image_url += f"?v={version}"
    return {
        "image_url": image_url,
        "offline_image_url": offline_image_url,
        "mimetype": str(item.get("background_mimetype") or "application/octet-stream"),
        "width": int(item.get("base_width") or 0),
        "height": int(item.get("base_height") or 0),
        "updated_at_ms": version,
    }


def _hotspot_response_payload(hotspot: dict) -> dict:
    item = hotspot if isinstance(hotspot, dict) else {}
    return {
        "hotspot_id": str(item.get("hotspot_id") or ""),
        "scene_id": str(item.get("scene_id") or ""),
        "sort_order": int(item.get("sort_order") or 0),
        "x_pct": float(item.get("x_pct") or 0),
        "y_pct": float(item.get("y_pct") or 0),
        "width_pct": float(item.get("width_pct") or 0),
        "height_pct": float(item.get("height_pct") or 0),
        "title": str(item.get("title") or ""),
        "content_text": str(item.get("content_text") or ""),
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }


def _scene_response_payload(*, scene: dict, hotspots: list[dict], offline: bool = False) -> dict:
    item = scene if isinstance(scene, dict) else {}
    return {
        "scene_id": str(item.get("scene_id") or ""),
        "hall_id": str(item.get("hall_id") or ""),
        "name": str(item.get("name") or ""),
        "sort_order": int(item.get("sort_order") or 0),
        "background": _scene_background_response_payload(scene=item, offline=offline),
        "hotspots": [_hotspot_response_payload(hotspot) for hotspot in hotspots],
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }


def _station_asset_response_payload(*, station: dict, asset_kind: str, offline: bool = False) -> dict | None:
    item = station if isinstance(station, dict) else {}
    kind = str(asset_kind or "").strip().lower()
    if kind not in {"background", "wireframe"}:
        return None
    rel_key = f"{kind}_rel_path"
    mime_key = f"{kind}_mimetype"
    rel_path = str(item.get(rel_key) or "").strip()
    if not rel_path:
        return None
    station_key = str(item.get("slot_key") or item.get("station_key") or "")
    version = int(item.get("updated_at_ms") or item.get("created_at_ms") or 0)
    image_url = (
        f"/api/pad/offline/stations/{station_key}/{kind}"
        if offline
        else f"/api/pad/halls/current/stations/{station_key}/{kind}"
    )
    if version > 0:
        image_url += f"?v={version}"
    offline_image_url = f"/api/pad/offline/stations/{station_key}/{kind}"
    if version > 0:
        offline_image_url += f"?v={version}"
    return {
        "image_url": image_url,
        "offline_image_url": offline_image_url,
        "mimetype": str(item.get(mime_key) or "application/octet-stream"),
        "width": int(item.get("base_width") or 0),
        "height": int(item.get("base_height") or 0),
        "updated_at_ms": version,
    }


def _station_hotspot_response_payload(hotspot: dict, *, slot_key: str = "") -> dict:
    item = hotspot if isinstance(hotspot, dict) else {}
    product_id = str(item.get("product_id") or "")
    control_action = ""
    control_label = str(item.get("control_label") or "")
    if product_id == "__control_toggle_station__":
        control_action = "toggle_station"
    elif product_id == "__control_toggle_station_narration__":
        control_action = "toggle_station_narration"
    elif product_id == "__control_enter_ops__":
        control_action = "enter_ops"
    elif product_id == "__control_exit_app__":
        control_action = "exit_app"
    if not control_label and product_id in CONTROL_HOTSPOT_SPECS:
        control_label = str(CONTROL_HOTSPOT_SPECS[product_id].get("label") or "")
    active_audio_id = str(item.get("active_audio_asset_id") or "").strip()
    audio_version = int(item.get("active_audio_updated_at_ms") or 0)
    audio_url = ""
    if active_audio_id and product_id:
        audio_url = f"/api/pad/products/{product_id}/audio/current"
        if audio_version > 0:
            audio_url += f"?v={audio_version}"
    return {
        "hotspot_id": str(item.get("hotspot_id") or ""),
        "station_id": str(item.get("station_id") or item.get("station_key") or ""),
        "station_key": str(slot_key or item.get("station_key") or ""),
        "slot_key": str(slot_key or item.get("station_key") or ""),
        "product_id": product_id,
        "target_type": "control" if control_action else "product",
        "control_action": control_action,
        "control_label": control_label,
        "product_name": str(item.get("product_name") or ""),
        "product_name_en": str(item.get("product_name_en") or ""),
        "product_hall_id": str(item.get("product_hall_id") or ""),
        "product_source": str(item.get("product_source") or ""),
        "has_active_audio": bool(active_audio_id),
        "audio_asset_id": active_audio_id,
        "audio_url": audio_url,
        "sort_order": int(item.get("sort_order") or 0),
        "x_pct": float(item.get("x_pct") or 0),
        "y_pct": float(item.get("y_pct") or 0),
        "width_pct": float(item.get("width_pct") or 0),
        "height_pct": float(item.get("height_pct") or 0),
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }


def _station_hotspot_export_payload(hotspot: dict) -> dict:
    item = hotspot if isinstance(hotspot, dict) else {}
    return {
        "product_id": str(item.get("product_id") or ""),
        "manual_product_name": str(item.get("manual_product_name") or ""),
        "sort_order": int(item.get("sort_order") or 0),
        "x_pct": float(item.get("x_pct") or 0),
        "y_pct": float(item.get("y_pct") or 0),
        "width_pct": float(item.get("width_pct") or 0),
        "height_pct": float(item.get("height_pct") or 0),
    }


def _station_narration_node_response_payload(node: dict) -> dict:
    item = node if isinstance(node, dict) else {}
    return {
        "node_id": str(item.get("node_id") or ""),
        "sort_order": int(item.get("sort_order") or 0),
        "recording_id": str(item.get("recording_id") or ""),
        "stop_index": item.get("stop_index"),
        "stop_name": str(item.get("stop_name") or ""),
        "highlight_start_ms": int(item.get("highlight_start_ms") or 0),
        "highlight_end_ms": int(item.get("highlight_end_ms") or 0),
        "hotspot_ids": [
            str(hotspot_id or "")
            for hotspot_id in (item.get("hotspot_ids") if isinstance(item.get("hotspot_ids"), list) else [])
            if str(hotspot_id or "").strip()
        ],
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }


def _station_response_payload(*, station: dict, hotspots: list[dict], offline: bool = False) -> dict:
    item = station if isinstance(station, dict) else {}
    slot_key = str(item.get("slot_key") or item.get("station_key") or "")
    return {
        "station_id": str(item.get("station_id") or item.get("station_key") or ""),
        "station_key": slot_key,
        "slot_key": slot_key,
        "label": str(item.get("label") or ""),
        "recording_id": str(item.get("recording_id") or ""),
        "stop_index": item.get("stop_index"),
        "stop_name": str(item.get("stop_name") or ""),
        "background": _station_asset_response_payload(station=item, asset_kind="background", offline=offline),
        "wireframe": _station_asset_response_payload(station=item, asset_kind="wireframe", offline=offline),
        "hotspots": [_station_hotspot_response_payload(hotspot, slot_key=slot_key) for hotspot in hotspots],
        "narration_nodes": [
            _station_narration_node_response_payload(node)
            for node in (item.get("narration_nodes") if isinstance(item.get("narration_nodes"), list) else [])
        ],
        "narration_nodes_error": str(item.get("narration_nodes_error") or ""),
        "updated_at_ms": int(item.get("updated_at_ms") or 0),
    }
