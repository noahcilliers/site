"""Generate ASCII chess piece sets as SVG. Standard library only.

Every set is written to sets/<name>/<id>.svg (ids: wK, wQ, ... bP) plus
sets/<name>/ascii.json with the raw art.

Sets:
  1-classic   the original designs, now solid-filled and filling the square
  2-chunky    new, wider designs with heavier outlines
  3-mosaic    pixel-art pieces built from ASCII maps, with a '#' texture
  4-coin      compact ASCII art printed on round tokens
  5-letters   block letters (K Q R B N P) made of '#' cells, on tiles

White pieces are ivory with dark ink; black pieces are charcoal with light ink.
Both get a dark outline so they read on light and dark squares.

Run:  python3 generate_sets.py
"""

import json
from collections import deque
from pathlib import Path

SIZE = 256
FONT = "Menlo, Consolas, 'DejaVu Sans Mono', monospace"

COLORS = {
    "w": {"fill": "#f7f2e6", "ink": "#1c1a17", "edge": "#1c1a17", "soft": "#ddd3bd"},
    "b": {"fill": "#2b2926", "ink": "#f1ebdd", "edge": "#0c0b0a", "soft": "#45423d"},
}
NAMES = {"K": "king", "Q": "queen", "R": "rook", "B": "bishop", "N": "knight", "P": "pawn"}

# ---------------------------------------------------------------------------
# Art
# ---------------------------------------------------------------------------

CLASSIC = {
    "K": r"""
      _
    _| |_
   |_   _|
     | |
  .--' '--.
  \       /
   \_____/
   |     |
  /_______\
 [_________]
""",
    "Q": r"""
  o   o   o
  |\ / \ /|
  | V   V |
   \_____/
    |   |
    |   |
   /_____\
  [_______]
""",
    "R": r"""
  _   _   _
 | |_| |_| |
 |         |
  \_______/
   |     |
   |     |
  /_______\
 [_________]
""",
    "B": r"""
      o
     / \
    /  /\
   (  /  )
    \    /
     )__(
    /    \
   /______\
  [________]
""",
    "N": r"""
     _,,
   _/ o \
  /      \
 (__,-.   \
      /    |
     /     |
    /______\
   [________]
""",
    "P": r"""
     ___
    (   )
     ) (
    /   \
   /_____\
  [_______]
""",
}

CHUNKY = {
    "K": r"""
       /\
      _||_
     |_  _|
       ||
   .--'  '--.
  /          \
 |            |
  \          /
   '--------'
    |      |
   /        \
  [__________]
""",
    "Q": r"""
 o    o    o
  \  / \  /
 o \/   \/ o
  \        /
   \      /
   |======|
    \    /
    |    |
   /      \
  [________]
""",
    "R": r"""
  _   __   _
 | |_|  |_| |
 |          |
  \________/
   |      |
   |      |
   |      |
  /________\
 [__________]
""",
    "B": r"""
      ()
     /  \
    /  / \
   |  /   |
   |      |
    \    /
     )  (
    /____\
   /      \
  [________]
""",
    "N": r"""
     _,_
   _/  o\_
  /       \
 /  ,--.   |
(__/   /   |
      /    |
     /     |
    /______\
   [________]
""",
    "P": r"""
     .--.
    (    )
     )  (
    /    \
   |      |
   /______\
  [________]
""",
}

