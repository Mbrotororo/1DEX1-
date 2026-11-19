# Собирает public/fonts/pixelify-sans-ru-{500,700}.woff2 из исходных файлов Pixelify Sans (OFL).
# Запуск (нужны fonttools и brotli): python3 scripts/patch-font.py <папка с pixelify-sans-latin/cyrillic.woff2> public/fonts
# Чинит Pixelify Sans для русского текста: в исходном шрифте нет заглавных «О» и «П»,
# а у «К» лишний штрих. Делает статические начертания (вес 500 и 700) с полным набором букв.
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.boundsPen import BoundsPen

src, out = sys.argv[1], sys.argv[2]
for weight in (500, 700):
    parts = []
    for name in ('latin', 'cyrillic'):
        f = TTFont(f'{src}/pixelify-sans-{name}.woff2')
        f = instancer.instantiateVariableFont(f, {'wght': weight})
        for tag in ('GSUB', 'GPOS', 'GDEF', 'STAT', 'avar', 'MVAR', 'HVAR'):
            if tag in f:
                del f[tag]
        path = f'{out}/.tmp-{name}-{weight}.ttf'
        f.flavor = None
        f.save(path)
        parts.append(path)
    font = Merger().merge(parts)
    for path in parts:
        os.remove(path)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    glyf = font['glyf']
    hmtx = font['hmtx']

    def bounds(g):
        bp = BoundsPen(gs)
        gs[g].draw(bp)
        return bp.bounds

    # «П» = «Г» + её зеркальное отражение (в габаритах латинской H)
    H, GE = cmap[ord('H')], cmap[0x413]
    hx0, _, hx1, _ = bounds(H)
    pen = TTGlyphPen(gs)
    gs[GE].draw(pen)
    gs[GE].draw(ReverseContourPen(TransformPen(pen, (-1, 0, 0, 1, hx0 + hx1, 0))))
    glyf['uni041F'] = pen.glyph()
    hmtx['uni041F'] = hmtx[H]
    font.setGlyphOrder(font.getGlyphOrder() + ['uni041F'])
    font['maxp'].numGlyphs = len(font.getGlyphOrder())
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[0x41E] = cmap[ord('O')]   # О
            table.cmap[0x41F] = 'uni041F'        # П
            table.cmap[0x41A] = cmap[ord('K')]   # К без штриха
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = 'Pixelify Sans RU'
    font.flavor = 'woff2'
    font.save(f'{out}/pixelify-sans-ru-{weight}.woff2')
    print('ok', weight, len(font.getGlyphOrder()), 'glyphs')
