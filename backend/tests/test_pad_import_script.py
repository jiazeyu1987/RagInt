from __future__ import annotations

import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pandas as pd
import pytest

from backend.services.pad_product_store import PadProductStore


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "import_pad_hall_products.py"


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"pad_import_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _build_source_xlsx(path: Path) -> None:
    rows = []
    hall_rows = [
        ("心内介植入1", "1", "Alpha 1"),
        ("心内介植入2", "26", "Alpha 2"),
        ("外周介植入", "54", "Alpha 3"),
        ("神经介植入", "81", "Alpha 4"),
        ("外泌体&超声聚焦", "98", "Alpha 5"),
        ("骨科&泌尿", "108", "Alpha 6"),
        ("非介入类产品", "128", "Alpha 7"),
        ("医疗标准件", "139", "Alpha 8"),
    ]
    for hall_name, seq, product_name in hall_rows:
        rows.append(
            {
                "所在展柜": hall_name,
                "产品序号": seq,
                "中文名称": product_name,
                "英文名称": f"{product_name} EN",
                "产品介绍（/优势特点）": f"{product_name} intro",
                "注册证名称": f"{product_name} reg",
                "注册证号": f"REG-{seq}",
                "生效时间": "2026-01-01",
                "所属公司": "YingTai",
            }
        )
    pd.DataFrame(rows).to_excel(path, index=False)


def test_import_script_loads_eight_halls_and_optional_bindings(work_dir: Path):
    source_path = work_dir / "pad_source.xlsx"
    db_path = work_dir / "pad_products.db"
    audio_root = work_dir / "pad_product_audio"
    image_root = work_dir / "pad_product_images"
    _build_source_xlsx(source_path)

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--input",
            str(source_path),
            "--db-path",
            str(db_path),
            "--audio-root",
            str(audio_root),
            "--image-root",
            str(image_root),
            "--binding",
            "pad-a=hall_01",
            "--binding",
            "pad-h=hall_08",
        ],
        cwd=str(Path(__file__).resolve().parents[2]),
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr or completed.stdout
    assert "hall_01" in completed.stdout
    assert "hall_08" in completed.stdout
    assert "pad-a -> hall_01" in completed.stdout

    store = PadProductStore(db_path, audio_root, image_root)
    hall_01_products = store.list_hall_products("hall_01")
    hall_08_products = store.list_hall_products("hall_08")
    assert len(hall_01_products) == 1
    assert len(hall_08_products) == 1
    assert hall_01_products[0]["product_id"] == "product_001"
    assert hall_08_products[0]["product_id"] == "product_139"

    binding_a = store.get_binding("pad-a")
    binding_h = store.get_binding("pad-h")
    assert binding_a is not None
    assert binding_a["hall_id"] == "hall_01"
    assert binding_a["hall_name"] == "心内介植入展厅"
    assert binding_h is not None
    assert binding_h["hall_id"] == "hall_08"
    assert binding_h["hall_name"] == "医疗标准件展厅"