# X = outline, o = body, . = empty
MOSAIC = {
    "K": """
......XX......
....XXooXX....
....XooooX....
....XXooXX....
......XX......
..XXXXooXXXX..
.XooooooooooX.
.XooooooooooX.
..XooooooooX..
...XooooooX...
...XXXXXXXX...
..XooooooooX..
.XooooooooooX.
.XXXXXXXXXXXX.
""",
    "Q": """
.XX...XX...XX.
.XoX.XooX.XoX.
..XoXooooXoX..
..XooooooooX..
...XooooooX...
...XXXXXXXX...
....XooooX....
....XooooX....
...XooooooX...
..XXXXXXXXXX..
..XooooooooX..
.XooooooooooX.
.XXXXXXXXXXXX.
""",
    "R": """
.XXX.XXXX.XXX.
.XoX.XooX.XoX.
.XoXXXooXXXoX.
.XooooooooooX.
..XXXXXXXXXX..
...XooooooX...
...XooooooX...
...XooooooX...
...XooooooX...
..XXXXXXXXXX..
..XooooooooX..
.XooooooooooX.
.XXXXXXXXXXXX.
""",
    "B": """
......XX......
.....XooX.....
.....XXXX.....
....XoooXX....
...XoooXooX...
...XooXoooX...
...XoooooooX..
....XoooooX...
.....XXXXX....
....XoooooX...
...XXXXXXXXX..
..XoooooooooX.
.XooooooooooX.
.XXXXXXXXXXXX.
""",
    "N": """
.....XX.......
....XooXX.....
...XoooooXX...
..XooXoooooX..
.XoooooooooX..
.XooXXXooooX..
..XX..XooooX..
.....XoooooX..
....XooooooX..
...XoooooooX..
..XXXXXXXXXX..
..XooooooooX..
.XooooooooooX.
.XXXXXXXXXXXX.
""",
    "P": """
.....XXXX.....
....XooooX....
....XooooX....
.....XooX.....
....XooooX....
...XooooooX...
..XXXXXXXXXX..
..XooooooooX..
.XooooooooooX.
.XXXXXXXXXXXX.
""",
}

COIN = {
    "K": r"""
    +
  _/_\_
  \   /
   | |
  /___\
""",
    "Q": r"""
 o  o  o
 |\/ \/|
  \   /
   | |
  /___\
""",
    "R": r"""
 _ _ _ _
 |_____|
  |   |
  |   |
 /_____\
""",
    "B": r"""
    o
   / \
  ( / )
   ) (
  /___\
""",
    "N": r"""
   _,_
  / o \
 (_.   |
   /   |
  /____\
""",
    "P": r"""

   ()
   )(
  /  \
 /____\
""",
}

# 5x7 bitmap letters: '#' = ink
LETTERS = {
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "N": ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
}

# ---------------------------------------------------------------------------
# Grid helpers
# ---------------------------------------------------------------------------


def to_grid(art, rows=None, cols=None):
    """Art string -> list of equal-width lines, centred and bottom-aligned."""
    lines = art if isinstance(art, list) else art.strip("\n").split("\n")
    while lines and not lines[0].strip():
        lines = lines[1:]
    width = max(len(l.rstrip()) for l in lines)
    lines = [l.rstrip().ljust(width) for l in lines]
    rows = rows or len(lines)
    cols = cols or width
    if len(lines) > rows or width > cols:
        raise ValueError(f"design too big: {len(lines)}x{width} > {rows}x{cols}")
    pad = (cols - width) // 2
    lines = [(" " * pad + l).ljust(cols) for l in lines]
    return [" " * cols] * (rows - len(lines)) + lines


def inside_cells(grid, empty=" "):
    """Empty cells not 4-connected to the border."""
    rows, cols = len(grid), len(grid[0])
    seen = set()
    q = deque((r, c) for r in range(rows) for c in range(cols)
              if (r in (0, rows - 1) or c in (0, cols - 1)) and grid[r][c] == empty)
    seen.update(q)
    while q:
        r, c = q.popleft()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen and grid[nr][nc] == empty:
                seen.add((nr, nc))
                q.append((nr, nc))
    return {(r, c) for r in range(rows) for c in range(cols) if grid[r][c] == empty and (r, c) not in seen}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_doc(pid, body, extra_defs=""):
    title = f"{'white' if pid[0] == 'w' else 'black'} {NAMES[pid[1]]}"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}">
<title>{title}</title>
<defs>
  <filter id="edge" x="-10%" y="-10%" width="120%" height="120%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="{EDGE}" result="grown"/>
    <feFlood flood-color="EDGECOLOR"/>
    <feComposite in2="grown" operator="in" result="outline"/>
    <feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>{extra_defs}
