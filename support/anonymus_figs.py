#!/usr/bin/env python3
"""Themed SVG illustrations for the 'first 1-bit Hungarian LLM' (Anonymus) post.

pocoo palette, deterministic, glow faked with translucent layers so ImageMagick
rasterizes the hero faithfully for the og:image. Output -> assets/anonymus/*.svg.
"""
import math
import os
import random

BG = "#070b16"
CYAN = "#00d4ff"
GREEN = "#00e660"
PURPLE = "#b48bff"
GOLD = "#e6c34d"      # manuscript gold-leaf accent
DIM = "#1b2740"
TEXT = "#c8d4e8"
FAINT = "#5a6b8c"

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "anonymus")
os.makedirs(OUT, exist_ok=True)


def glow_dot(x, y, r, color, layers=4):
    s = []
    for i in range(layers, 0, -1):
        rr = r * (1 + 1.7 * (i - 1))
        op = 0.10 * (layers - i + 1) / layers
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rr:.1f}" fill="{color}" opacity="{op:.3f}"/>')
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}"/>')
    return "".join(s)


def header(w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'font-family="ui-monospace,Menlo,monospace"><rect width="{w}" height="{h}" fill="{BG}"/>')


def vignette(w, h):
    s, cx, cy = [], w / 2, h / 2
    for i in range(6):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="{max(w,h)*(0.55+0.09*i):.0f}" fill="none" '
                 f'stroke="{BG}" stroke-width="120" opacity="{0.06*i:.2f}"/>')
    return "".join(s)


def write(name, svg):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(svg)
    print("wrote", os.path.relpath(os.path.join(OUT, name)))


# ── hero: the seven chieftains (hetumoger) as a ternary constellation ─────────
def hero():
    w, h = 1200, 630
    rng = random.Random(896)   # 896 AD, the honfoglalás
    s = [header(w, h)]
    for _ in range(240):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(0.4,1.1):.1f}" fill="{FAINT}" opacity="{rng.uniform(0.05,0.22):.2f}"/>')
    # seven chieftains on an arc (Álmos/Árpád line), wired by ternary edges
    cx, cy, r = 830, 330, 210
    chiefs = []
    for i in range(7):
        a = math.radians(-150 + i * 40)
        chiefs.append((cx + r * math.cos(a), cy + r * math.sin(a) * 0.75))
    for i in range(7):
        for j in range(i + 1, 7):
            if rng.random() < 0.45:
                col = GREEN if rng.random() < 0.6 else PURPLE
                x1, y1 = chiefs[i]; x2, y2 = chiefs[j]
                s.append(f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{col}" stroke-width="1.5" opacity="0.45"/>')
    for x, y in chiefs:
        s.append(glow_dot(x, y, 4.2, CYAN))
    s.append(vignette(w, h))
    # illuminated initial "P" — "P. dictus magister"
    s.append(f'<rect x="58" y="150" width="120" height="150" rx="10" fill="none" stroke="{GOLD}" stroke-width="2" opacity="0.55"/>')
    s.append(f'<text x="72" y="272" fill="{GOLD}" font-size="150" font-weight="700" opacity="0.9" font-family="Georgia,serif">P</text>')
    s.append(f'<text x="60" y="115" fill="{TEXT}" font-size="45" font-weight="700" letter-spacing="1">GESTA HVNGARORVM</text>')
    s.append(f'<text x="62" y="360" fill="{CYAN}" font-size="22" opacity="0.9">the first 1-bit Hungarian LLM</text>')
    s.append(f'<text x="62" y="392" fill="{FAINT}" font-size="15">a ternary GPT trained on Anonymus, c. 1200</text>')
    s.append(f'<text x="62" y="414" fill="{FAINT}" font-size="15">every weight in &#123;&#8722;1, 0, +1&#125;</text>')
    s.append("</svg>")
    write("hero.svg", "".join(s))


# ── the pipeline: scriptura -> bytes -> trits -> gesta ────────────────────────
def pipeline():
    w, h = 1000, 300
    s = [header(w, h)]
    stages = [
        ("Anonymus", "94 KB of Latin", GOLD),
        ("bytes", "ByteTokenizer, vocab 256", CYAN),
        ("ternary GPT", "weights in {-1,0,+1}", GREEN),
        ("gesta", "it writes in his hand", PURPLE),
    ]
    n = len(stages)
    for i, (label, sub, col) in enumerate(stages):
        x = 90 + i * 275
        y = 150
        s.append(f'<rect x="{x-95}" y="{y-42}" width="190" height="84" rx="12" fill="#0d1526" stroke="{col}" stroke-width="1.6"/>')
        s.append(f'<text x="{x}" y="{y-6}" fill="{TEXT}" font-size="19" text-anchor="middle" font-weight="700">{label}</text>')
        s.append(f'<text x="{x}" y="{y+18}" fill="{FAINT}" font-size="12" text-anchor="middle">{sub}</text>')
        if i < n - 1:
            ax = x + 95
            s.append(f'<line x1="{ax+2}" y1="{y}" x2="{ax+83}" y2="{y}" stroke="{CYAN}" stroke-width="2" opacity="0.6"/>')
            s.append(f'<polygon points="{ax+83},{y-5} {ax+93},{y} {ax+83},{y+5}" fill="{CYAN}" opacity="0.8"/>')
    s.append(f'<text x="60" y="46" fill="{TEXT}" font-size="20" font-weight="700">from scripture to a byte-graph that writes it back</text>')
    s.append("</svg>")
    write("pipeline.svg", "".join(s))


if __name__ == "__main__":
    hero()
    pipeline()
