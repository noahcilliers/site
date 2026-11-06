"""
these helpers extract and format data for me train and test

"""
from pathlib import Path
import zstandard as zstd
import chess
import chess.pgn
import io
import argparse
import csv
import gzip


"""
so first we have to actually get the proper data and save it to a file
so

"""
script_dir = Path(__file__).parent


file_path = script_dir / ".." / ".." / ".."/ "data"/ "partial.pgn.zst"

file_path = file_path.resolve()


def explore_low_elo_games():
    """First look at the data: print the 500-600 Elo games and their moves."""
    print(f"Reading from: {file_path}")

    counter = 0
    with open(file_path, 'rb') as fh:
        # Create a streaming decompressor
        dctx = zstd.ZstdDecompressor()
        with dctx.stream_reader(fh) as reader:
            # Wrap the byte stream into a text stream
            text_stream = io.TextIOWrapper(reader, encoding='utf-8')

            # Read games one by one efficiently without filling memory]
            while True:
                game = chess.pgn.read_game(text_stream)
                if game is None:
                    break  # End of file

                # Access the headers/tags directly
                white_player = game.headers.get("White")
                white_elo = game.headers.get("WhiteElo")
                white_elo = int(white_elo)
                result = game.headers.get("Result")

                termination = game.headers.get("Termination")
                if white_elo > 500 and white_elo < 600:
                    print(f"{white_player} ({white_elo}) managed a result of {result} through {termination}")

                    # If you want the actual moves as a list:
                    moves = [move.uci() for move in game.mainline_moves()]
                    print(moves)
                    counter += 1

    print(counter)

"""
ok so we have the data here but we can tell it is not in FEN format

so we're going to have to extract our games into fen format

this means we have to keep track of every little movement of the game

"""

"""
Pre-processing: turn the PGN games into training positions.

We replay every game move by move and record the FEN *before* each move, along
with the move that was actually played there (that move is the training label).

One game of N moves becomes N rows:

    game      ply  fen                                                       move  white_elo  black_elo  result
    Q8ku5wgM  0    rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  d2d4  1825       1790       1/2-1/2
    Q8ku5wgM  1    rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1  g8f6  1825       1790       1/2-1/2
    ...

Rows are written straight to a CSV file as we go, so the whole dataset never
has to fit in memory. tokens.py turns each FEN into model input at training time.

Usage (from the repo root):
    python bot/chessbot/training/data.py --max-games 1000
    python bot/chessbot/training/data.py --min-elo 1500 --max-elo 2000 --output data/positions_1500.csv.gz
"""

DEFAULT_OUTPUT = file_path.parent / "positions.csv"

COLUMNS = ["game", "ply", "fen", "move", "white_elo", "black_elo", "result"]


def read_games(path: Path):
    """Yield games one at a time from a .pgn.zst (or plain .pgn) file."""
    with open(path, "rb") as fh:
        if path.suffix == ".zst":
            stream = io.TextIOWrapper(zstd.ZstdDecompressor().stream_reader(fh), encoding="utf-8")
        else:
            stream = io.TextIOWrapper(fh, encoding="utf-8")
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                return
            yield game


def game_to_positions(game: chess.pgn.Game) -> list[tuple[str, str]]:
    """Replay a game and return (fen_before_move, move_uci) for every move."""
    board = game.board()  # starting position (normally the standard one)
    positions = []
    for move in game.mainline_moves():
        positions.append((board.fen(), move.uci()))
        board.push(move)
    return positions


def parse_elo(value: str | None) -> int | None:
    """Lichess writes '?' when a rating is missing."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def keep_game(game: chess.pgn.Game, min_elo: int, max_elo: int) -> bool:
    """Only standard chess, both ratings known and inside [min_elo, max_elo]."""
    headers = game.headers
    if headers.get("Variant", "Standard") != "Standard":
        return False
    if game.errors:  # python-chess hit an illegal or unreadable move
        return False
    white_elo = parse_elo(headers.get("WhiteElo"))
    black_elo = parse_elo(headers.get("BlackElo"))
    if white_elo is None or black_elo is None:
        return False
    return min_elo <= white_elo <= max_elo and min_elo <= black_elo <= max_elo


def game_id(game: chess.pgn.Game, fallback: int) -> str:
    """The Lichess id from the Site header (…/game/Q8ku5wgM), or a running number."""
    site = game.headers.get("Site", "")
    return site.rsplit("/", 1)[-1] if "/" in site else str(fallback)


def build_dataset(input_path: Path, output_path: Path, max_games: int | None = None,
                  min_elo: int = 0, max_elo: int = 10_000) -> None:
    """Stream games from input_path and write one CSV row per position to output_path.

    A path ending in .gz is gzip-compressed (a lot smaller than plain CSV).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    opener = gzip.open if output_path.suffix == ".gz" else open

    games_seen = games_kept = positions_written = 0
    with opener(output_path, "wt", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(COLUMNS)

        for game in read_games(input_path):
            games_seen += 1
            if not keep_game(game, min_elo, max_elo):
                continue

            positions = game_to_positions(game)
            if not positions:
                continue

            gid = game_id(game, games_seen)
            white_elo = game.headers["WhiteElo"]
            black_elo = game.headers["BlackElo"]
            result = game.headers.get("Result", "*")
            for ply, (fen, move) in enumerate(positions):
                writer.writerow([gid, ply, fen, move, white_elo, black_elo, result])

            games_kept += 1
            positions_written += len(positions)
            if games_kept % 10_000 == 0:
                print(f"{games_kept:,} games kept / {games_seen:,} read, {positions_written:,} positions")
            if max_games is not None and games_kept >= max_games:
                break

    print(f"Done: {games_kept:,} games kept / {games_seen:,} read, "
          f"{positions_written:,} positions -> {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Turn PGN games into (FEN, move) training positions.")
    parser.add_argument("--input", type=Path, default=file_path, help="PGN file (.pgn or .pgn.zst)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV file (.csv or .csv.gz)")
    parser.add_argument("--max-games", type=int, default=None, help="stop after this many kept games")
    parser.add_argument("--min-elo", type=int, default=0, help="both players must be at least this")
    parser.add_argument("--max-elo", type=int, default=10_000, help="both players must be at most this")
    args = parser.parse_args()

    print(f"Reading from: {args.input}")
    build_dataset(args.input, args.output, args.max_games, args.min_elo, args.max_elo)


if __name__ == "__main__":
    main()
