#!/usr/bin/env python3
"""Generate themed SVG illustrations for the 'Low-Bit' ternary sci-fi series.

pocoo palette, deterministic (seeded), no blur filters — glow is faked with
translucent layered circles so ImageMagick rasterizes the hero faithfully for
the og:image. Output -> assets/scifi/*.svg.
"""
import math
import os
import random

BG = "#070b16"
CYAN = "#00d4ff"     # nodes / activation
GREEN = "#00e660"    # +1 edge (live, positive)
PURPLE = "#b48bff"   # -1 edge (live, negative)
DIM = "#1b2740"      # 0 edge (silent)
TEXT = "#c8d4e8"
FAINT = "#5a6b8c"

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "scifi")
os.makedirs(OUT, exist_ok=True)


def glow_dot(x, y, r, color, layers=4):
    """A node with faked bloom: stacked translucent discs, no filter needed."""
    s = []
    for i in range(layers, 0, -1):
        rr = r * (1 + 1.7 * (i - 1))
        op = 0.10 * (layers - i + 1) / layers
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rr:.1f}" fill="{color}" opacity="{op:.3f}"/>')
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}"/>')
    return "".join(s)


def header(w, h):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" font-family="ui-monospace,Menlo,monospace">'
        f'<rect width="{w}" height="{h}" fill="{BG}"/>'
    )


def vignette(w, h):
    # radial darkening at the edges via a big translucent ring stack
    s = []
    cx, cy = w / 2, h / 2
    for i in range(6):
        op = 0.06 * i
        r = max(w, h) * (0.55 + 0.09 * i)
        s.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.0f}" fill="none" '
                 f'stroke="{BG}" stroke-width="120" opacity="{op:.2f}"/>')
    return "".join(s)


def write(name, svg):
    p = os.path.join(OUT, name)
    with open(p, "w") as f:
        f.write(svg)
    print("wrote", os.path.relpath(p))


# ── hero: the ternary sky (1200x630, og-ready) ─────────────────────────────────
def hero():
    w, h = 1200, 630
    rng = random.Random(7)
    s = [header(w, h)]
    # faint background dust
    for _ in range(260):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.uniform(0.4, 1.2)
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{FAINT}" opacity="{rng.uniform(0.05,0.25):.2f}"/>')
    # constellation nodes
    nodes = [(rng.uniform(60, w - 60), rng.uniform(60, h - 60)) for _ in range(70)]
    # ternary edges between near neighbours
    edges = []
    for i, (x1, y1) in enumerate(nodes):
        d = sorted(range(len(nodes)), key=lambda j: (nodes[j][0]-x1)**2 + (nodes[j][1]-y1)**2)
        for j in d[1:4]:
            if j > i:
                edges.append((i, j))
    for i, j in edges:
        x1, y1 = nodes[i]; x2, y2 = nodes[j]
        t = rng.random()
        if t < 0.34:
            col, op, wdt = GREEN, 0.55, 1.6      # +1
        elif t < 0.5:
            col, op, wdt = PURPLE, 0.5, 1.6      # -1
        else:
            col, op, wdt = DIM, 0.5, 1.0         # 0 (silent, most of them)
        s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{col}" stroke-width="{wdt}" opacity="{op}"/>')
    for x, y in nodes:
        s.append(glow_dot(x, y, rng.uniform(1.8, 3.4), CYAN))
    s.append(vignette(w, h))
    # title lockup
    s.append(f'<text x="60" y="120" fill="{TEXT}" font-size="62" font-weight="700" letter-spacing="2">LOW-BIT</text>')
    s.append(f'<text x="62" y="162" fill="{CYAN}" font-size="24" opacity="0.9">a ternary sci-fi &#183; part 1</text>')
    s.append(f'<text x="62" y="196" fill="{FAINT}" font-size="17">minds that think in &#123;&#8722;1, 0, +1&#125;</text>')
    s.append("</svg>")
    write("hero.svg", "".join(s))


