from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.runtime_paths import copy_seed_template


def _copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst)


def main() -> int:
    repo_root = REPO_ROOT
    dist_root = (repo_root / "desktop" / "dist").resolve()
    pad_src = (repo_root / "pad-frontend").resolve()
    ragint_src = (repo_root / "fronted" / "build-ragint").resolve()
    data_src = (repo_root / "backend" / "data").resolve()

    if not pad_src.exists():
        raise SystemExit(f"pad_frontend_missing:{pad_src}")
    if not ragint_src.exists():
        raise SystemExit(f"ragint_frontend_missing:{ragint_src}")
    if not data_src.exists():
        raise SystemExit(f"backend_data_missing:{data_src}")

    frontend_root = dist_root / "frontend"
    pad_dst = frontend_root / "pad"
    ragint_dst = frontend_root / "ragint"
    data_dst = dist_root / "data-template"

    dist_root.mkdir(parents=True, exist_ok=True)
    _copy_tree(pad_src, pad_dst)
    _copy_tree(ragint_src, ragint_dst)
    copy_seed_template(source_dir=data_src, dest_dir=data_dst)

    payload = {
      "ok": True,
      "dist_root": str(dist_root),
      "pad": str(pad_dst),
      "ragint": str(ragint_dst),
      "data_template": str(data_dst),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
