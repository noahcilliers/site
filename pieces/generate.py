"""Generate ASCII chess piece sprites.

Outputs (next to this script):
  ascii/<id>.txt   raw ASCII art
  svg/<id>.svg     scalable vector sprite (monospace text)
  png/<id>.png     256x256 transparent PNG (needs Pillow)
  pieces.json      all ASCII art as {id: [lines]} for terminal/text engines

Piece ids follow the common engine convention: colour + piece letter,
e.g. wK, wQ, wR, wB, wN, wP, bK, ... bP.

White pieces are hollow outlines; black pieces are the same outlines with
the inside filled with '#'.

Run:  python3 generate.py
"""

import json
from collections import deque
from pathlib import Path

ROWS, COLS = 10, 15
FILL = "#"

# Hollow (white) designs. Each is centred and bottom-aligned onto a
# ROWS x COLS grid, so every sprite lines up on the board.
DESIGNS = {
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

NAMES = {"K": "king", "Q": "queen", "R": "rook", "B": "bishop", "N": "knight", "P": "pawn"}


def to_grid(art: str) -> list[str]:
    lines = art.strip("\n").split("\n")
    width = max(len(l) for l in lines)
    lines = [l.ljust(width) for l in lines]
    if len(lines) > ROWS or width > COLS:
        raise ValueError(f"design too big: {len(lines)}x{width}")
    pad_left = (COLS - width) // 2
    lines = [(" " * pad_left + l).ljust(COLS) for l in lines]
    return [" " * COLS] * (ROWS - len(lines)) + lines


def fill_inside(grid: list[str]) -> list[str]:
    """Fill spaces not reachable from the border (4-connected) with FILL."""
    cells = [list(r) for r in grid]
    outside = set()
    q = deque()
    for r in range(ROWS):
        for c in range(COLS):
            if (r in (0, ROWS - 1) or c in (0, COLS - 1)) and cells[r][c] == " ":
                outside.add((r, c))
                q.append((r, c))
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < ROWS and 0 <= nc < COLS and (nr, nc) not in outside and cells[nr][nc] == " ":
                outside.add((nr, nc))
                q.append((nr, nc))
    for r in range(ROWS):
        for c in range(COLS):
            if cells[r][c] == " " and (r, c) not in outside:
                cells[r][c] = FILL
    return ["".join(r) for r in cells]


def build_pieces() -> dict[str, list[str]]:
    pieces = {}
    for letter, art in DESIGNS.items():
        hollow = to_grid(art)
        pieces["w" + letter] = hollow
        pieces["b" + letter] = fill_inside(hollow)
    return pieces


# Colours: white pieces are light ink with a dark outline, black pieces dark
# ink with a light outline, so both read on light and dark squares.
STYLE = {
    "w": {"ink": "#f5f5f5", "stroke": "#111111"},
    "b": {"ink": "#111111", "stroke": "#f5f5f5"},
}

SIZE = 256
CHAR_W = 0.6  # monospace advance as a fraction of font size
LINE_H = 1.2


def write_svg(pid: str, lines: list[str], path: Path) -> None:
    style = STYLE[pid[0]]
    fs = SIZE / (ROWS * LINE_H)
    x0 = (SIZE - COLS * CHAR_W * fs) / 2
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    tspans = "\n".join(
        f'    <tspan x="{x0:.2f}" y="{(i + 1) * fs * LINE_H - fs * 0.25:.2f}">{esc(l)}</tspan>'
        for i, l in enumerate(lines)
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}">
  <title>{"white" if pid[0] == "w" else "black"} {NAMES[pid[1]]}</title>
  <text xml:space="preserve" font-family="Menlo, Consolas, 'DejaVu Sans Mono', monospace"
        font-size="{fs:.2f}" font-weight="bold" fill="{style['ink']}"
        stroke="{style['stroke']}" stroke-width="{fs * 0.12:.2f}" paint-order="stroke"
        textLength="{COLS * CHAR_W * fs:.2f}" lengthAdjust="spacingAndGlyphs">
{tspans}
  </text>
</svg>
"""
    path.write_text(svg)


def load_font(size: int):
    from PIL import ImageFont

    for f in ("/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
              "C:/Windows/Fonts/consolab.ttf"):
        try:
            return ImageFont.truetype(f, size, index=1) if f.endswith(".ttc") else ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def write_png(pid: str, lines: list[str], path: Path) -> None:
    from PIL import Image, ImageDraw

    style = STYLE[pid[0]]
    # Pick the largest font size that fits the grid in the canvas.
    margin = 8
    fs = 40
    while fs > 6:
        font = load_font(fs)
        cw = font.getlength("M")
        lh = int(fs * LINE_H)
        if cw * COLS <= SIZE - 2 * margin and lh * ROWS <= SIZE - 2 * margin:
            break
        fs -= 1
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    x0 = (SIZE - cw * COLS) / 2
    y0 = (SIZE - lh * ROWS) / 2
    stroke = max(1, fs // 8)
    for i, line in enumerate(lines):
        draw.text((x0, y0 + i * lh), line, font=font, fill=style["ink"],
                  stroke_width=stroke, stroke_fill=style["stroke"])
    img.save(path)


def main() -> None:
    root = Path(__file__).parent
    pieces = build_pieces()
    for sub in ("ascii", "svg", "png"):
        (root / sub).mkdir(exist_ok=True)
    try:
        import PIL  # noqa: F401
        have_pil = True
    except ImportError:
        have_pil = False
        print("Pillow not installed: skipping PNGs (pip install pillow)")
    for pid, lines in pieces.items():
        (root / "ascii" / f"{pid}.txt").write_text("\n".join(lines) + "\n")
        write_svg(pid, lines, root / "svg" / f"{pid}.svg")
        if have_pil:
            write_png(pid, lines, root / "png" / f"{pid}.png")
    (root / "pieces.json").write_text(json.dumps(pieces, indent=2) + "\n")
    print(f"wrote {len(pieces)} pieces to {root}")


if __name__ == "__main__":
    main()
