from __future__ import annotations

from pathlib import Path

from backend.runtime_paths import (
    ensure_runtime_data_seeded,
    resolve_runtime_data_dir,
)


def test_resolve_runtime_data_dir_defaults_to_repo_data(monkeypatch, tmp_path):
    monkeypatch.delenv("RAGINT_DATA_DIR", raising=False)
    monkeypatch.delenv("RAGINT_DESKTOP", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)

    repo_root = tmp_path / "repo"
    base_dir = repo_root / "backend"
    base_dir.mkdir(parents=True)

    assert resolve_runtime_data_dir(base_dir=base_dir) == (repo_root / "backend" / "data").resolve()


def test_resolve_runtime_data_dir_uses_localappdata_for_desktop(monkeypatch, tmp_path):
    monkeypatch.delenv("RAGINT_DATA_DIR", raising=False)
    monkeypatch.setenv("RAGINT_DESKTOP", "1")
    monkeypatch.setenv("LOCALAPPDATA", str((tmp_path / "LocalAppData").resolve()))

    repo_root = tmp_path / "repo"
    base_dir = repo_root / "backend"
    base_dir.mkdir(parents=True)

    got = resolve_runtime_data_dir(base_dir=base_dir)
    assert got == (tmp_path / "LocalAppData" / "RagInt" / "data").resolve()


def test_ensure_runtime_data_seeded_copies_template_and_skips_runtime_artifacts(tmp_path):
    template_dir = tmp_path / "template"
    template_dir.mkdir()
    (template_dir / "pad_products.db").write_text("db", encoding="utf-8")
    (template_dir / "offline").mkdir()
    (template_dir / "offline" / "manifest.json").write_text("{}", encoding="utf-8")
    (template_dir / "pad_product_audio").mkdir()
    (template_dir / "pad_product_audio" / "clip.mp3").write_text("audio", encoding="utf-8")
    (template_dir / "logs").mkdir()
    (template_dir / "logs" / "app.log").write_text("ignore", encoding="utf-8")
    (template_dir / "recordings").mkdir()
    (template_dir / "recordings" / "recordings.db").write_text("keep", encoding="utf-8")
    (template_dir / "recordings" / "rec_old").mkdir()
    (template_dir / "recordings" / "rec_old" / "audio.wav").write_text("skip", encoding="utf-8")

    data_dir = tmp_path / "runtime"
    ensure_runtime_data_seeded(data_dir=data_dir, template_dir=template_dir)

    assert (data_dir / "pad_products.db").read_text(encoding="utf-8") == "db"
    assert (data_dir / "offline" / "manifest.json").exists()
    assert (data_dir / "pad_product_audio" / "clip.mp3").exists()
    assert (data_dir / "recordings" / "recordings.db").exists()
    assert not (data_dir / "logs" / "app.log").exists()
    assert not (data_dir / "recordings" / "rec_old").exists()
    assert (data_dir / ".ragint_seed.json").exists()


def test_ensure_runtime_data_seeded_preserves_existing_runtime_data(tmp_path):
    template_dir = tmp_path / "template"
    template_dir.mkdir()
    (template_dir / "pad_products.db").write_text("template-db", encoding="utf-8")

    data_dir = tmp_path / "runtime"
    data_dir.mkdir()
    (data_dir / "pad_products.db").write_text("live-db", encoding="utf-8")

    ensure_runtime_data_seeded(data_dir=data_dir, template_dir=template_dir)

    assert (data_dir / "pad_products.db").read_text(encoding="utf-8") == "live-db"
    marker = data_dir / ".ragint_seed.json"
    assert marker.exists()
    assert "existing_data_preserved" in marker.read_text(encoding="utf-8")
