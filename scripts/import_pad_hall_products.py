from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from pathlib import Path
import re

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.services.pad_product_store import PadProductStore  # noqa: E402


@dataclass(frozen=True)
class HallSpec:
    hall_id: str
    source_name: str
    hall_name: str


HALL_SPECS = (
    HallSpec("hall_01", "心内介植入1", "心内介植入展厅"),
    HallSpec("hall_02", "心内介植入2", "心脏植入展厅"),
    HallSpec("hall_03", "外周介植入", "外周介植入展厅"),
    HallSpec("hall_04", "神经介植入", "神经介植入展厅"),
    HallSpec("hall_05", "外泌体&超声聚焦", "外泌体与超声聚焦展厅"),
    HallSpec("hall_06", "骨科&泌尿", "骨科与泌尿产品展厅"),
    HallSpec("hall_07", "非介入类产品", "非介入类产品展厅"),
    HallSpec("hall_08", "医疗标准件", "医疗标准件展厅"),
)

HALL_SPEC_BY_SOURCE = {item.source_name: item for item in HALL_SPECS}
HALL_SPEC_BY_ID = {item.hall_id: item for item in HALL_SPECS}

REQUIRED_COLUMNS = (
    "所在展柜",
    "产品序号",
    "中文名称",
    "英文名称",
    "产品介绍（/优势特点）",
    "注册证名称",
    "注册证号",
    "生效时间",
    "所属公司",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import hall products for the pad product explainer domain.")
    parser.add_argument("--input", default="", help="Path to the source xlsx file. Defaults to tobedeleted/上海展厅展品列表.xlsx")
    parser.add_argument("--db-path", default="", help="Override SQLite db path. Defaults to backend/data/pad_products.db")
    parser.add_argument("--audio-root", default="", help="Override audio asset root. Defaults to backend/data/pad_product_audio")
    parser.add_argument("--image-root", default="", help="Override image asset root. Defaults to backend/data/pad_product_images")
    parser.add_argument(
        "--binding",
        action="append",
        default=[],
        help="Optional pad binding in the form client_id=hall_id. Can be passed multiple times.",
    )
    return parser.parse_args()


def resolve_input_path(raw_input: str) -> Path:
    text = str(raw_input or "").strip()
    if text:
        return Path(text).resolve()
    candidates = [p for p in (REPO_ROOT / "tobedeleted").glob("*.xlsx") if not p.name.startswith("~$")]
    for candidate in candidates:
        if "上海展厅展品列表" in candidate.name:
            return candidate.resolve()
    if candidates:
        return candidates[0].resolve()
    raise SystemExit("source_xlsx_not_found")


def parse_base_seq(value: str) -> int:
    match = re.match(r"\s*(\d+)", str(value or ""))
    if not match:
        raise ValueError(f"bad_product_seq:{value!r}")
    return int(match.group(1))


def normalize_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def load_rows(input_path: Path) -> pd.DataFrame:
    if not input_path.exists():
        raise SystemExit(f"source_xlsx_missing:{input_path}")
    df = pd.read_excel(input_path, dtype=str).fillna("")
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise SystemExit(f"missing_columns:{','.join(missing)}")

    df["所在展柜"] = df["所在展柜"].replace("", pd.NA).ffill().fillna("")
    df = df[(df["产品序号"].astype(str).str.strip() != "") & (df["中文名称"].astype(str).str.strip() != "")].copy()
    if df.empty:
        raise SystemExit("no_products_found")
    return df


def build_import_payloads(df: pd.DataFrame) -> dict[str, list[dict]]:
    rows_by_hall: dict[str, list[dict]] = {spec.hall_id: [] for spec in HALL_SPECS}
    grouped = {}
    for _, row in df.iterrows():
        source_name = normalize_text(row.get("所在展柜"))
        spec = HALL_SPEC_BY_SOURCE.get(source_name)
        if spec is None:
            raise SystemExit(f"unknown_hall_source:{source_name}")
        grouped.setdefault(spec.hall_id, []).append(row)

    updated_at_ms = int(time.time() * 1000)
    for spec in HALL_SPECS:
        hall_rows = grouped.get(spec.hall_id, [])
        if not hall_rows:
            raise SystemExit(f"hall_has_no_products:{spec.hall_id}")
        payloads = []
        for index, row in enumerate(hall_rows, start=1):
            base_seq = parse_base_seq(row.get("产品序号"))
            payloads.append(
                {
                    "product_id": f"product_{base_seq:03d}",
                    "sort_order": index,
                    "product_name": normalize_text(row.get("中文名称")),
                    "product_name_en": normalize_text(row.get("英文名称")),
                    "intro_text": normalize_text(row.get("产品介绍（/优势特点）")),
                    "registration_name": normalize_text(row.get("注册证名称")),
                    "registration_number": normalize_text(row.get("注册证号")),
                    "effective_date": normalize_text(row.get("生效时间")),
                    "company": normalize_text(row.get("所属公司")),
                    "updated_at_ms": updated_at_ms,
                }
            )
        rows_by_hall[spec.hall_id] = payloads
    return rows_by_hall


def parse_bindings(raw_bindings: list[str]) -> list[tuple[str, HallSpec]]:
    out = []
    for raw in raw_bindings or []:
        text = str(raw or "").strip()
        if not text:
            continue
        client_id, sep, hall_id = text.partition("=")
        client_id = client_id.strip()
        hall_id = hall_id.strip()
        if not sep or not client_id or not hall_id:
            raise SystemExit(f"bad_binding:{text}")
        spec = HALL_SPEC_BY_ID.get(hall_id)
        if spec is None:
            raise SystemExit(f"unknown_hall_id:{hall_id}")
        out.append((client_id, spec))
    return out


def build_store(db_path: str, audio_root: str, image_root: str) -> PadProductStore:
    resolved_db_path = Path(db_path).resolve() if str(db_path or "").strip() else (REPO_ROOT / "backend" / "data" / "pad_products.db")
    resolved_audio_root = Path(audio_root).resolve() if str(audio_root or "").strip() else (REPO_ROOT / "backend" / "data" / "pad_product_audio")
    resolved_image_root = Path(image_root).resolve() if str(image_root or "").strip() else (REPO_ROOT / "backend" / "data" / "pad_product_images")
    return PadProductStore(resolved_db_path, resolved_audio_root, resolved_image_root)


def run_import(*, input_path: Path, store: PadProductStore, bindings: list[tuple[str, HallSpec]]) -> dict:
    rows = load_rows(input_path)
    payloads = build_import_payloads(rows)

    summaries = []
    for spec in HALL_SPECS:
        result = store.replace_hall_products(hall_id=spec.hall_id, products=payloads[spec.hall_id])
        summaries.append(
            {
                "hall_id": spec.hall_id,
                "hall_name": spec.hall_name,
                "product_count": int(result.get("imported_count") or 0),
                "deleted_count": int(result.get("deleted_count") or 0),
            }
        )

    binding_results = []
    for client_id, spec in bindings:
        binding = store.upsert_hall_binding(client_id=client_id, hall_id=spec.hall_id, hall_name=spec.hall_name, enabled=True)
        binding_results.append(binding)

    return {
        "input_path": str(input_path),
        "hall_summaries": summaries,
        "bindings": binding_results,
    }


def main() -> int:
    args = parse_args()
    input_path = resolve_input_path(args.input)
    bindings = parse_bindings(args.binding)
    store = build_store(args.db_path, args.audio_root, args.image_root)
    result = run_import(input_path=input_path, store=store, bindings=bindings)

    print(f"source: {result['input_path']}")
    print("hall_summaries:")
    for item in result["hall_summaries"]:
        print(f"- {item['hall_id']} {item['hall_name']}: {item['product_count']} products")
    if result["bindings"]:
        print("bindings:")
        for binding in result["bindings"]:
            print(f"- {binding['client_id']} -> {binding['hall_id']} ({binding['hall_name']})")
    else:
        print("bindings: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
