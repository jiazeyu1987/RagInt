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
        if self._manifest_path.exists():
            with open(self._manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        return {}

    def list_items(self) -> list[OfflineItem]:
        cfg = self.load_manifest()
        items = cfg.get("items") if isinstance(cfg, dict) else None
        if not isinstance(items, list):
            return []

        out: list[OfflineItem] = []
        for raw in items:
            if not isinstance(raw, dict):
                continue
            item_id = str(raw.get("id") or "").strip()
            filename = str(raw.get("filename") or "").strip()
            title = str(raw.get("title") or raw.get("stop_name") or item_id or filename).strip()
            if not item_id or not filename:
                continue
            stop_id = str(raw.get("stop_id") or "").strip()
            stop_name = str(raw.get("stop_name") or "").strip()
            try:
                order = int(raw.get("order") or 0)
            except Exception:
                order = 0
            duration_ms = raw.get("duration_ms", None)
            try:
                duration_ms = int(duration_ms) if duration_ms is not None else None
            except Exception:
                duration_ms = None
            out.append(
                OfflineItem(
                    id=item_id,
                    title=title,
                    filename=filename,
                    stop_id=stop_id,
                    stop_name=stop_name,
                    order=order,
                    duration_ms=duration_ms,
                )
            )

        out.sort(key=lambda x: (int(x.order), x.id))
        return out

