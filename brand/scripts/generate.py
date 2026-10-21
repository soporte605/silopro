#!/usr/bin/env python3
"""
Generador paramétrico de la identidad visual de SiloPro.

Produce, para cada concepto de logotipo, los diez entregables solicitados en
SVG editable (formas simples, sin texto vivo: el logotipo se convierte a
contornos a partir de Geist, licencia SIL OFL 1.1).

Uso:
    python3 brand/scripts/generate.py            # genera SVG
    python3 brand/scripts/generate.py --preview  # además, PNG de revisión

Dependencias (solo para regenerar): fonttools, uharfbuzz; cairosvg para --preview.

IMPORTANTE: los colores de PALETTE son PROVISIONALES. Se tomaron de las
etiquetas meta del sitio elikarsystems.com (theme-color y TileColor) y no
han sido confirmados por ElikarSystems. Al recibir los valores oficiales,
cambie PALETTE y vuelva a ejecutar el script.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "source-fonts"
OUT = ROOT / "concepts"

# --------------------------------------------------------------------------
# Paleta PROVISIONAL (ver docstring). Un único lugar para sustituirla.
# --------------------------------------------------------------------------
PALETTE = {
    "navy": "#002150",  # provisional: meta msapplication-TileColor de elikarsystems.com
    "green": "#67BE28",  # provisional: meta theme-color de elikarsystems.com
    "slate": "#5B6B82",  # neutro de apoyo (descriptor)
    "paper": "#F7F9FC",  # fondo claro de presentación
    "ink": "#0B1220",  # fondo oscuro de presentación
    "white": "#FFFFFF",
    "black": "#000000",
}


@dataclass(frozen=True)
class Colors:
    primary: str
    accent: str
    text: str
    secondary: str
    cutout: str  # color de los recortes cuando no se usan máscaras

    @staticmethod
    def light() -> "Colors":
        p = PALETTE
        return Colors(p["navy"], p["green"], p["navy"], p["slate"], p["white"])

    @staticmethod
    def dark() -> "Colors":
        p = PALETTE
        return Colors(p["white"], p["green"], p["white"], "#AAB6C8", p["ink"])

    @staticmethod
    def mono(color: str) -> "Colors":
        return Colors(color, color, color, color, "none")


# --------------------------------------------------------------------------
# Tipografía → contornos
# --------------------------------------------------------------------------
class Font:
    def __init__(self, filename: str):
        path = FONTS / filename
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.upem = self.tt["head"].unitsPerEm
        self.cap = self.tt["OS/2"].sCapHeight
        blob = hb.Blob.from_file_path(str(path))
        self.hb_font = hb.Font(hb.Face(blob))

    def shape(self, text: str, tracking: float = 0.0):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, {"kern": True, "liga": False})
        order = self.tt.getGlyphOrder()
        out, x = [], 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((order[info.codepoint], x + pos.x_offset))
            x += pos.x_advance + tracking * self.upem
        return out, x - tracking * self.upem

    def path(self, text: str, size: float, x: float, baseline: float, tracking: float = 0.0):
        """Devuelve (d, ancho) para `text` con altura de mayúscula `size`."""
        scale = size / self.cap
        glyphs, width = self.shape(text, tracking)
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        for name, gx in glyphs:
            t = TransformPen(pen, (scale, 0, 0, -scale, x + gx * scale, baseline))
            self.glyphs[name].draw(t)
        return pen.getCommands(), width * scale


SEMIBOLD = Font("Geist-SemiBold.ttf")
REGULAR = Font("Geist-Regular.ttf")
MEDIUM = Font("Geist-Medium.ttf")


# --------------------------------------------------------------------------
# Utilidades geométricas
# --------------------------------------------------------------------------
def rrect(x, y, w, h, r) -> str:
    r = min(r, w / 2, h / 2)
    return (
        f"M{x + r:g},{y:g}H{x + w - r:g}A{r:g},{r:g} 0 0 1 {x + w:g},{y + r:g}"
        f"V{y + h - r:g}A{r:g},{r:g} 0 0 1 {x + w - r:g},{y + h:g}"
        f"H{x + r:g}A{r:g},{r:g} 0 0 1 {x:g},{y + h - r:g}"
        f"V{y + r:g}A{r:g},{r:g} 0 0 1 {x + r:g},{y:g}Z"
    )


def fill(d: str, color: str, rule: str | None = None) -> str:
    extra = f' fill-rule="{rule}"' if rule else ""
    return f'<path d="{d}" fill="{color}"{extra}/>'


# --------------------------------------------------------------------------
# Conceptos. Cada función dibuja el isotipo en una caja de 64×64.
# `simple=True` produce la versión reducida para tamaños pequeños.
# --------------------------------------------------------------------------
def mark_silo(c: Colors, simple: bool = False) -> str:
    """A · Silo de cajones: un silo construido con cajones apilados."""
    x, w = 14, 36
    parts = []
    if simple:
        # Cúpula + dos cuerpos, sin tiradores, separaciones más amplias.
        parts.append(fill(f"M{x},22A18,13 0 0 1 {x + w},22Z", c.primary))
        parts.append(fill(rrect(x, 26, w, 14, 2.5), c.accent))
        parts.append(fill(rrect(x, 44, w, 14, 2.5), c.primary))
        return "".join(parts)
    parts.append(fill(f"M{x},19A18,12 0 0 1 {x + w},19Z", c.primary))
    bands = [(22, c.primary), (35, c.accent), (48, c.primary)]
    for y, color in bands:
        # Cuerpo del cajón con tirador recortado (regla evenodd → editable y
        # correcto sobre cualquier fondo).
        d = rrect(x, y, w, 10, 2) + rrect(x + w / 2 - 5, y + 3.8, 10, 2.4, 1.2)
        parts.append(fill(d, color, "evenodd"))
    return "".join(parts)


def mark_shelf(c: Colors, simple: bool = False) -> str:
    """B · S-Estante: una S trazada como dos estantes con un artículo ubicado."""
    sw = 9 if simple else 8
    pts = "M50,12H18Q14,12 14,16V28Q14,32 18,32H46Q50,32 50,36V48Q50,52 46,52H14"
    if simple:
        pts = "M50,12H14V32H50V52H14"
    path = (
        f'<path d="{pts}" fill="none" stroke="{c.primary}" stroke-width="{sw}" '
        f'stroke-linejoin="round" stroke-linecap="butt"/>'
    )
    item = fill(rrect(32, 18.5, 11, 9, 2) if not simple else rrect(30, 18, 14, 10, 2), c.accent)
    return path + item


def mark_coord(c: Colors, simple: bool = False) -> str:
    """C · Coordenada: cuadrícula de compartimentos dentro de un visor."""
    parts = []
    sw = 5 if simple else 4
    arm = 13 if simple else 12
    for cx, cy, sx, sy in [(8, 8, 1, 1), (56, 8, -1, 1), (8, 56, 1, -1), (56, 56, -1, -1)]:
        d = f"M{cx},{cy + sy * arm}V{cy}H{cx + sx * arm}"
        parts.append(
            f'<path d="{d}" fill="none" stroke="{c.primary}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    if simple:
        cells = [(20, 20), (34, 20), (20, 34), (34, 34)]
        for i, (x, y) in enumerate(cells):
            parts.append(fill(rrect(x, y, 10, 10, 2), c.accent if i == 1 else c.primary))
    else:
        for r in range(3):
            for col in range(3):
                x, y = 19 + col * 9.5, 19 + r * 9.5
                parts.append(
                    fill(rrect(x, y, 7, 7, 1.5), c.accent if (r, col) == (1, 2) else c.primary)
                )
    return "".join(parts)


CONCEPTS = {
    "a-silo-de-cajones": ("A · Silo de cajones", mark_silo),
    "b-s-estante": ("B · S-Estante", mark_shelf),
    "c-coordenada": ("C · Coordenada", mark_coord),
}

# Límites horizontales visibles de cada isotipo dentro de la caja de 64, para
# que la separación con el logotipo sea ópticamente igual en los tres conceptos.
MARK_BOUNDS = {mark_silo: (14, 50), mark_shelf: (10, 54), mark_coord: (5.5, 58.5)}


# --------------------------------------------------------------------------
# Composición de variantes
# --------------------------------------------------------------------------
def svg(w: float, h: float, body: str, title: str, bg: str | None = None, extra: str = "") -> str:
    background = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" '
        f'width="{w:g}" height="{h:g}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{extra}{background}{body}</svg>\n"
    )


def group(body: str, tx: float = 0, ty: float = 0, s: float = 1) -> str:
    return f'<g transform="translate({tx:g} {ty:g}) scale({s:g})">{body}</g>'


def wordmark(c: Colors, cap: float, x: float, baseline: float) -> tuple[str, float]:
    d1, w1 = SEMIBOLD.path("Silo", cap, x, baseline, tracking=-0.01)
    d2, w2 = REGULAR.path("Pro", cap, x + w1 + cap * 0.05, baseline, tracking=-0.005)
    return fill(d1, c.text) + fill(d2, c.text), w1 + cap * 0.05 + w2


def descriptor(c: Colors, cap: float, x: float, baseline: float) -> tuple[str, float]:
    d, w = MEDIUM.path("INVENTARIO INTELIGENTE", cap, x, baseline, tracking=0.12)
    return fill(d, c.secondary), w


def horizontal(mark, c: Colors, with_descriptor: bool = False) -> tuple[str, float, float]:
    """Isotipo (64) + logotipo. Devuelve cuerpo, ancho y alto."""
    pad = 8
    cap = 25
    gap = 15
    x0, x1 = MARK_BOUNDS[mark]
    mark_body = group(mark(c), pad - x0, pad)
    tx = pad + (x1 - x0) + gap
    if with_descriptor:
        word, ww = wordmark(c, cap, tx, pad + 34)
        desc, dw = descriptor(c, 6.4, tx + 1, pad + 52)
        body, width = mark_body + word + desc, tx + max(ww, dw) + pad
    else:
        word, ww = wordmark(c, cap, tx, pad + 32 + cap / 2)
        body, width = mark_body + word, tx + ww + pad
    return body, width, 64 + pad * 2


def vertical(mark, c: Colors) -> tuple[str, float, float]:
    cap = 20
    pad = 8
    word, ww = wordmark(c, cap, 0, 0)
    width = max(ww, 96) + pad * 2
    mark_size = 80
    body = group(mark(c), (width - mark_size) / 2, pad, mark_size / 64)
    baseline = pad + mark_size + 14 + cap
    word, _ = wordmark(c, cap, (width - ww) / 2, baseline)
    return body + word, width, baseline + pad + 2


def app_icon(mark, size: int = 512) -> str:
    c = Colors.dark()
    r = size * 0.22
    bg = f'<rect width="{size}" height="{size}" rx="{r:g}" fill="{PALETTE["navy"]}"/>'
    inner = size * 0.62
    body = bg + group(mark(c), (size - inner) / 2, (size - inner) / 2, inner / 64)
    return svg(size, size, body, "SiloPro — icono de aplicación")


def favicon(mark) -> str:
    """Favicon SVG con adaptación automática a modo oscuro del navegador."""
    light, dark = Colors.light(), Colors.dark()
    body = mark(Colors("var(--p)", "var(--a)", "", "", ""), True)
    style = (
        f"<style>:root{{--p:{light.primary};--a:{light.accent}}}"
        f"@media (prefers-color-scheme:dark){{:root{{--p:{dark.primary};--a:{dark.accent}}}}}</style>"
    )
    return svg(64, 64, body, "SiloPro", extra=style)


def build(preview: bool) -> list[Path]:
    written: list[Path] = []

    def write(rel: Path, content: str):
        rel.parent.mkdir(parents=True, exist_ok=True)
        rel.write_text(content, encoding="utf-8")
        written.append(rel)

    light, dark = Colors.light(), Colors.dark()
    for slug, (title, mark) in CONCEPTS.items():
        d = OUT / slug
        b, w, h = horizontal(mark, light, with_descriptor=True)
        write(d / "01-principal.svg", svg(w, h, b, f"SiloPro {title} — principal"))
        b, w, h = horizontal(mark, light)
        write(d / "02-horizontal.svg", svg(w, h, b, f"SiloPro {title} — horizontal"))
        b, w, h = vertical(mark, light)
        write(d / "03-vertical.svg", svg(w, h, b, f"SiloPro {title} — vertical"))
        write(d / "04-isotipo.svg", svg(64, 64, mark(light), f"SiloPro {title} — isotipo"))
        b, w, h = horizontal(mark, Colors.mono(PALETTE["black"]))
        write(d / "05-monocromatico-negro.svg", svg(w, h, b, f"SiloPro {title} — monocromático"))
        b, w, h = horizontal(mark, Colors.mono(PALETTE["white"]))
        write(
            d / "05-monocromatico-blanco.svg",
            svg(w, h, b, f"SiloPro {title} — monocromático blanco", bg=PALETTE["black"]),
        )
        b, w, h = horizontal(mark, light)
        write(d / "06-fondo-claro.svg", svg(w, h, b, f"SiloPro {title} — fondo claro", PALETTE["paper"]))
        b, w, h = horizontal(mark, dark)
        write(d / "07-fondo-oscuro.svg", svg(w, h, b, f"SiloPro {title} — fondo oscuro", PALETTE["ink"]))
        write(d / "08-favicon.svg", favicon(mark))
        write(d / "09-icono-app.svg", app_icon(mark))
        write(
            d / "10-simplificado.svg",
            svg(64, 64, mark(light, True), f"SiloPro {title} — versión simplificada"),
        )

    if preview:
        render_previews(written)
    return written


def render_previews(files: list[Path]) -> None:
    import cairosvg

    prev = ROOT / "previews"
    prev.mkdir(exist_ok=True)
    for f in files:
        if f.name.startswith("08-"):
            continue  # cairosvg no resuelve var(); se revisa en navegador
        out = prev / f"{f.parent.name}--{f.stem}.png"
        scale = 4 if f.name.startswith(("04", "10")) else 2
        cairosvg.svg2png(url=str(f), write_to=str(out), scale=scale)
    # Prueba de legibilidad a tamaños pequeños: 16, 24 y 32 px.
    for slug in CONCEPTS:
        for size in (16, 24, 32):
            src = OUT / slug / "10-simplificado.svg"
            cairosvg.svg2png(
                url=str(src), write_to=str(prev / f"{slug}--size-{size}.png"),
                output_width=size, output_height=size,
            )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    files = build(args.preview)
    print(f"{len(files)} archivos SVG generados en {OUT.relative_to(ROOT.parent)}")
