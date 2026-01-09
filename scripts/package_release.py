from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class FileEntry:
    relpath: str
    size: int
    sha256: str


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _iter_files(root: Path, *, include_dirs: list[str]) -> list[Path]:
    out: list[Path] = []
    for rel in include_dirs:
        p = (root / rel).resolve()
        if not p.exists():
            continue
        if p.is_file():
            out.append(p)
            continue
        for fp in p.rglob("*"):
            if fp.is_file():
                out.append(fp)
    out.sort(key=lambda x: str(x).lower())
    return out


def _compute_manifest(repo_root: Path, *, include_dirs: list[str]) -> list[FileEntry]:
    files = _iter_files(repo_root, include_dirs=include_dirs)
    entries: list[FileEntry] = []
    for fp in files:
        rel = fp.relative_to(repo_root).as_posix()
        st = fp.stat()
        entries.append(FileEntry(relpath=rel, size=int(st.st_size), sha256=_sha256_file(fp)))
    return entries


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _zip_dir(src_dir: Path, dst_zip_without_ext: Path) -> Path:
    dst_zip_without_ext.parent.mkdir(parents=True, exist_ok=True)
    p = shutil.make_archive(str(dst_zip_without_ext), "zip", root_dir=str(src_dir))
    return Path(p)


def _default_version() -> str:
    v = str(os.environ.get("RAGINT_VERSION") or "").strip()
    if v:
        return v
    return time.strftime("%Y%m%d-%H%M%S")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build full/upgrade release packages (zip) with sha256 manifest.")
    ap.add_argument("--mode", choices=["full", "upgrade"], required=True)
    ap.add_argument("--version", default=_default_version())
    ap.add_argument("--output-dir", default="dist")
    ap.add_argument("--dry-run", action="store_true", help="Only compute manifest + plan; do not build zip.")
    args = ap.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    out_dir = (repo_root / str(args.output_dir)).resolve()
    version = str(args.version).strip() or _default_version()

    if args.mode == "full":
        include_dirs = [
            "backend",
            "fronted",
            "docker-compose.yml",
            "todolist.md",
            "refactor",
            "doc",
        ]
        package_name = f"ragint-{version}-full"
    else:
        # Upgrade package is intentionally smaller: backend code + built frontend + compose/env examples.
        include_dirs = [
            "backend",
            "fronted/build",
            "docker-compose.yml",
            "backend/.env.example",
        ]
        package_name = f"ragint-{version}-upgrade"

    # Stage directory (deterministic structure)
    stage = out_dir / package_name
    if stage.exists() and not args.dry_run:
        shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True, exist_ok=True)

    manifest = _compute_manifest(repo_root, include_dirs=include_dirs)
    manifest_path = stage / "manifest.json"
    _write_text(
        manifest_path,
        json.dumps(
            {
                "name": package_name,
                "mode": args.mode,
                "version": version,
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "files": [e.__dict__ for e in manifest],
            },
            ensure_ascii=False,
            indent=2,
        ),
    )

    instructions = (
        "# RagInt 交付包说明\n\n"
        f"- 包类型：{args.mode}\n"
        f"- 版本：{version}\n\n"
        "## 校验\n\n"
        "- 使用 `manifest.json` 中的 `sha256` 校验文件完整性（建议在解压后校验关键文件）。\n\n"
        "## 回滚\n\n"
        "- 升级前备份：`backend/data/`（SQLite）、`.env`（或等价环境变量配置）、以及 `fronted/build/`。\n"
        "- 如升级失败：恢复备份并重启服务即可回滚到升级前状态。\n"
    )
    _write_text(stage / "UPGRADE.md", instructions)

    if args.dry_run:
        print(json.dumps({"ok": True, "mode": args.mode, "package": package_name, "files": len(manifest)}, ensure_ascii=False))
        return 0

    # Copy files into stage
    for fp in _iter_files(repo_root, include_dirs=include_dirs):
        rel = fp.relative_to(repo_root)
        dst = stage / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fp, dst)

    zip_path = _zip_dir(stage, out_dir / package_name)
    print(json.dumps({"ok": True, "zip": str(zip_path), "manifest": str(manifest_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

