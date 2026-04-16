from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import sys

import pandas as pd


@dataclass(frozen=True)
class HallConfig:
    name: str
    start: int
    end: int
    filename: str


HALLS = (
    HallConfig("心内介植入展厅", 1, 25, "01-心内介植入展厅.md"),
    HallConfig("心脏植入展厅", 26, 53, "02-心脏植入展厅.md"),
    HallConfig("外周介植入展厅", 54, 80, "03-外周介植入展厅.md"),
    HallConfig("神经介植入展厅", 81, 97, "04-神经介植入展厅.md"),
    HallConfig("外泌体与超声聚焦展厅", 98, 107, "05-外泌体与超声聚焦展厅.md"),
    HallConfig("骨科与泌尿产品展厅", 108, 127, "06-骨科与泌尿产品展厅.md"),
    HallConfig("非介入类产品展厅", 128, 138, "07-非介入类产品展厅.md"),
    HallConfig("医疗标准件展厅", 139, 165, "08-医疗标准件展厅.md"),
)

SOURCE_COLUMNS = {
    "所在展柜",
    "产品序号",
    "中文名称",
    "英文名称",
    "产品介绍（/优势特点）",
    "注册证名称",
    "注册证号",
    "生效时间",
    "所属公司",
}

OUTPUT_COLUMNS = (
    ("产品名称", "中文名称"),
    ("英文名称", "英文名称"),
    ("产品介绍（/优势特点）", "产品介绍（/优势特点）"),
    ("注册证名称", "注册证名称"),
    ("注册证号", "注册证号"),
    ("生效时间", "生效时间"),
    ("所属公司", "所属公司"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Shanghai hall product tables to Markdown.")
    parser.add_argument("--input", required=True, help="Path to the source xlsx file.")
    parser.add_argument("--output-dir", required=True, help="Directory for generated Markdown files.")
    return parser.parse_args()


def parse_base_seq(value: str) -> int:
    match = re.match(r"\s*(\d+)", str(value))
    if not match:
        raise ValueError(f"无法解析产品序号: {value!r}")
    return int(match.group(1))


def hall_for(base_seq: int) -> HallConfig:
    for hall in HALLS:
        if hall.start <= base_seq <= hall.end:
            return hall
    raise ValueError(f"产品序号 {base_seq} 不在任何展厅范围内。")


def normalize_text(value: str) -> str:
    text = str(value).strip()
    if not text:
        return "-"
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("|", r"\|")
    text = text.replace("\n", "<br>")
    return text


def load_rows(input_path: Path) -> pd.DataFrame:
    df = pd.read_excel(input_path, dtype=str).fillna("")
    missing = sorted(SOURCE_COLUMNS - set(df.columns))
    if missing:
        missing_text = ", ".join(missing)
        raise SystemExit(f"源表缺少必要字段: {missing_text}")

    df["所在展柜"] = df["所在展柜"].replace("", pd.NA).ffill().fillna("")
    df = df[(df["产品序号"].str.strip() != "") & (df["中文名称"].str.strip() != "")].copy()
    df["__row_order"] = range(len(df))
    df["__base_seq"] = df["产品序号"].map(parse_base_seq)
    df["__hall_name"] = df["__base_seq"].map(lambda value: hall_for(value).name)

    if df.empty:
        raise SystemExit("源表中没有可导出的有效产品行。")

    return df


def render_table(rows: pd.DataFrame) -> list[str]:
    header = [label for label, _ in OUTPUT_COLUMNS]
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * len(header)) + " |",
    ]
    for _, row in rows.iterrows():
        values = [normalize_text(row[source]) for _, source in OUTPUT_COLUMNS]
        lines.append("| " + " | ".join(values) + " |")
    return lines


def write_hall_file(output_dir: Path, input_path: Path, hall: HallConfig, rows: pd.DataFrame) -> None:
    lines = [
        f"# {hall.name}",
        "",
        f"- 数据来源: `{input_path}`",
        f"- 覆盖序号范围: `{hall.start}-{hall.end}`",
        f"- 导出条目数: `{len(rows)}`",
        "",
    ]
    lines.extend(render_table(rows))
    lines.append("")
    (output_dir / hall.filename).write_text("\n".join(lines), encoding="utf-8")


def write_index(output_dir: Path, input_path: Path, hall_summaries: list[tuple[HallConfig, int]]) -> None:
    total = sum(count for _, count in hall_summaries)
    lines = [
        "# 上海展厅产品 Markdown 表格",
        "",
        f"- 数据来源: `{input_path}`",
        f"- 展厅数量: `{len(hall_summaries)}`",
        f"- 导出条目总数: `{total}`",
        f"- 导出字段: `产品名称、英文名称、产品介绍（/优势特点）、注册证名称、注册证号、生效时间、所属公司`",
        "",
        "| 展厅 | 序号范围 | 条目数 | 文件 |",
        "| --- | --- | --- | --- |",
    ]
    for hall, count in hall_summaries:
        lines.append(f"| {hall.name} | {hall.start}-{hall.end} | {count} | [{hall.filename}]({hall.filename}) |")
    lines.append("")
    (output_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_path.exists():
        raise SystemExit(f"输入文件不存在: {input_path}")
    if input_path.suffix.lower() != ".xlsx":
        raise SystemExit(f"输入文件必须是 .xlsx: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    rows = load_rows(input_path)
    hall_summaries: list[tuple[HallConfig, int]] = []
    for hall in HALLS:
        hall_rows = rows[rows["__hall_name"] == hall.name].sort_values("__row_order")
        if hall_rows.empty:
            raise SystemExit(f"展厅 {hall.name} 没有导出到任何产品行。")
        write_hall_file(output_dir, input_path, hall, hall_rows)
        hall_summaries.append((hall, len(hall_rows)))

    write_index(output_dir, input_path, hall_summaries)

    print(f"source: {input_path}")
    print(f"output_dir: {output_dir}")
    print("generated_files:")
    for hall, count in hall_summaries:
        print(f"- {hall.filename}: {count}")
    print("- README.md")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
