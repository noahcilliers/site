"""
What tokens.py does


Reads a FEN string and works out which piece is on each square.
Turns that into 64 board tokens, plus tokens for whose turn it is, castling and en passant.
Turns the last 12 moves into tokens.
Builds the list of every possible move (about 1,900 of them) by walking through every from-square, to-square and promotion.
Makes the mask that hides illegal moves.



So if we grab this 8x8 matrix can we just flatten and feed that as the input???
"""

## get inputs
PIECE_IDS = {".": 0, "P": 1, "N": 2, "B": 3, "R": 4, "Q": 5, "K": 6,
             "p": 7, "n": 8, "b": 9, "r": 10, "q": 11, "k": 12}

def fen_to_matrix(fen: str) -> list[list[str]]:
    """Turn the piece part of a FEN string into an 8x8 board.

    Row 0 is rank 8 (black's back rank), row 7 is rank 1.
    Column 0 is the a-file, column 7 is the h-file.
    Cells hold the FEN letter ("K", "p", ...) or "." for an empty square.
    """
    placement = fen.split()[0]
    ranks = placement.split("/")
    if len(ranks) != 8:
        raise ValueError(f"expected 8 ranks, got {len(ranks)}: {placement!r}")

    board = []
    for rank in ranks:
        row = []
        for ch in rank:
            if ch.isdigit():
                row.extend("." * int(ch))   # digit = that many empty squares
            elif ch in "pnbrqkPNBRQK":
                row.append(ch)
            else:
                raise ValueError(f"bad character {ch!r} in rank {rank!r}")
        if len(row) != 8:
            raise ValueError(f"rank {rank!r} has {len(row)} squares, expected 8")
        board.append(row)
    return board


def board_tokens(fen: str) -> list[int]:
    """64 ints, always from the side to move's view (their pieces uppercase, at the bottom)."""
    board = fen_to_matrix(fen)
    if fen.split()[1] == "b":
        board = [[c.swapcase() for c in row] for row in reversed(board)]
    return [PIECE_IDS[c] for row in board for c in row]



FILES = "abcdefgh"

def build_move_vocab() -> list[str]:
    """Every move shape in chess, from the side to move's view, in a fixed order.

    Line moves (any queen-like direction) and knight jumps from every square, plus
    underpromotions to n/b/r. Queen promotion is the plain move (e7e8).
    Returns 1858 UCI strings; a move's index in this list is its output slot.
    """
    lines = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    jumps = [(1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2)]
    name = lambda f, r: FILES[f] + str(r + 1)

    moves = []
    for sq in range(64):                      # a1, b1, ... h8
        f, r = sq % 8, sq // 8
        for df, dr in lines:                  # slide until the edge
            x, y = f + df, r + dr
            while 0 <= x < 8 and 0 <= y < 8:
                moves.append(name(f, r) + name(x, y))
                x, y = x + df, y + dr
        for df, dr in jumps:
            x, y = f + df, r + dr
            if 0 <= x < 8 and 0 <= y < 8:
                moves.append(name(f, r) + name(x, y))
        if r == 6:                            # pawn on the 7th: underpromotions
            for df in (-1, 0, 1):
                if 0 <= f + df < 8:
                    for piece in "nbr":
                        moves.append(name(f, r) + name(f + df, 7) + piece)

    assert len(moves) == len(set(moves)) == 1858
    return moves

MOVES = build_move_vocab()
MOVE_TO_INDEX = {m: i for i, m in enumerate(MOVES)}
#print(MOVES[0])