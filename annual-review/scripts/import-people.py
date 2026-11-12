"""Export the annual-review mock workbook without third-party Python packages."""

import argparse
import json
import posixpath
import re
import xml.etree.ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
HEADERS = ["序号", "事项", "数据", "单位", "姓名1", "工号1", "姓名2", "工号2"]


def export(workbook, output):
    with ZipFile(workbook) as archive:
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next(
            (item for item in book.findall("s:sheets/s:sheet", NS) if item.get("name") == "榜样数据"),
            None,
        )
        if sheet is None:
            raise ValueError("Missing worksheet: 榜样数据")
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(
            item.get("Target")
            for item in relationships
            if item.get("Id") == sheet.get(f"{{{REL_NS}}}id")
        )
        sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(node.itertext())
                for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)
            ]
        styles = ET.fromstring(archive.read("xl/styles.xml"))
        formats = {9: "0%", 10: "0.00%"}
        formats.update(
            (int(item.get("numFmtId")), item.get("formatCode"))
            for item in styles.findall("s:numFmts/s:numFmt", NS)
        )
        cells_formats = [
            formats.get(int(item.get("numFmtId", "0")), "General")
            for item in styles.findall("s:cellXfs/s:xf", NS)
        ]
        rows = ET.fromstring(archive.read(sheet_path)).findall("s:sheetData/s:row", NS)

        def text(cell):
            if cell is None:
                return ""
            if cell.get("t") == "inlineStr":
                return "".join(cell.find("s:is", NS).itertext()).strip()
            value = cell.findtext("s:v", default="", namespaces=NS)
            return strings[int(value)].strip() if cell.get("t") == "s" and value else value.strip()

        def row_cells(row):
            return {re.sub(r"\d", "", cell.get("r")): cell for cell in row}

        first = row_cells(rows[0])
        if [text(first.get(col)) for col in "ABCDEFGH"] != HEADERS:
            raise ValueError("Workbook columns must be: " + ", ".join(HEADERS))

        portraits, items, sequences = {}, [], set()
        for row in rows[1:]:
            cells = row_cells(row)
            values = [text(cells.get(col)) for col in "ABCDEFGH"]
            if not any(values):
                continue
            sequence, label, value, unit, *names = values
            if not sequence or not label or not value:
                raise ValueError(f"Incomplete item at row {row.get('r')}")
            if sequence in sequences:
                raise ValueError(f"Duplicate item number: {sequence}")
            sequences.add(sequence)
            value_cell = cells["C"]
            number_format = cells_formats[int(value_cell.get("s", "0"))]
            if "%" in number_format and value_cell.get("t") not in ("s", "inlineStr"):
                decimals = re.search(r"0\.([0#]+)%", number_format)
                places = len(decimals.group(1)) if decimals else 0
                value = format(
                    (Decimal(value) * 100).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP),
                    f".{places}f",
                )
                unit = unit or "%"
            winners = []
            for name, employee_id in zip(names[::2], names[1::2]):
                if not name and not employee_id:
                    continue
                if not name or not employee_id:
                    raise ValueError(f"Name and employee ID must be paired at row {row.get('r')}")
                portrait = portraits.setdefault(employee_id, len(portraits))
                winners.append({"name": name, "employeeId": employee_id, "portrait": portrait})
            if not winners:
                raise ValueError(f"Missing winner at row {row.get('r')}")
            items.append(
                {"id": f"honor-{sequence}", "sourceRow": int(row.get("r")), "label": label,
                 "value": value, "unit": unit, "winners": winners}
            )

    output.write_text(
        "// Generated from mock/榜样数据.xlsx, worksheet 榜样数据.\n"
        "// Regenerate with: python annual-review/scripts/import-people.py\n"
        "(function(root, factory) {\n"
        "  const people = Object.freeze(factory());\n"
        "  if (typeof module !== 'undefined' && module.exports) module.exports = people;\n"
        "  else root.AnnualPeopleMock = people;\n"
        "})(typeof window !== 'undefined' ? window : globalThis, () => "
        + json.dumps(items, ensure_ascii=False, indent=2)
        + ");\n",
        encoding="utf-8",
    )
    print(f"Exported {len(items)} items, {sum(len(item['winners']) for item in items)} winner entries, "
          f"{len(portraits)} employees -> {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=ROOT / "mock" / "榜样数据.xlsx")
    parser.add_argument("--output", type=Path, default=ROOT / "annual-review" / "people.mock.js")
    args = parser.parse_args()
    export(args.workbook, args.output)