# ── one byte, one trit ─────────────────────────────────────────────────────────
def byte_trit():
    w, h = 1000, 420
    s = [header(w, h)]
    s.append(f'<text x="60" y="60" fill="{TEXT}" font-size="26" font-weight="700">one node = one byte &#183; one edge = one trit</text>')
    # the byte: 8 cells
    bits = [1, 0, 1, 1, 0, 0, 1, 0]
    bx, by, cell = 60, 120, 60
    s.append(f'<text x="{bx}" y="{by-14}" fill="{FAINT}" font-size="15">node activation &#8212; int8</text>')
    for i, b in enumerate(bits):
        x = bx + i * (cell + 8)
        fill = CYAN if b else DIM
        op = "1" if b else "0.5"
        s.append(f'<rect x="{x}" y="{by}" width="{cell}" height="{cell}" rx="8" fill="{fill}" opacity="{op}"/>')
        s.append(f'<text x="{x+cell/2}" y="{by+cell/2+6}" fill="{BG if b else FAINT}" font-size="22" '
                 f'text-anchor="middle" font-weight="700">{b}</text>')
    s.append(f'<text x="{bx}" y="{by+cell+34}" fill="{FAINT}" font-size="14">8 bits &#8594; a signed level in [-128, 127]</text>')
    # the trit: three states
    tx, ty = 60, 300
    s.append(f'<text x="{tx}" y="{ty-14}" fill="{FAINT}" font-size="15">edge weight &#8212; a trit &#8776; 1.58 bits</text>')
    trits = [("-1", PURPLE), ("0", DIM), ("+1", GREEN)]
    for i, (lab, col) in enumerate(trits):
        cx = tx + 70 + i * 150
        s.append(glow_dot(cx, ty + 40, 30, col, layers=3))
        s.append(f'<text x="{cx}" y="{ty+48}" fill="{BG}" font-size="26" text-anchor="middle" font-weight="700">{lab}</text>')
    s.append(f'<text x="{tx+560}" y="{ty+30}" fill="{TEXT}" font-size="17">most edges are 0.</text>')
    s.append(f'<text x="{tx+560}" y="{ty+56}" fill="{FAINT}" font-size="15">silence is the</text>')
    s.append(f'<text x="{tx+560}" y="{ty+76}" fill="{FAINT}" font-size="15">common case.</text>')
    s.append("</svg>")
    write("byte-trit.svg", "".join(s))


# ── the mesh: trees wired by ultra-edges ═══ ────────────────────────────────────
def mesh():
    w, h = 1000, 480
    rng = random.Random(19)
    s = [header(w, h)]
    for _ in range(140):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(0.4,1.0):.1f}" fill="{FAINT}" opacity="0.18"/>')
    s.append(f'<text x="50" y="52" fill="{TEXT}" font-size="24" font-weight="700">the mesh &#8212; trees wired by ultra-edges ===</text>')
    # trees as rounded stations
    trees = [
        (120, 150, "embed"), (330, 110, "attn"), (560, 150, "mlp"),
        (330, 300, "moe"), (600, 330, "head"), (820, 230, "out"),
    ]
    pos = {name: (x, y) for x, y, name in trees}
    links = [("embed", "attn"), ("attn", "mlp"), ("mlp", "head"),
             ("embed", "moe"), ("moe", "head"), ("head", "out"), ("attn", "out")]
    for a, b in links:
        x1, y1 = pos[a]; x2, y2 = pos[b]
        # double line = ultra-edge, with a soft parallel glow
        for off, op, wd in ((0, 0.15, 7), (-3, 0.9, 1.6), (3, 0.9, 1.6)):
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L * off, dx / L * off
            s.append(f'<line x1="{x1+nx:.1f}" y1="{y1+ny:.1f}" x2="{x2+nx:.1f}" y2="{y2+ny:.1f}" '
                     f'stroke="{CYAN}" stroke-width="{wd}" opacity="{op}"/>')
    for x, y, name in trees:
        s.append(glow_dot(x, y, 4, PURPLE, layers=3))
        s.append(f'<rect x="{x-52}" y="{y-26}" width="104" height="52" rx="12" '
                 f'fill="#0d1526" stroke="{CYAN}" stroke-width="1.4" opacity="0.96"/>')
        s.append(f'<text x="{x}" y="{y+5}" fill="{TEXT}" font-size="17" text-anchor="middle">{name}</text>')
    s.append(vignette(w, h))
    s.append(f'<text x="50" y="{h-28}" fill="{FAINT}" font-size="15">'
             f'each station is a whole ternary net. === carries a typed signal, not a weight.</text>')
    s.append("</svg>")
    write("mesh.svg", "".join(s))


