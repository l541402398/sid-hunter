"""Build the local HUD font from the official Fusion Pixel 12px release ZIP.

Requires fonttools and brotli. Usage:
python3 design/create-hud-pixel-font.py path/to/font.zip
The generated CSS embeds the font so the existing static server needs no changes.
"""
import argparse
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
public = root / "online/public"
text = "0123456789: 线索公布对抗中休战待开启已结束展开坏人公告栏"
licenses = public / "assets/fonts/sid-hud-pixel"
licenses.mkdir(parents=True, exist_ok=True)
with ZipFile(args.archive) as archive:
    font = TTFont(BytesIO(archive.read("fusion-pixel-12px-proportional-zh_hans.otf.woff2")))
    for source, target in (
        ("OFL.txt", "LICENSE-OFL.txt"),
        ("LICENSES/ark-pixel/OFL.txt", "LICENSE-ARK-PIXEL.txt"),
        ("LICENSES/cubic-11/OFL.txt", "LICENSE-CUBIC-11.txt"),
        ("LICENSES/galmuri/LICENSE.txt", "LICENSE-GALMURI.txt"),
    ):
        license_lines = archive.read(source).decode("utf-8").splitlines()
        (licenses / target).write_text(
            "\n".join(line.rstrip() for line in license_lines) + "\n", encoding="utf-8"
        )

missing = set(text) - {chr(code) for code in font.getBestCmap()}
if missing:
    raise ValueError(f"Missing HUD glyphs: {missing}")
options = subset.Options()
options.name_IDs = ["*"]  # Retain copyright and license metadata in the embedded font.
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
for name_id, name in {1: "SID HUD Pixel", 2: "Regular", 3: "SID HUD Pixel 1.0", 4: "SID HUD Pixel Regular", 6: "SIDHUDPixel-Regular", 16: "SID HUD Pixel", 17: "Regular"}.items():
    font["name"].setName(name, name_id, 3, 1, 0x409)
font.flavor = "woff2"
data = BytesIO()
font.save(data)
css = public / "styles/hud-pixel-font.css"
css.write_text(
    '/* SID HUD subset of Fusion Pixel 12px (OFL-1.1).\n'
    '   Rebuild: design/create-hud-pixel-font.py; licenses: assets/fonts/sid-hud-pixel/. */\n'
    '@font-face{font-family:"SID HUD Pixel";src:url("data:font/woff2;base64,'
    + b64encode(data.getvalue()).decode("ascii")
    + '\") format("woff2");font-style:normal;font-weight:400;font-display:swap}\n',
    encoding="utf-8",
)
print(f"{css}: {len(data.getvalue())} bytes, {len(set(text))} characters")
