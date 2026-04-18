from __future__ import annotations

from flask import Blueprint, Response, jsonify, request, send_file

from backend.api.ragflow_config_cache import get_ragflow_config
from backend.config import resolve_tts_request
from backend.services.pad_product_store import CONTROL_HOTSPOT_SPECS


def _bool_from_value(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value if value is not None else "").strip().lower()
    if not text:
        return bool(default)
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return bool(default)


def _require_binding(deps):
    client_id = str(request.headers.get("X-Client-ID") or request.args.get("client_id") or "").strip()
    if not client_id:
        return None, (jsonify({"ok": False, "error": "client_id_required"}), 400)
    binding = deps.pad_product_store.get_display_binding(client_id, enabled_only=True)
    if not binding:
        return None, (jsonify({"ok": False, "error": "display_binding_not_found"}), 404)
    return {"client_id": client_id, "binding": binding}, None


def _is_product_accessible_from_binding(*, deps, binding: dict, product_id: str) -> bool:
    return deps.pad_product_store.is_product_accessible_from_hall(
        hall_id=str(binding.get("hall_id") or ""),
        product_id=str(product_id or ""),
    )


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


def _send_audio_file(*, deps, asset: dict) -> Response:
    rel_path = str(asset.get("rel_path") or "").strip()
    path = deps.pad_product_store.resolve_audio_rel_path(rel_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("audio_missing")
    return send_file(str(path), mimetype=str(asset.get("mimetype") or "application/octet-stream"), conditional=True)


def _send_image_file(*, deps, asset: dict) -> Response:
    rel_path = str(asset.get("rel_path") or "").strip()
    path = deps.pad_product_store.resolve_image_rel_path(rel_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("image_missing")
    return send_file(str(path), mimetype=str(asset.get("mimetype") or "application/octet-stream"), conditional=True)


def _require_scene_in_binding(*, deps, binding: dict, scene_id: str):
    scene = deps.pad_product_store.get_hall_scene(scene_id)
    if not scene or str(scene.get("hall_id") or "") != str(binding.get("hall_id") or ""):
        return None, (jsonify({"ok": False, "error": "scene_not_found"}), 404)
    return scene, None


def _require_station_in_binding(*, deps, binding: dict, station_key: str):
    hall_id = str(binding.get("hall_id") or "").strip()
    try:
        requested = str(station_key or "").strip()
        slot_map = {
            "display_slot_1": str(binding.get("slot_1_station_id") or ""),
            "display_slot_2": str(binding.get("slot_2_station_id") or ""),
            "station_a": str(binding.get("slot_1_station_id") or "station_a"),
            "station_b": str(binding.get("slot_2_station_id") or "station_b"),
        }
        station_id = slot_map.get(requested, requested)
        station = deps.pad_product_store.get_station_config(hall_id=hall_id, station_key=station_id)
        station["station_id"] = station_id
        station["slot_key"] = requested if requested in {"display_slot_1", "display_slot_2"} else ""
    except ValueError:
        return None, (jsonify({"ok": False, "error": "station_id_invalid"}), 400)
    return station, None


def _attach_station_narration_state(*, deps, station: dict, hall_id: str, station_id: str) -> dict:
    item = station if isinstance(station, dict) else {}
    narration_state = deps.pad_product_store.get_station_narration_nodes_state(
        hall_id=str(hall_id or ""),
        station_id=str(station_id or ""),
    )
    item["narration_nodes"] = narration_state["narration_nodes"]
    item["narration_nodes_error"] = narration_state["narration_nodes_error"]
    return item


def create_blueprint(deps):
    bp = Blueprint("pad_api", __name__)

    @bp.route("/api/pad/bootstrap", methods=["GET"])
    def pad_bootstrap():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall = _hall_summary_payload(deps=deps, binding=binding)
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "display": _display_payload(binding),
                "hall": hall,
                "navigation": {
                    "home_url": "/",
                    "ragint_tour_url": "/ragint/?entry=tour",
                },
                "offline": {
                    "manifest_url": "/api/pad/offline/manifest",
                    "version": int(hall["updated_at_ms"]),
                    "product_count": int(hall["product_count"]),
                    "active_audio_count": int(hall["active_audio_count"]),
                },
            }
        )

    @bp.route("/api/pad/display/current", methods=["GET"])
    def pad_current_display():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall = _hall_summary_payload(deps=deps, binding=binding)
        hall_id = str(binding.get("hall_id") or "").strip()
        items = []
        for station in deps.pad_product_store.list_display_station_configs(client_id=ctx["client_id"]):
            station_id = str(station.get("station_id") or station.get("station_key") or "")
            hotspots = deps.pad_product_store.list_station_hotspots(hall_id=hall_id, station_key=station_id)
            _attach_station_narration_state(deps=deps, station=station, hall_id=hall_id, station_id=station_id)
            items.append(_station_response_payload(station=station, hotspots=hotspots))
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "display": _display_payload(binding),
                "hall": hall,
                "station_catalog": deps.pad_product_store.list_hall_stations(hall_id=hall_id),
                "products": deps.pad_product_store.list_hall_products(hall_id),
                "stations": items,
            }
        )

    @bp.route("/api/pad/display/current/config", methods=["PUT"])
    def pad_update_current_display_config():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        data = request.get_json(silent=True) or {}
        slot_station_ids = data.get("slot_station_ids") if isinstance(data.get("slot_station_ids"), list) else []
        slot_1_station_id = (
            slot_station_ids[0]
            if len(slot_station_ids) > 0
            else data.get("slot_1_station_id") or binding.get("slot_1_station_id")
        )
        slot_2_station_id = (
            slot_station_ids[1]
            if len(slot_station_ids) > 1
            else data.get("slot_2_station_id") or binding.get("slot_2_station_id")
        )
        try:
            updated = deps.pad_product_store.upsert_display_binding(
                client_id=ctx["client_id"],
                display_id=str(data.get("display_id") or binding.get("display_id") or ctx["client_id"]),
                display_name=str(data.get("display_name") or binding.get("display_name") or ctx["client_id"]),
                hall_id=str(binding.get("hall_id") or ""),
                hall_name=str(binding.get("hall_name") or ""),
                slot_1_station_id=str(slot_1_station_id or ""),
                slot_2_station_id=str(slot_2_station_id or ""),
                enabled=_bool_from_value(data.get("enabled"), bool(binding.get("enabled"))),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "client_id": ctx["client_id"], "display": _display_payload(updated)})

    @bp.route("/api/pad/halls/current/products", methods=["GET"])
    def pad_current_hall_products():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall = _hall_summary_payload(deps=deps, binding=binding)
        hall_id = str(binding.get("hall_id") or "")
        rows = deps.pad_product_store.list_hall_products(hall_id)
        referenced_rows = deps.pad_product_store.list_referenced_station_products(hall_id)
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "hall": hall,
                "items": [_product_response_payload(deps=deps, row=row) for row in rows],
                "referenced_items": [_product_response_payload(deps=deps, row=row) for row in referenced_rows],
            }
        )

    @bp.route("/api/pad/products/search", methods=["GET"])
    def pad_search_products():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        query = str(request.args.get("q") or "").strip()
        try:
            limit = min(max(int(request.args.get("limit") or 20), 1), 50)
        except Exception:
            limit = 20
        rows = deps.pad_product_store.search_products(query=query, limit=limit) if query else []
        items = [
            {
                "product_id": str(row.get("product_id") or ""),
                "hall_id": str(row.get("hall_id") or ""),
                "product_name": str(row.get("product_name") or ""),
                "product_name_en": str(row.get("product_name_en") or ""),
                "product_source": str(row.get("product_source") or "imported"),
                "has_active_audio": bool(row.get("active_audio_asset_id")),
            }
            for row in rows
        ]
        return jsonify({"ok": True, "client_id": ctx["client_id"], "items": items})

    @bp.route("/api/pad/halls/current/scenes", methods=["GET"])
    def pad_current_hall_scenes():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall = _hall_summary_payload(deps=deps, binding=binding)
        scenes = deps.pad_product_store.list_hall_scenes_with_hotspots(str(binding.get("hall_id") or ""))
        items = [
            _scene_response_payload(
                scene=scene,
                hotspots=scene.get("hotspots") if isinstance(scene.get("hotspots"), list) else [],
            )
            for scene in scenes
        ]
        return jsonify({"ok": True, "client_id": ctx["client_id"], "hall": hall, "items": items})

    @bp.route("/api/pad/halls/current/stations", methods=["GET"])
    def pad_current_hall_stations():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall_id = str(binding.get("hall_id") or "")
        hall = _hall_summary_payload(deps=deps, binding=binding)
        stations = deps.pad_product_store.list_display_station_configs(client_id=ctx["client_id"])
        items = [
            _station_response_payload(
                station=station,
                hotspots=deps.pad_product_store.list_station_hotspots(
                    hall_id=hall_id,
                    station_key=str(station.get("station_id") or station.get("station_key") or ""),
                ),
            )
            for station in stations
        ]
        return jsonify({"ok": True, "client_id": ctx["client_id"], "display": _display_payload(binding), "hall": hall, "items": items})

    @bp.route("/api/pad/halls/current/scenes", methods=["POST"])
    def pad_create_hall_scene():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        upload = request.files.get("file") or request.files.get("image")
        if upload is None:
            return jsonify({"ok": False, "error": "image_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        image_bytes = upload.read() if hasattr(upload, "read") else b""
        if not image_bytes:
            return jsonify({"ok": False, "error": "image_file_empty"}), 400
        name = str(request.form.get("name") or "").strip()
        if not name:
            return jsonify({"ok": False, "error": "scene_name_required"}), 400
        sort_order = int(request.form.get("sort_order") or 0)

        try:
            scene = deps.pad_hall_scene_service.create_scene(
                hall_id=str(ctx["binding"].get("hall_id") or ""),
                name=name,
                sort_order=sort_order,
                filename=filename or "scene.png",
                image_bytes=image_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_create_hall_scene_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "scene_create_failed", "detail": str(exc)}), 500

        return jsonify({"ok": True, "scene": _scene_response_payload(scene=scene, hotspots=[]), "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/scenes/<scene_id>", methods=["PUT"])
    def pad_update_hall_scene(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        data = request.get_json(silent=True) or {}
        name = str(data.get("name") or "").strip()
        if not name:
            return jsonify({"ok": False, "error": "scene_name_required"}), 400
        sort_order = int(data.get("sort_order") or scene.get("sort_order") or 0)
        try:
            updated = deps.pad_product_store.update_hall_scene(
                scene_id=scene_id,
                name=name,
                sort_order=sort_order,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        hotspots = deps.pad_product_store.list_scene_hotspots(scene_id)
        return jsonify(
            {
                "ok": True,
                "scene": _scene_response_payload(scene=updated or scene, hotspots=hotspots),
                "client_id": ctx["client_id"],
            }
        )

    @bp.route("/api/pad/halls/current/scenes/<scene_id>", methods=["DELETE"])
    def pad_delete_hall_scene(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        _scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        deleted = deps.pad_hall_scene_service.delete_scene(scene_id=scene_id)
        return jsonify({"ok": True, "deleted": bool(deleted), "scene_id": scene_id, "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/scenes/<scene_id>/background", methods=["GET"])
    def pad_current_scene_background(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(scene.get("background_rel_path") or ""),
                    "mimetype": str(scene.get("background_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/halls/current/scenes/<scene_id>/background", methods=["POST"])
    def pad_update_scene_background(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        _scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        upload = request.files.get("file") or request.files.get("image")
        if upload is None:
            return jsonify({"ok": False, "error": "image_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        image_bytes = upload.read() if hasattr(upload, "read") else b""
        if not image_bytes:
            return jsonify({"ok": False, "error": "image_file_empty"}), 400
        try:
            scene = deps.pad_hall_scene_service.replace_scene_background(
                scene_id=scene_id,
                filename=filename or "scene.png",
                image_bytes=image_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_update_scene_background_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "scene_background_update_failed", "detail": str(exc)}), 500
        hotspots = deps.pad_product_store.list_scene_hotspots(scene_id)
        return jsonify({"ok": True, "scene": _scene_response_payload(scene=scene, hotspots=hotspots), "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/scenes/<scene_id>/hotspots", methods=["POST"])
    def pad_create_scene_hotspot(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        _scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        data = request.get_json(silent=True) or {}
        try:
            hotspot = deps.pad_product_store.create_scene_hotspot(
                scene_id=scene_id,
                sort_order=int(data.get("sort_order") or 0),
                x_pct=data.get("x_pct"),
                y_pct=data.get("y_pct"),
                width_pct=data.get("width_pct"),
                height_pct=data.get("height_pct"),
                title=str(data.get("title") or "").strip(),
                content_text=str(data.get("content_text") or "").strip(),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "hotspot": _hotspot_response_payload(hotspot), "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/scenes/<scene_id>/hotspots/<hotspot_id>", methods=["PUT"])
    def pad_update_scene_hotspot(scene_id: str, hotspot_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        _scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        data = request.get_json(silent=True) or {}
        try:
            hotspot = deps.pad_product_store.update_scene_hotspot(
                scene_id=scene_id,
                hotspot_id=hotspot_id,
                sort_order=int(data.get("sort_order") or 0),
                x_pct=data.get("x_pct"),
                y_pct=data.get("y_pct"),
                width_pct=data.get("width_pct"),
                height_pct=data.get("height_pct"),
                title=str(data.get("title") or "").strip(),
                content_text=str(data.get("content_text") or "").strip(),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "hotspot": _hotspot_response_payload(hotspot or {}), "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/scenes/<scene_id>/hotspots/<hotspot_id>", methods=["DELETE"])
    def pad_delete_scene_hotspot(scene_id: str, hotspot_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        _scene, scene_err = _require_scene_in_binding(deps=deps, binding=ctx["binding"], scene_id=scene_id)
        if scene_err is not None:
            return scene_err
        deleted = deps.pad_product_store.delete_scene_hotspot(scene_id=scene_id, hotspot_id=hotspot_id)
        if not deleted:
            return jsonify({"ok": False, "error": "hotspot_not_found"}), 404
        return jsonify({"ok": True, "deleted": True, "hotspot_id": hotspot_id, "client_id": ctx["client_id"]})

    @bp.route("/api/pad/halls/current/stations/<station_key>", methods=["PUT"])
    def pad_update_station_config(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        data = request.get_json(silent=True) or {}
        try:
            updated = deps.pad_product_store.upsert_station_config(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(data.get("station_id") or station.get("station_id") or station_key),
                label=str(data.get("label") or "").strip(),
                recording_id=str(data.get("recording_id") or "").strip(),
                stop_index=data.get("stop_index"),
                stop_name=str(data.get("stop_name") or "").strip(),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        updated["station_id"] = str(updated.get("station_key") or "")
        updated["slot_key"] = str(station.get("slot_key") or station_key)
        _attach_station_narration_state(
            deps=deps,
            station=updated,
            hall_id=str(binding.get("hall_id") or ""),
            station_id=str(updated.get("station_id") or ""),
        )
        hotspots = deps.pad_product_store.list_station_hotspots(
            hall_id=str(binding.get("hall_id") or ""),
            station_key=str(updated.get("station_id") or ""),
        )
        return jsonify({"ok": True, "client_id": ctx["client_id"], "station": _station_response_payload(station=updated, hotspots=hotspots)})

    @bp.route("/api/pad/halls/current/stations/<station_key>/background", methods=["GET"])
    def pad_current_station_background(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        station, station_err = _require_station_in_binding(deps=deps, binding=ctx["binding"], station_key=station_key)
        if station_err is not None:
            return station_err
        if not str(station.get("background_rel_path") or "").strip():
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(station.get("background_rel_path") or ""),
                    "mimetype": str(station.get("background_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/halls/current/stations/<station_key>/background", methods=["POST"])
    def pad_update_station_background(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        upload = request.files.get("file") or request.files.get("image")
        if upload is None:
            return jsonify({"ok": False, "error": "image_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        image_bytes = upload.read() if hasattr(upload, "read") else b""
        if not image_bytes:
            return jsonify({"ok": False, "error": "image_file_empty"}), 400
        try:
            updated = deps.pad_hall_station_service.upload_station_background(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(station.get("station_id") or station_key),
                filename=filename or "background.png",
                image_bytes=image_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_update_station_background_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "station_background_update_failed", "detail": str(exc)}), 500
        updated["station_id"] = str(updated.get("station_key") or "")
        updated["slot_key"] = str(station.get("slot_key") or station_key)
        _attach_station_narration_state(
            deps=deps,
            station=updated,
            hall_id=str(binding.get("hall_id") or ""),
            station_id=str(updated.get("station_id") or ""),
        )
        hotspots = deps.pad_product_store.list_station_hotspots(
            hall_id=str(binding.get("hall_id") or ""),
            station_key=str(updated.get("station_id") or ""),
        )
        return jsonify({"ok": True, "client_id": ctx["client_id"], "station": _station_response_payload(station=updated, hotspots=hotspots)})

    @bp.route("/api/pad/halls/current/stations/<station_key>/wireframe", methods=["GET"])
    def pad_current_station_wireframe(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        station, station_err = _require_station_in_binding(deps=deps, binding=ctx["binding"], station_key=station_key)
        if station_err is not None:
            return station_err
        if not str(station.get("wireframe_rel_path") or "").strip():
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(station.get("wireframe_rel_path") or ""),
                    "mimetype": str(station.get("wireframe_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/halls/current/stations/<station_key>/wireframe", methods=["POST"])
    def pad_update_station_wireframe(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        upload = request.files.get("file") or request.files.get("image")
        if upload is None:
            return jsonify({"ok": False, "error": "image_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        image_bytes = upload.read() if hasattr(upload, "read") else b""
        if not image_bytes:
            return jsonify({"ok": False, "error": "image_file_empty"}), 400
        try:
            updated = deps.pad_hall_station_service.upload_station_wireframe(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(station.get("station_id") or station_key),
                filename=filename or "wireframe.png",
                image_bytes=image_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_update_station_wireframe_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "station_wireframe_update_failed", "detail": str(exc)}), 500
        updated["station_id"] = str(updated.get("station_key") or "")
        updated["slot_key"] = str(station.get("slot_key") or station_key)
        _attach_station_narration_state(
            deps=deps,
            station=updated,
            hall_id=str(binding.get("hall_id") or ""),
            station_id=str(updated.get("station_id") or ""),
        )
        hotspots = deps.pad_product_store.list_station_hotspots(
            hall_id=str(binding.get("hall_id") or ""),
            station_key=str(updated.get("station_id") or ""),
        )
        return jsonify({"ok": True, "client_id": ctx["client_id"], "station": _station_response_payload(station=updated, hotspots=hotspots)})

    @bp.route("/api/pad/halls/current/stations/<station_key>/hotspots", methods=["POST"])
    def pad_create_station_hotspot(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        data = request.get_json(silent=True) or {}
        try:
            hotspot = deps.pad_product_store.create_station_hotspot(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(station.get("station_id") or station_key),
                product_id=str(data.get("product_id") or "").strip(),
                manual_product_name=str(data.get("manual_product_name") or "").strip(),
                sort_order=int(data.get("sort_order") or 0),
                x_pct=data.get("x_pct"),
                y_pct=data.get("y_pct"),
                width_pct=data.get("width_pct"),
                height_pct=data.get("height_pct"),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "client_id": ctx["client_id"], "hotspot": _station_hotspot_response_payload(hotspot)})

    @bp.route("/api/pad/halls/current/stations/<station_key>/hotspots/export", methods=["GET"])
    def pad_export_station_hotspots(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        actual_station_id = str(station.get("station_id") or station_key)
        hotspots = deps.pad_product_store.list_exportable_station_hotspots(
            hall_id=str(binding.get("hall_id") or ""),
            station_key=actual_station_id,
        )
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "station_key": str(station_key or ""),
                "station_id": actual_station_id,
                "version": 1,
                "exported_at_ms": int(deps.pad_product_store._now_ms()),
                "hotspots": [_station_hotspot_export_payload(item) for item in hotspots],
            }
        )

    @bp.route("/api/pad/halls/current/stations/<station_key>/hotspots/<hotspot_id>", methods=["PUT"])
    def pad_update_station_hotspot(station_key: str, hotspot_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        data = request.get_json(silent=True) or {}
        try:
            hotspot = deps.pad_product_store.update_station_hotspot(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(station.get("station_id") or station_key),
                hotspot_id=hotspot_id,
                product_id=str(data.get("product_id") or "").strip(),
                manual_product_name=str(data.get("manual_product_name") or "").strip(),
                sort_order=int(data.get("sort_order") or 0),
                x_pct=data.get("x_pct"),
                y_pct=data.get("y_pct"),
                width_pct=data.get("width_pct"),
                height_pct=data.get("height_pct"),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "client_id": ctx["client_id"], "hotspot": _station_hotspot_response_payload(hotspot)})

    @bp.route("/api/pad/halls/current/stations/<station_key>/hotspots/<hotspot_id>", methods=["DELETE"])
    def pad_delete_station_hotspot(station_key: str, hotspot_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        deleted = deps.pad_product_store.delete_station_hotspot(
            hall_id=str(binding.get("hall_id") or ""),
            station_key=str(station.get("station_id") or station_key),
            hotspot_id=hotspot_id,
        )
        if not deleted:
            return jsonify({"ok": False, "error": "hotspot_not_found"}), 404
        return jsonify({"ok": True, "client_id": ctx["client_id"], "deleted": True, "hotspot_id": hotspot_id})

    @bp.route("/api/pad/halls/current/stations/<station_key>/hotspots/import", methods=["POST"])
    def pad_import_station_hotspots(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        data = request.get_json(silent=True) or {}
        hotspots = data.get("hotspots")
        if not isinstance(hotspots, list):
            return jsonify({"ok": False, "error": "hotspots_must_be_list"}), 400
        try:
            rows = deps.pad_product_store.replace_station_hotspots(
                hall_id=str(binding.get("hall_id") or ""),
                station_key=str(station.get("station_id") or station_key),
                hotspots=hotspots,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        slot_key = str(station.get("slot_key") or station_key)
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "station_key": str(station_key or ""),
                "station_id": str(station.get("station_id") or station_key),
                "hotspots": [_station_hotspot_response_payload(row, slot_key=slot_key) for row in rows],
            }
        )

    @bp.route("/api/pad/halls/current/stations/<station_key>/timeline", methods=["PUT"])
    def pad_replace_station_timeline(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        station, station_err = _require_station_in_binding(deps=deps, binding=binding, station_key=station_key)
        if station_err is not None:
            return station_err
        data = request.get_json(silent=True) or {}
        if "timeline_events" in data or "events" in data:
            return jsonify({"ok": False, "error": "timeline_events_not_supported"}), 400
        narration_nodes = data.get("narration_nodes")
        try:
            nodes = deps.pad_product_store.replace_station_narration_nodes(
                hall_id=str(binding.get("hall_id") or ""),
                station_id=str(station.get("station_id") or station_key),
                nodes=narration_nodes,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "narration_nodes": [_station_narration_node_response_payload(node) for node in nodes],
            }
        )

    @bp.route("/api/pad/products/<product_id>/audio/current", methods=["GET"])
    def pad_current_product_audio(product_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404
        asset = deps.pad_product_store.get_current_audio_asset(product_id)
        if not asset:
            return jsonify({"ok": False, "error": "current_audio_missing"}), 404
        try:
            return _send_audio_file(deps=deps, asset=asset)
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "audio_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_audio_path"}), 400

    @bp.route("/api/pad/products/<product_id>", methods=["PUT"])
    def pad_update_product(product_id: str):
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404
        data = request.get_json(silent=True) or {}
        if "product_name" not in data and "intro_text" not in data:
            return jsonify({"ok": False, "error": "product_update_fields_required"}), 400
        try:
            updated = deps.pad_product_store.update_product(
                product_id=product_id,
                product_name=data.get("product_name") if "product_name" in data else None,
                intro_text=data.get("intro_text") if "intro_text" in data else None,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        return jsonify({"ok": True, "product": updated})

    @bp.route("/api/pad/products/<product_id>/audio/upload", methods=["POST"])
    def pad_upload_product_audio(product_id: str):
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404

        upload = request.files.get("file") or request.files.get("audio")
        if upload is None:
            return jsonify({"ok": False, "error": "audio_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        audio_bytes = upload.read() if hasattr(upload, "read") else b""
        if not audio_bytes:
            return jsonify({"ok": False, "error": "audio_file_empty"}), 400
        activate = _bool_from_value(request.form.get("activate"), True)
        text_snapshot = str(request.form.get("text_snapshot") or "").strip()

        try:
            asset = deps.pad_product_audio_service.save_uploaded_audio(
                product_id=product_id,
                filename=filename or "recorded.wav",
                audio_bytes=audio_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
                text_snapshot=text_snapshot,
                activate=activate,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_upload_product_audio_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "audio_upload_failed", "detail": str(exc)}), 500

        return jsonify({"ok": True, "product": product, "audio": _asset_response_payload(product_id=product_id, asset=asset)})

    @bp.route("/api/pad/products/<product_id>/images/upload", methods=["POST"])
    def pad_upload_product_image(product_id: str):
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404

        upload = request.files.get("file") or request.files.get("image")
        if upload is None:
            return jsonify({"ok": False, "error": "image_file_required"}), 400
        filename = str(getattr(upload, "filename", "") or "").strip()
        image_bytes = upload.read() if hasattr(upload, "read") else b""
        if not image_bytes:
            return jsonify({"ok": False, "error": "image_file_empty"}), 400

        try:
            asset = deps.pad_product_image_service.save_uploaded_image(
                product_id=product_id,
                filename=filename or "product.png",
                image_bytes=image_bytes,
                mimetype=str(getattr(upload, "mimetype", "") or ""),
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            deps.logger.error("pad_upload_product_image_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "image_upload_failed", "detail": str(exc)}), 500

        return jsonify({"ok": True, "product": product, "image": _image_response_payload(product_id=product_id, asset=asset)})

    @bp.route("/api/pad/products/<product_id>/audio/regenerate", methods=["POST"])
    def pad_regenerate_product_audio(product_id: str):
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404

        data = request.get_json(silent=True) or {}
        if "text" in data:
            intro_text = str(data.get("text") or "").strip()
            if not intro_text:
                return jsonify({"ok": False, "error": "audio_text_required"}), 400
        else:
            intro_text = str(product.get("intro_text") or "").strip()
            if not intro_text:
                return jsonify({"ok": False, "error": "intro_text_required"}), 400
        activate = _bool_from_value(data.get("activate"), True)
        app_config = get_ragflow_config(deps=deps)
        provider, resolved_cfg = resolve_tts_request(app_config, data=data, headers=request.headers)

        try:
            asset = deps.pad_product_audio_service.regenerate_product_audio(
                product_id=product_id,
                text=intro_text,
                resolved_cfg=resolved_cfg,
                provider=str(provider or ""),
                activate=activate,
            )
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 502
        except Exception as exc:
            deps.logger.error("pad_regenerate_product_audio_failed: %s", exc, exc_info=True)
            return jsonify({"ok": False, "error": "audio_regenerate_failed", "detail": str(exc)}), 500

        return jsonify(
            {
                "ok": True,
                "product": product,
                "audio": _asset_response_payload(product_id=product_id, asset=asset),
            }
        )

    @bp.route("/api/pad/products/<product_id>/images/<image_asset_id>", methods=["GET"])
    def pad_current_product_image(product_id: str, image_asset_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        product = deps.pad_product_store.get_product(product_id)
        if not product:
            return jsonify({"ok": False, "error": "product_not_found"}), 404
        asset = deps.pad_product_store.get_image_asset(image_asset_id)
        if not asset or str(asset.get("product_id") or "") != str(product_id or ""):
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(deps=deps, asset=asset)
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/offline/manifest", methods=["GET"])
    def pad_offline_manifest():
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        binding = ctx["binding"]
        hall = _hall_summary_payload(deps=deps, binding=binding)
        hall_id = str(binding.get("hall_id") or "")
        rows = deps.pad_product_store.list_hall_products(hall_id)
        referenced_rows = deps.pad_product_store.list_referenced_station_products(hall_id)
        scenes = deps.pad_product_store.list_hall_scenes_with_hotspots(hall_id)
        stations = deps.pad_product_store.list_display_station_configs(client_id=ctx["client_id"])
        return jsonify(
            {
                "ok": True,
                "client_id": ctx["client_id"],
                "display": _display_payload(binding),
                "hall": hall,
                "version": int(hall.get("updated_at_ms") or 0),
                "items": [_product_response_payload(deps=deps, row=row, offline=True) for row in rows],
                "referenced_items": [_product_response_payload(deps=deps, row=row, offline=True) for row in referenced_rows],
                "scenes": [
                    _scene_response_payload(
                        scene=scene,
                        hotspots=scene.get("hotspots") if isinstance(scene.get("hotspots"), list) else [],
                        offline=True,
                    )
                    for scene in scenes
                ],
                "stations": [
                    _station_response_payload(
                        station=station,
                        hotspots=deps.pad_product_store.list_station_hotspots(
                            hall_id=hall_id,
                            station_key=str(station.get("station_id") or station.get("station_key") or ""),
                        ),
                        offline=True,
                    )
                    for station in stations
                ],
            }
        )

    @bp.route("/api/pad/offline/audio/<audio_asset_id>", methods=["GET"])
    def pad_offline_audio(audio_asset_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        asset = deps.pad_product_store.get_audio_asset(audio_asset_id)
        if not asset or not bool(asset.get("is_active")):
            return jsonify({"ok": False, "error": "audio_not_found"}), 404
        if not _is_product_accessible_from_binding(
            deps=deps,
            binding=ctx["binding"],
            product_id=str(asset.get("product_id") or ""),
        ):
            return jsonify({"ok": False, "error": "audio_not_found"}), 404
        try:
            return _send_audio_file(deps=deps, asset=asset)
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "audio_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_audio_path"}), 400

    @bp.route("/api/pad/offline/images/<image_asset_id>", methods=["GET"])
    def pad_offline_image(image_asset_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        asset = deps.pad_product_store.get_image_asset(image_asset_id)
        if not asset:
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        if not _is_product_accessible_from_binding(
            deps=deps,
            binding=ctx["binding"],
            product_id=str(asset.get("product_id") or ""),
        ):
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(deps=deps, asset=asset)
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/offline/scenes/<scene_id>/background", methods=["GET"])
    def pad_offline_scene_background(scene_id: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        scene = deps.pad_product_store.get_hall_scene(scene_id)
        if not scene or str(scene.get("hall_id") or "") != str(ctx["binding"].get("hall_id") or ""):
            return jsonify({"ok": False, "error": "scene_not_found"}), 404
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(scene.get("background_rel_path") or ""),
                    "mimetype": str(scene.get("background_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/offline/stations/<station_key>/background", methods=["GET"])
    def pad_offline_station_background(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        station, station_err = _require_station_in_binding(deps=deps, binding=ctx["binding"], station_key=station_key)
        if station_err is not None:
            return station_err
        if not str(station.get("background_rel_path") or "").strip():
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(station.get("background_rel_path") or ""),
                    "mimetype": str(station.get("background_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    @bp.route("/api/pad/offline/stations/<station_key>/wireframe", methods=["GET"])
    def pad_offline_station_wireframe(station_key: str):
        ctx, err = _require_binding(deps)
        if err is not None:
            return err
        station, station_err = _require_station_in_binding(deps=deps, binding=ctx["binding"], station_key=station_key)
        if station_err is not None:
            return station_err
        if not str(station.get("wireframe_rel_path") or "").strip():
            return jsonify({"ok": False, "error": "image_not_found"}), 404
        try:
            return _send_image_file(
                deps=deps,
                asset={
                    "rel_path": str(station.get("wireframe_rel_path") or ""),
                    "mimetype": str(station.get("wireframe_mimetype") or "application/octet-stream"),
                },
            )
        except FileNotFoundError:
            return jsonify({"ok": False, "error": "image_missing"}), 404
        except Exception:
            return jsonify({"ok": False, "error": "bad_image_path"}), 400

    return bp