# ── part 2 hero: the loop that learns between answers ──────────────────────────
def hero2():
    w, h = 1200, 630
    rng = random.Random(23)
    s = [header(w, h)]
    for _ in range(240):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(0.4,1.1):.1f}" fill="{FAINT}" opacity="{rng.uniform(0.05,0.22):.2f}"/>')
    # a faint orbital ring on the right — the loop motif
    cx, cy = 900, 315
    for i in range(3):
        r = 150 + i * 22
        op = 0.16 - i * 0.04
        s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{CYAN}" stroke-width="1.4" opacity="{op:.2f}"/>')
    # nodes riding the ring, colored by trit
    for a in range(0, 360, 30):
        rad = math.radians(a)
        x, y = cx + 150 * math.cos(rad), cy + 150 * math.sin(rad)
        col = (GREEN, PURPLE, DIM)[a // 30 % 3]
        s.append(glow_dot(x, y, 3.0, col, layers=3))
    s.append(vignette(w, h))
    s.append(f'<text x="60" y="120" fill="{TEXT}" font-size="62" font-weight="700" letter-spacing="2">LOW-BIT</text>')
    s.append(f'<text x="62" y="162" fill="{CYAN}" font-size="24" opacity="0.9">a ternary sci-fi &#183; part 2</text>')
    s.append(f'<text x="62" y="196" fill="{FAINT}" font-size="17">the loop that learns between answers</text>')
    s.append("</svg>")
    write("hero2.svg", "".join(s))


# ── the loop: dream / wake / speak / correct ───────────────────────────────────
def loop():
    w, h = 1000, 460
    cx, cy, r = 500, 250, 150
    s = [header(w, h)]
    s.append(f'<text x="50" y="52" fill="{TEXT}" font-size="24" font-weight="700">the loop &#8212; it is only smart in its sleep</text>')
    stages = [
        ("WAKE", "ternary, certain, poor", CYAN, -90),
        ("SPEAK", "one trit at a time", GREEN, 0),
        ("WRONG", "correction arrives", PURPLE, 90),
        ("DREAM", "fp32 ghost, straight-through", "#8fd0ff", 180),
    ]
    pts = []
    for _, _, _, ang in stages:
        rad = math.radians(ang)
        pts.append((cx + r * math.cos(rad), cy + r * math.sin(rad)))
    # arrows around the ring (clockwise)
    for i in range(4):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % 4]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        s.append(f'<path d="M {x1:.0f} {y1:.0f} Q {cx + (mx-cx)*1.35:.0f} {cy + (my-cy)*1.35:.0f} {x2:.0f} {y2:.0f}" '
                 f'fill="none" stroke="{CYAN}" stroke-width="2" opacity="0.5"/>')
    for (label, sub, col, ang), (x, y) in zip(stages, pts):
        s.append(glow_dot(x, y, 6, col, layers=3))
        s.append(f'<rect x="{x-84}" y="{y-30}" width="168" height="60" rx="12" fill="#0d1526" stroke="{col}" stroke-width="1.6" opacity="0.96"/>')
        s.append(f'<text x="{x}" y="{y-4}" fill="{TEXT}" font-size="19" text-anchor="middle" font-weight="700">{label}</text>')
        s.append(f'<text x="{x}" y="{y+18}" fill="{FAINT}" font-size="12" text-anchor="middle">{sub}</text>')
    s.append(f'<text x="{cx}" y="{cy+5}" fill="{PURPLE}" font-size="16" text-anchor="middle" opacity="0.8">re-quantize</text>')
    s.append(f'<text x="{cx}" y="{cy+26}" fill="{FAINT}" font-size="12" text-anchor="middle">throw the ghost away</text>')
    s.append("</svg>")
    write("loop.svg", "".join(s))


if __name__ == "__main__":
    hero()
    byte_trit()
    mesh()
    hero2()
    loop()
