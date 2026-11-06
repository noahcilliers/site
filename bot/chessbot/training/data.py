"""
these helpers extract and format data for me train and test

"""
from pathlib import Path
import zstandard as zstd
import chess.pgn
import io


"""
so first we have to actually get the proper data and save it to a file
so

"""
script_dir = Path(__file__).parent


file_path = script_dir / ".." / ".." / ".."/ "data"/ "partial.pgn.zst"

file_path = file_path.resolve()

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

