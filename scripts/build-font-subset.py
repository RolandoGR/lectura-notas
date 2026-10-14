"""Recorta la fuente musical Bravura a los símbolos que usa la app.

La fuente completa pesa unos 240 KB y la app espera a tenerla antes de mostrarse; recortada a los
símbolos que se dibujan ocupa unos pocos KB. Como la licencia SIL OFL reserva el nombre «Bravura»
para la fuente original, la versión recortada se publica con otro nombre.

Requiere fontTools (pip install fonttools). Uso: python scripts/build-font-subset.py
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'node_modules/@vexflow-fonts/bravura/bravura.otf'
TARGET = ROOT / 'src/assets/notas-glifos.woff'
FAMILY = 'Notas Glifos'

# Símbolos SMuFL que dibuja la app: claves de Sol, Do y Fa, cabezas de nota, sostenido y bemol.
GLYPHS = {
    0xE050: 'clave de Sol',
    0xE05C: 'clave de Do',
    0xE062: 'clave de Fa',
    0xE0A2: 'redonda',
    0xE0A4: 'cabeza de negra',
    0xE260: 'bemol',
    0xE262: 'sostenido',
}

options = subset.Options()
options.flavor = 'woff'
options.layout_features = []
options.name_IDs = []
options.notdef_outline = False

font = TTFont(SOURCE)
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=GLYPHS.keys())
subsetter.subset(font)

# Nombre nuevo para la versión modificada (requisito de la licencia OFL).
names = font['name']
names.names = []
for name_id, value in {1: FAMILY, 2: 'Regular', 3: f'{FAMILY};1.0', 4: FAMILY, 6: FAMILY.replace(' ', '')}.items():
    names.setName(value, name_id, 3, 1, 0x409)
    names.setName(value, name_id, 1, 0, 0)

TARGET.parent.mkdir(parents=True, exist_ok=True)
subset.save_font(font, str(TARGET), options)
print(f'{TARGET.relative_to(ROOT)}: {TARGET.stat().st_size} bytes, {len(GLYPHS)} símbolos')
