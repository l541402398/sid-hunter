"""Build the original seven-segment HUD font. Requires fonttools and brotli.

Run from any directory: python3 design/create-digital-font.py
The font contains only digits, colon, and space; other text uses CSS fallbacks.
"""
from pathlib import Path
from base64 import b64encode
from io import BytesIO
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Upright, chamfered segments in a 600 by 1000 unit em.
segments = {
    'a': [(98, 900), (502, 900), (546, 856), (502, 812), (98, 812), (54, 856)],
    'g': [(98, 544), (502, 544), (546, 500), (502, 456), (98, 456), (54, 500)],
    'd': [(98, 188), (502, 188), (546, 144), (502, 100), (98, 100), (54, 144)],
    'f': [(46, 844), (90, 800), (90, 556), (46, 512), (2, 556), (2, 800)],
    'b': [(554, 844), (598, 800), (598, 556), (554, 512), (510, 556), (510, 800)],
    'e': [(46, 488), (90, 444), (90, 200), (46, 156), (2, 200), (2, 444)],
    'c': [(554, 488), (598, 444), (598, 200), (554, 156), (510, 200), (510, 444)],
}
patterns = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd']
order = ['.notdef', 'space'] + [f'digit{n}' for n in range(10)] + ['colon']
glyphs, metrics = {}, {}
for name in order:
    pen = TTGlyphPen(None)
    paths = []
    if name.startswith('digit'):
        paths = [segments[s] for s in patterns[int(name[5:])]]
    elif name == 'colon':
        paths = [[(52, y), (140, y), (140, y + 88), (52, y + 88)] for y in (300, 612)]
    for points in paths:
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    glyphs[name] = pen.glyph()
    metrics[name] = (224 if name == 'colon' else 660, 32 if name == 'colon' else 30)
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(order)
font.setupCharacterMap({32: 'space', 58: 'colon', **{48 + n: f'digit{n}' for n in range(10)}})
font.setupGlyf(glyphs)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=1000, descent=0)
font.setupNameTable({'familyName': 'SID Digital', 'styleName': 'Regular', 'uniqueFontIdentifier': 'SID Digital 1.0', 'fullName': 'SID Digital Regular', 'psName': 'SIDDigital-Regular', 'version': 'Version 1.0', 'copyright': 'Original seven-segment font created for SID-Hunter.'})
font.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0)
font.setupPost()
font.font.recalcTimestamp = False
font.font['head'].created = font.font['head'].modified = 3877286400
font.font.flavor = 'woff2'
data = BytesIO()
font.save(data)
output = Path(__file__).resolve().parents[1] / 'online/public/styles/digital-font.css'
output.write_text(
    '/* Original SID seven-segment font; rebuild with design/create-digital-font.py. */\n'
    '@font-face{font-family:"SID Digital";src:url("data:font/woff2;base64,'
    + b64encode(data.getvalue()).decode('ascii')
    + '\") format("woff2");font-style:normal;font-weight:400;font-display:swap}\n'
)
print(output)
