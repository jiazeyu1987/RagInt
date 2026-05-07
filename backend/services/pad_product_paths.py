from __future__ import annotations


def _safe_path_part(value: str, *, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name}_required")
    if text != text.strip("._"):
        raise ValueError(f"{field_name}_invalid")
    if any(not (ch.isalnum() or ch in {"-", "_", "."}) for ch in text):
        raise ValueError(f"{field_name}_invalid")
    return text


def _normalize_rel_path(value: str) -> str:
    rel = str(value or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("bad_path")
    return rel


def _normalize_optional_rel_path(value: str | None, current: str) -> str:
    if value is None:
        return str(current or "")
    if not str(value or "").strip():
        return ""
    return _normalize_rel_path(value)


def _normalize_hotspot_measure(value, *, field_name: str) -> float:
    try:
        out = float(value)
    except Exception as exc:  # pragma: no cover - defensive conversion.
        raise ValueError(f"{field_name}_invalid") from exc
    if out < 0 or out > 1:
        raise ValueError(f"{field_name}_invalid")
    return round(out, 6)


def _normalize_hotspot_geometry(*, x_pct, y_pct, width_pct, height_pct) -> tuple[float, float, float, float]:
    x_value = _normalize_hotspot_measure(x_pct, field_name="x_pct")
    y_value = _normalize_hotspot_measure(y_pct, field_name="y_pct")
    width_value = _normalize_hotspot_measure(width_pct, field_name="width_pct")
    height_value = _normalize_hotspot_measure(height_pct, field_name="height_pct")
    if width_value <= 0:
        raise ValueError("width_pct_invalid")
    if height_value <= 0:
        raise ValueError("height_pct_invalid")
    if x_value + width_value > 1.000001:
        raise ValueError("hotspot_bounds_invalid")
    if y_value + height_value > 1.000001:
        raise ValueError("hotspot_bounds_invalid")
    return x_value, y_value, width_value, height_value


def _normalize_station_id(value: str) -> str:
    station_id = str(value or "").strip().lower()
    if not station_id:
        raise ValueError("station_id_required")
    out = []
    for ch in station_id:
        if ch.isalnum() or ch in {"-", "_", "."}:
            out.append(ch)
        else:
            out.append("_")
    normalized = "".join(out).strip("._")
    if not normalized:
        raise ValueError("station_id_invalid")
    return normalized


def _normalize_station_key(value: str) -> str:
    return _normalize_station_id(value)


PRODUCT_SOURCE_IMPORTED = "imported"
PRODUCT_SOURCE_MANUAL_PLACEHOLDER = "manual_placeholder"


CONTROL_HOTSPOT_SPECS = {
    "__control_toggle_station__": {
        "label": "站台切换",
        "sort_order": -400,
        "x_pct": 0.02,
        "y_pct": 0.05,
        "width_pct": 0.08,
        "height_pct": 0.18,
    },
    "__control_toggle_station_narration__": {
        "label": "全站讲解",
        "sort_order": -399,
        "x_pct": 0.02,
        "y_pct": 0.27,
        "width_pct": 0.08,
        "height_pct": 0.2,
    },
    "__control_enter_ops__": {
        "label": "运维",
        "sort_order": -398,
        "x_pct": 0.02,
        "y_pct": 0.52,
        "width_pct": 0.08,
        "height_pct": 0.14,
    },
    "__control_exit_app__": {
        "label": "退出",
        "sort_order": -397,
        "x_pct": 0.02,
        "y_pct": 0.82,
        "width_pct": 0.08,
        "height_pct": 0.14,
    },
}


def _is_control_hotspot_product_id(product_id: str) -> bool:
    return str(product_id or "").strip() in CONTROL_HOTSPOT_SPECS


def _normalize_product_source(value: str | None) -> str:
    source = str(value or "").strip().lower()
    if source == PRODUCT_SOURCE_MANUAL_PLACEHOLDER:
        return PRODUCT_SOURCE_MANUAL_PLACEHOLDER
    return PRODUCT_SOURCE_IMPORTED


def _is_manual_placeholder_product_source(value: str | None) -> bool:
    return str(value or "").strip().lower() == PRODUCT_SOURCE_MANUAL_PLACEHOLDER