</defs>
{body}
</svg>
"""


EDGE = 5


def text_lines(grid, x0, y0, cw, ch, color, fs=None, weight="bold"):
    """Monospace lines stretched so each character fills a cw x ch cell."""
    fs = fs or ch
    out = []
    for i, line in enumerate(grid):
        if not line.strip():
            continue
        y = y0 + i * ch + ch * 0.78
        out.append(
            f'<text x="{x0:.2f}" y="{y:.2f}" xml:space="preserve" font-family="{FONT}" '
            f'font-size="{fs:.2f}" font-weight="{weight}" fill="{color}" '
            f'textLength="{cw * len(line):.2f}" lengthAdjust="spacingAndGlyphs">{esc(line)}</text>'
        )
    return "\n".join(out)


def silhouette(grid, x0, y0, cw, ch):
    """Cells covered by the piece, with diagonal and underscore edges trimmed to follow the art."""
    rows, cols = len(grid), len(grid[0])
    inside = inside_cells(grid)
    solid = {(r, c) for r in range(rows) for c in range(cols) if grid[r][c] != " "} | inside

    def out(r, c):
        return not (0 <= r < rows and 0 <= c < cols) or (r, c) not in solid

    shapes = []
    for r, c in sorted(solid):
        x, y = x0 + c * cw, y0 + r * ch
        X, Y = x + cw + 0.6, y + ch + 0.6  # tiny overlap hides seams
        ch_ = grid[r][c]
        if ch_ == "/" and out(r, c - 1):
            pts = [(X, y), (X, Y), (x, Y)]
        elif ch_ == "/" and out(r, c + 1):
            pts = [(x, y), (X, y), (x, Y)]
        elif ch_ == "\\" and out(r, c + 1):
            pts = [(x, y), (X, Y), (x, Y)]
        elif ch_ == "\\" and out(r, c - 1):
            pts = [(x, y), (X, y), (X, Y)]
        elif ch_ in "_" and out(r - 1, c):
            pts = [(x, y + ch * 0.72), (X, y + ch * 0.72), (X, Y), (x, Y)]
        elif ch_ in "-.,'" and out(r - 1, c):
            pts = [(x, y + ch * 0.45), (X, y + ch * 0.45), (X, Y), (x, Y)]
        else:
            pts = [(x, y), (X, y), (X, Y), (x, Y)]
        shapes.append("M" + " L".join(f"{px:.2f},{py:.2f}" for px, py in pts) + "Z")
    return " ".join(shapes)


def fit(rows, cols, box, aspect):
    """Cell size so a rows x cols grid fits in a box, with cell width = aspect * height."""
    ch = min(box / rows, box / (cols * aspect))
    return ch * aspect, ch


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------


def render_outlined(pid, art, rows, cols, aspect=0.78, margin=10):
    """ASCII art with a solid silhouette behind it."""
    col = COLORS[pid[0]]
    grid = to_grid(art, rows, cols)
    cw, ch = fit(rows, cols, SIZE - 2 * margin, aspect)
    x0 = (SIZE - cw * cols) / 2
    y0 = SIZE - margin - ch * rows
    body = (
        f'<g filter="url(#edge)"><path d="{silhouette(grid, x0, y0, cw, ch)}" fill="{col["fill"]}"/></g>\n'
        + text_lines(grid, x0, y0, cw, ch, col["ink"])
    )
    return svg_doc(pid, body).replace("EDGECOLOR", col["edge"]), grid


def render_mosaic(pid, art, margin=8):
    col = COLORS[pid[0]]
    grid = to_grid(art, 14, 14)
    cell = (SIZE - 2 * margin) / 14
    x0 = margin
    y0 = SIZE - margin - cell * 14
    parts = []
    for r, line in enumerate(grid):
        for c, ch_ in enumerate(line):
            if ch_ not in "Xo":
                continue
            x, y = x0 + c * cell, y0 + r * cell
            color = col["edge"] if ch_ == "X" else col["fill"]
            parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{cell + 0.6:.2f}" height="{cell + 0.6:.2f}" fill="{color}"/>')
            if ch_ == "o":
                parts.append(
                    f'<text x="{x + cell / 2:.2f}" y="{y + cell * 0.78:.2f}" text-anchor="middle" '
                    f'font-family="{FONT}" font-size="{cell * 0.95:.2f}" font-weight="bold" '
                    f'fill="{col["soft"]}">#</text>')
    body = "<g>\n" + "\n".join(parts) + "\n</g>"
    ascii_grid = [line.replace(".", " ").replace("o", "#").replace("X", "@") for line in grid]
    return svg_doc(pid, body).replace("EDGECOLOR", col["edge"]), ascii_grid


def render_coin(pid, art):
    col = COLORS[pid[0]]
    ring = "#f1ebdd" if pid[0] == "b" else "#1c1a17"
    grid = to_grid(art, 5)
    cols = len(grid[0])
    ch = min(34, 180 / (cols * 0.7))
    cw = ch * 0.7
    x0 = (SIZE - cw * cols) / 2
    y0 = (SIZE - ch * 5) / 2 + 2
    body = (
        f'<circle cx="128" cy="128" r="122" fill="{col["edge"]}"/>\n'
        f'<circle cx="128" cy="128" r="115" fill="{col["fill"]}"/>\n'
        f'<circle cx="128" cy="128" r="103" fill="none" stroke="{ring}" stroke-width="3" opacity="0.5"/>\n'
        f'<path d="{silhouette(grid, x0, y0, cw, ch)}" fill="{col["soft"]}"/>\n'
        + text_lines(grid, x0, y0, cw, ch, col["ink"])
    )
    return svg_doc(pid, body).replace("EDGECOLOR", col["edge"]), grid


def render_letter(pid, rows):
    col = COLORS[pid[0]]
    cell = 25
    x0 = (SIZE - cell * 5) / 2
    y0 = (SIZE - cell * 7) / 2
    parts = [
        f'<rect x="8" y="8" width="240" height="240" rx="42" fill="{col["edge"]}"/>',
        f'<rect x="15" y="15" width="226" height="226" rx="36" fill="{col["fill"]}"/>',
    ]
    for r, line in enumerate(rows):
        for c, ch_ in enumerate(line):
            if ch_ != "#":
                continue
            x, y = x0 + c * cell, y0 + r * cell
            parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{cell + 0.6:.2f}" height="{cell + 0.6:.2f}" fill="{col["ink"]}"/>')
            parts.append(
                f'<text x="{x + cell / 2:.2f}" y="{y + cell * 0.78:.2f}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="{cell * 0.95:.2f}" font-weight="bold" '
                f'fill="{col["soft"] if pid[0] == "b" else "#4a463f"}">#</text>')
    grid = [line.replace(".", " ") for line in rows]
    return svg_doc(pid, "\n".join(parts)).replace("EDGECOLOR", col["edge"]), grid


# ---------------------------------------------------------------------------


def build():
    sets = {}
    for color in "wb":
        for letter in "KQRBNP":
            pid = color + letter
            sets.setdefault("1-classic", {})[pid] = render_outlined(pid, CLASSIC[letter], 10, 15)
            sets.setdefault("2-chunky", {})[pid] = render_outlined(pid, CHUNKY[letter], 12, 15, aspect=0.82)
            sets.setdefault("3-mosaic", {})[pid] = render_mosaic(pid, MOSAIC[letter])
            sets.setdefault("4-coin", {})[pid] = render_coin(pid, COIN[letter])
            sets.setdefault("5-letters", {})[pid] = render_letter(pid, LETTERS[letter])
    return sets


def main():
    root = Path(__file__).parent / "sets"
    for name, pieces in build().items():
        out = root / name
        out.mkdir(parents=True, exist_ok=True)
        for pid, (svg, _) in pieces.items():
            (out / f"{pid}.svg").write_text(svg)
        (out / "ascii.json").write_text(json.dumps({pid: g for pid, (_, g) in pieces.items()}, indent=2) + "\n")
        print(f"wrote {len(pieces)} pieces to {out}")


if __name__ == "__main__":
    main()
