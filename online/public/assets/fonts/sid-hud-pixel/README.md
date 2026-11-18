# SID HUD Pixel

Local subset of [Fusion Pixel 12px proportional, Simplified Chinese](https://github.com/TakWolf/fusion-pixel-font), release `2026.11.10`, renamed to SID HUD Pixel. Copyright (c) 2022, TakWolf. Licensed under SIL Open Font License 1.1; bundled license notices also cover the upstream Ark Pixel, Cubic 11 and Galmuri glyph sources.

Source archive: https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.11.10/fusion-pixel-font-12px-proportional-otf.woff2-v2026.11.10.zip

Rebuild with Python 3, fonttools and brotli:

```sh
python3 design/create-hud-pixel-font.py /path/to/fusion-pixel-font-12px-proportional-otf.woff2-v2026.11.10.zip
```

The subset includes the HUD labels, idle/end states, digits and punctuation. Add new labels to `text` in the script before rebuilding. The generated `styles/hud-pixel-font.css` embeds the font; the game never downloads fonts from an external site.
