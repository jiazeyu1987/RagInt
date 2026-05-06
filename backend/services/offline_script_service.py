from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class OfflineItem:
    id: str
    title: str
    filename: str
    stop_id: str = ""
    stop_name: str = ""
    order: int = 0
    duration_ms: int | None = None

    def to_dict(self, *, audio_url: str | None = None) -> dict:
        d = {
            "id": self.id,
            "title": self.title,
            "filename": self.filename,
            "stop_id": self.stop_id,
            "stop_name": self.stop_name,
            "order": int(self.order),
        }
        if self.duration_ms is not None:
            d["duration_ms"] = int(self.duration_ms)
        if audio_url:
            d["audio_url"] = str(audio_url)
        return d


class OfflineScriptService:
    def __init__(self, *, manifest_path: Path, audio_dir: Path):
        self._manifest_path = Path(manifest_path)
        self._audio_dir = Path(audio_dir)

    @property
    def audio_dir(self) -> Path:
        return self._audio_dir

    def load_manifest(self) -> dict:
        if not self._manifest_path.exists():
            raise FileNotFoundError("offline_manifest_missing")
        with open(self._manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("offline_manifest_invalid")
        items = data.get("items")
        if not isinstance(items, list):
            raise ValueError("offline_manifest_invalid")
        return data

    def _require_int_field(self, raw: dict, field: str) -> int | None:
        value = raw.get(field, None)
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("offline_manifest_invalid") from exc

    def list_items(self) -> list[OfflineItem]:
        cfg = self.load_manifest()
        items = cfg["items"]

        out: list[OfflineItem] = []
        for raw in items:
            if not isinstance(raw, dict):
                raise ValueError("offline_manifest_invalid")
            item_id = str(raw.get("id") or "").strip()
            filename = str(raw.get("filename") or "").strip()
            title = str(raw.get("title") or raw.get("stop_name") or item_id or filename).strip()
            if not item_id or not filename:
                raise ValueError("offline_manifest_invalid")
            stop_id = str(raw.get("stop_id") or "").strip()
            stop_name = str(raw.get("stop_name") or "").strip()
            order = self._require_int_field(raw, "order")
            duration_ms = self._require_int_field(raw, "duration_ms")
            out.append(
                OfflineItem(
                    id=item_id,
                    title=title,
                    filename=filename,
                    stop_id=stop_id,
                    stop_name=stop_name,
                    order=order or 0,
                    duration_ms=duration_ms,
                )
            )

        out.sort(key=lambda x: (int(x.order), x.id))
        return out

