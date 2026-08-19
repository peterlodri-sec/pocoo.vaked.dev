import os
import glob
import re
import hashlib
import html

POSTS_DIR = "/Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev/posts"
ASSETS_OG_DIR = "/Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev/assets/og"
DIST_OG_DIR = "/Users/lodripeter/workspace/peterlodri-sec/pocoo.vaked.dev/dist/assets/og"

os.makedirs(ASSETS_OG_DIR, exist_ok=True)
os.makedirs(DIST_OG_DIR, exist_ok=True)

def parse_post(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read().strip()
    
    meta = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            raw_meta = parts[1]
            body = parts[2].strip()
            for line in raw_meta.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"): continue
                m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
                if m:
                    key = m.group(1).strip()
                    val = m.group(2).strip().strip('"').strip("'")
                    if key == "tags":
                        val = [t.strip().strip('"').strip("'") for t in val.strip("[]").split(",") if t.strip()]
                    meta[key] = val
    
    slug = os.path.splitext(os.path.basename(filepath))[0]
    title = meta.get("title", slug.replace("-", " ").title())
    date = meta.get("date", "2026-08-19")
    desc = meta.get("description", "")
    tags = meta.get("tags", [])
    if isinstance(tags, str):
        tags = [tags]
    return {
        "slug": slug,
        "title": title,
        "date": str(date),
        "desc": desc,
        "tags": tags,
        "body": body
    }

def hash_string(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def wrap_text(text, max_chars_per_line=36, max_lines=3):
    words = text.split()
    lines = []
    curr = []
    curr_len = 0
    for w in words:
        if curr_len + len(w) + 1 > max_chars_per_line and curr:
            lines.append(" ".join(curr))
            curr = [w]
            curr_len = len(w)
        else:
            curr.append(w)
            curr_len += len(w) + 1
    if curr:
        lines.append(" ".join(curr))
    
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        if not lines[-1].endswith("..."):
            lines[-1] = lines[-1].rstrip(".,;: ") + "..."
    return lines

def generate_svg(post):
    h = hash_string(post["title"] + post["date"] + post["slug"])
    n_hue = int(h[0:4], 16)
    hue1 = (n_hue % 60) + 160 # 160 to 220 (emerald / cyan / blue range)
    hue2 = (hue1 + 45) % 360 # gold / violet / amber accent
    
    accent_color = f"hsl({hue1}, 85%, 60%)"
    secondary_color = f"hsl({hue2}, 90%, 65%)"
    glow_color = f"hsla({hue1}, 100%, 50%, 0.18)"
    glow_color2 = f"hsla({hue2}, 100%, 50%, 0.12)"
    
    # Select visual motif based on tags & slug
    combined = (post["slug"] + " " + " ".join(post["tags"]) + " " + post["title"]).lower()
    
    motif_svg = ""
    
    # Motif 1: Ternary Grid / BitNet
    if any(k in combined for k in ["ternary", "bitnet", "quantal", "trit", "1.58", "1_58"]):
        grid_items = []
        for row in range(7):
            for col in range(9):
                cx = 780 + col * 42
                cy = 140 + row * 42
                cell_h = hash_string(f"{h}_{row}_{col}")
                state = int(cell_h[0:2], 16) % 3 - 1 # -1, 0, +1
                if state == 1:
                    grid_items.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{accent_color}" fill-opacity="0.75" />')
                    grid_items.append(f'<text x="{cx}" y="{cy+4}" fill="#050807" font-family="monospace" font-size="12" font-weight="900" text-anchor="middle">+1</text>')
                elif state == -1:
                    grid_items.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{secondary_color}" fill-opacity="0.75" />')
                    grid_items.append(f'<text x="{cx}" y="{cy+4}" fill="#050807" font-family="monospace" font-size="12" font-weight="900" text-anchor="middle">-1</text>')
                else:
                    grid_items.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="#3a4d43" fill-opacity="0.5" stroke="{accent_color}" stroke-opacity="0.3" stroke-width="1" />')
        motif_svg = f'<g opacity="0.85">{"".join(grid_items)}<text x="948" y="470" fill="{accent_color}" font-family="monospace" font-size="14" letter-spacing="3" text-anchor="middle" opacity="0.8">BITNET b1.58 // TERNARY TRIT LATTICE</text></g>'
        
    # Motif 2: Quantum Wave Interference
    elif any(k in combined for k in ["quantum", "born", "field", "wave", "schrodinger", "entheai"]):
        rings = []
        for r in range(6):
            rad = 70 + r * 38
            rings.append(f'<circle cx="950" cy="315" r="{rad}" fill="none" stroke="{accent_color}" stroke-width="1.5" stroke-opacity="{0.7 - r*0.1}" stroke-dasharray="{r*4+6},{r*2+4}" />')
            rings.append(f'<ellipse cx="950" cy="315" rx="{rad*1.2}" ry="{rad*0.5}" fill="none" stroke="{secondary_color}" stroke-width="1" stroke-opacity="{0.6 - r*0.09}" transform="rotate({r*30} 950 315)" />')
        motif_svg = f'<g>{"".join(rings)}<circle cx="950" cy="315" r="8" fill="{secondary_color}" filter="drop-shadow(0 0 12px {secondary_color})"/><text x="950" y="520" fill="{secondary_color}" font-family="monospace" font-size="13" letter-spacing="3" text-anchor="middle">|ψ⟩ = α|0⟩ + β|1⟩ // QUANTUM FIELD</text></g>'
        
    # Motif 3: Spectral Density & Wigner Semicircle
    elif any(k in combined for k in ["spectral", "wigner", "random-matrix", "tracy-widom", "marchenko", "microstructure"]):
        pts = []
        for x in range(300):
            norm_x = (x - 150) / 130
            if abs(norm_x) <= 1:
                y = 380 - (1 - norm_x**2)**0.5 * 180 + (int(hash_string(f"{h}_{x}")[:2], 16) % 10 - 5)
            else:
                y = 380
            pts.append(f"{800 + x},{y:.1f}")
        polyline = " ".join(pts)
        motif_svg = f'''<g>
            <path d="M 800 380 L {polyline} L 1100 380 Z" fill="{glow_color}" stroke="{accent_color}" stroke-width="2.5" />
            <line x1="770" y1="380" x2="1130" y2="380" stroke="#3a4d43" stroke-width="2" stroke-dasharray="4,4" />
            <line x1="950" y1="170" x2="950" y2="380" stroke="{secondary_color}" stroke-width="1.5" stroke-opacity="0.6" stroke-dasharray="3,3" />
            <text x="950" y="420" fill="{accent_color}" font-family="monospace" font-size="13" letter-spacing="3" text-anchor="middle">ρ(λ) = 1/(2π) √(4 - λ²) // WIGNER SURMISE</text>
        </g>'''
        
    # Motif 4: Ultragraph / DAG / Topology
    elif any(k in combined for k in ["graph", "ultragraph", "network", "node", "dag", "topology", "nix"]):
        nodes = [
            (820, 200, "Kernel"), (950, 160, "AST"), (1080, 210, "LPG"),
            (860, 320, "POLA"), (1020, 310, "Eval"), (940, 420, "FixedPt")
        ]
        edges = [(0,1), (1,2), (0,3), (1,4), (2,4), (3,5), (4,5), (3,1)]
        edge_svg = "".join([f'<line x1="{nodes[e[0]][0]}" y1="{nodes[e[0]][1]}" x2="{nodes[e[1]][0]}" y2="{nodes[e[1]][1]}" stroke="{accent_color}" stroke-opacity="0.5" stroke-width="2" />' for e in edges])
        node_svg = "".join([f'<g transform="translate({n[0]},{n[1]})"><circle r="22" fill="#0b1712" stroke="{secondary_color}" stroke-width="2" /><text y="4" fill="{accent_color}" font-family="monospace" font-size="10" font-weight="700" text-anchor="middle">{n[2]}</text></g>' for n in nodes])
        motif_svg = f'<g>{edge_svg}{node_svg}<text x="950" y="490" fill="{accent_color}" font-family="monospace" font-size="13" letter-spacing="3" text-anchor="middle">DAG TOPOLOGY // ACYCLIC GRAPH</text></g>'
        
    # Motif 5: Metal / SIMD / Low-Allocation Hardware
    elif any(k in combined for k in ["metal", "simd", "allocation", "gpu", "latency", "swift", "cuda", "transformer"]):
        lanes = []
        for i in range(8):
            y = 170 + i * 36
            val = int(hash_string(f"{h}_{i}")[:4], 16) % 100
            w = 120 + val * 1.5
            lanes.append(f'<rect x="800" y="{y}" width="280" height="24" rx="4" fill="#0a1510" stroke="#1f3328" stroke-width="1" />')
            lanes.append(f'<rect x="800" y="{y}" width="{w}" height="24" rx="4" fill="url(#laneGrad)" fill-opacity="0.8" />')
            lanes.append(f'<text x="790" y="{y+16}" fill="#7a8b7f" font-family="monospace" font-size="11" text-anchor="end">LANE {i:02d}</text>')
            lanes.append(f'<text x="1090" y="{y+16}" fill="{accent_color}" font-family="monospace" font-size="11">{val*4} µs</text>')
        motif_svg = f'<g>{"".join(lanes)}<text x="940" y="490" fill="{accent_color}" font-family="monospace" font-size="13" letter-spacing="3" text-anchor="middle">SIMDGROUP GEMM // ZERO-ALLOCATION</text></g>'
        
    # Motif 6: Sacred Loop / Backyard Ultra / Sovereignty (Default)
    else:
        loops = []
        for i in range(5):
            r = 60 + i * 32
            loops.append(f'<circle cx="950" cy="300" r="{r}" fill="none" stroke="{accent_color}" stroke-opacity="{0.8 - i*0.14}" stroke-width="1.5" />')
            loops.append(f'<polygon points="950,{300-r} {950+r*0.95},{300+r*0.31} {950-r*0.95},{300+r*0.31}" fill="none" stroke="{secondary_color}" stroke-opacity="{0.5 - i*0.09}" stroke-width="1" transform="rotate({i*18} 950 300)" />')
        motif_svg = f'<g>{"".join(loops)}<circle cx="950" cy="300" r="10" fill="{accent_color}" /><text x="950" y="490" fill="{accent_color}" font-family="monospace" font-size="13" letter-spacing="3" text-anchor="middle">BACKYARD ULTRA // BOUNDED LAP INVARIANT</text></g>'

    # Typography & Text wrapping
    title_lines = wrap_text(post["title"], max_chars_per_line=30, max_lines=3)
    title_svg_lines = []
    start_y = 230 if len(title_lines) == 1 else (200 if len(title_lines) == 2 else 175)
    for idx, t_line in enumerate(title_lines):
        y_pos = start_y + idx * 56
        title_svg_lines.append(f'<text x="80" y="{y_pos}" fill="#ffffff" font-family="Georgia, serif" font-size="44" font-weight="700" letter-spacing="0.5" filter="drop-shadow(0 2px 10px rgba(0,0,0,0.8))">{html.escape(t_line)}</text>')
    
    title_block = "\n".join(title_svg_lines)
    
    # Description
    desc_lines = wrap_text(post["desc"], max_chars_per_line=48, max_lines=2) if post["desc"] else []
    desc_start_y = start_y + len(title_lines) * 56 + 15
    desc_svg_lines = []
    for idx, d_line in enumerate(desc_lines):
        y_pos = desc_start_y + idx * 24
        desc_svg_lines.append(f'<text x="80" y="{y_pos}" fill="#a3b8ab" font-family="ui-monospace, monospace" font-size="15" opacity="0.85">{html.escape(d_line)}</text>')
    desc_block = "\n".join(desc_svg_lines)
    
    # Tags badges
    tag_elements = []
    curr_tx = 80
    for tag in post["tags"][:4]:
        tag_str = html.escape(tag)
        w = max(60, len(tag_str) * 8 + 20)
        tag_elements.append(f'''
        <g transform="translate({curr_tx}, 115)">
            <rect width="{w}" height="26" rx="13" fill="{glow_color2}" stroke="{secondary_color}" stroke-opacity="0.6" stroke-width="1" />
            <text x="{w/2}" y="17" fill="{secondary_color}" font-family="ui-monospace, monospace" font-size="12" font-weight="600" text-anchor="middle">#{tag_str}</text>
        </g>
        ''')
        curr_tx += w + 10
    tags_block = "".join(tag_elements)

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" style="background:#060a08;">
    <defs>
        <radialGradient id="bgGlow1" cx="20%" cy="30%" r="60%">
            <stop offset="0%" stop-color="{glow_color}" />
            <stop offset="100%" stop-color="#060a08" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="bgGlow2" cx="80%" cy="70%" r="60%">
            <stop offset="0%" stop-color="{glow_color2}" />
            <stop offset="100%" stop-color="#060a08" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="laneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="{accent_color}" stop-opacity="0.8" />
            <stop offset="100%" stop-color="{secondary_color}" stop-opacity="0.9" />
        </linearGradient>
        <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="{accent_color}" stop-opacity="0.4" />
            <stop offset="50%" stop-color="{secondary_color}" stop-opacity="0.2" />
            <stop offset="100%" stop-color="{accent_color}" stop-opacity="0.5" />
        </linearGradient>
        <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#122018" stroke-width="0.75" stroke-opacity="0.6"/>
        </pattern>
    </defs>

    <!-- Background Layers -->
    <rect width="1200" height="630" fill="#060a08" />
    <rect width="1200" height="630" fill="url(#gridPattern)" />
    <rect width="1200" height="630" fill="url(#bgGlow1)" />
    <rect width="1200" height="630" fill="url(#bgGlow2)" />

    <!-- Outer Frame -->
    <rect x="20" y="20" width="1160" height="590" rx="16" fill="none" stroke="url(#goldBorder)" stroke-width="1.5" />

    <!-- Header / Brand -->
    <g transform="translate(80, 75)">
        <circle cx="12" cy="12" r="8" fill="{accent_color}" />
        <circle cx="12" cy="12" r="14" fill="none" stroke="{accent_color}" stroke-opacity="0.5" stroke-width="1" />
        <text x="36" y="17" fill="#ffffff" font-family="ui-monospace, monospace" font-size="16" font-weight="700" letter-spacing="2">POCOO.VAKED.DEV</text>
        <text x="210" y="17" fill="#7a8b7f" font-family="ui-monospace, monospace" font-size="14" letter-spacing="1">// SOVEREIGN RESEARCH ARCHIVE</text>
    </g>

    <!-- Tags -->
    {tags_block}

    <!-- Title & Desc Block -->
    <g>
        {title_block}
        {desc_block}
    </g>

    <!-- Graphic Motif (Right Side) -->
    {motif_svg}

    <!-- Bottom Footer Bar -->
    <g transform="translate(80, 565)">
        <line x1="0" y1="-20" x2="1040" y2="-20" stroke="#1f3328" stroke-width="1" />
        <text x="0" y="5" fill="#7a8b7f" font-family="ui-monospace, monospace" font-size="13">DATE: {html.escape(post["date"])}</text>
        <text x="220" y="5" fill="#7a8b7f" font-family="ui-monospace, monospace" font-size="13">AUTHOR: PÉTER LODRI</text>
        <text x="520" y="5" fill="{accent_color}" font-family="ui-monospace, monospace" font-size="13" font-weight="600">HASH: #{h[:12]}</text>
        <text x="1040" y="5" fill="{secondary_color}" font-family="ui-monospace, monospace" font-size="13" font-weight="700" text-anchor="end">WE. {{-1, 0, +1}}. &lt;3</text>
    </g>
</svg>'''
    return svg_content

def main():
    md_files = glob.glob(os.path.join(POSTS_DIR, "*.md"))
    print(f"Generating OG/Hero SVG images for {len(md_files)} posts...")
    
    count = 0
    for fpath in md_files:
        post = parse_post(fpath)
        svg = generate_svg(post)
        
        target_path = os.path.join(ASSETS_OG_DIR, f"{post['slug']}.svg")
        with open(target_path, "w", encoding="utf-8") as out:
            out.write(svg)
            
        dist_path = os.path.join(DIST_OG_DIR, f"{post['slug']}.svg")
        with open(dist_path, "w", encoding="utf-8") as out:
            out.write(svg)
            
        count += 1
        
    print(f"Successfully generated {count} bespoke SVG OG/Hero images in {ASSETS_OG_DIR} and {DIST_OG_DIR}!")

if __name__ == "__main__":
    main()
