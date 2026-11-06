"""
This file will define my datasets and dataloaders

this is absolutely necassary for training my model because it is how we are going to 
abstract the processing and make training so so so much easier

so for our shape its really just

input: batch x 64 

labels: string

training

get our final probs
-> take the CELoss of the label class
-> label can just be that string indicator
-> we'll just consult the dict, and then do CELoss on that splish

the purpose of our dataset is to store the data in our memory
the purpose of the dataloader is to grab that data and return it in batches
so when we grab the frame, we will convert it to labels and fewns

"""
import os
import pandas as pd
import torch
from torch.utils.data import Dataset
from tokens import board_tokens, PIECE_IDS, MOVE_TO_INDEX, MOVES

class ChessGameDataset(Dataset):
    def __init__(self, df):
        self.df = df
    
    def flip_move(self, move):
        """Mirror a UCI move top-to-bottom: b8c6 -> b1c3, e2e1q -> e7e8q."""
        return move[0] + str(9 - int(move[1])) + move[2] + str(9 - int(move[3])) + move[4:]
    
    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        fen, move = row["fen"], row["move"]
        board = torch.tensor(board_tokens(fen), dtype=torch.long)
        if fen.split()[1] == "b":      # Black to move → board was flipped, so flip the move too
            move = self.flip_move(move)
        if move.endswith("q"):         # queen promotion is stored as the plain move in MOVES
            move = move[:-1]
        label = MOVE_TO_INDEX[move]
        return board, label


def games_in_batches(path, games_per_batch, chunk_rows=500_000):
    """Yield DataFrames holding games_per_batch whole games each."""
    buffer = pd.DataFrame()
    for chunk in pd.read_csv(path, chunksize=chunk_rows):
        buffer = pd.concat([buffer, chunk], ignore_index=True)
        game_num = (buffer["ply"] == 0).cumsum()          # 1,1,1,...,2,2,... one number per game
        while game_num.iloc[-1] > games_per_batch:         # buffer holds a full batch + start of the next game
            in_batch = game_num <= games_per_batch
            yield buffer[in_batch]
            buffer = buffer[~in_batch].reset_index(drop=True)
            game_num = game_num[~in_batch].reset_index(drop=True) - games_per_batch
    if len(buffer):
        yield buffer                                       # last, smaller batch


ID_TO_PIECE = {i: p for p, i in PIECE_IDS.items()}   # 0 → ".", 1 → "P", ...

def print_board(tokens):
    """Print 64 board tokens (list or tensor) as an 8x8 grid."""
    for r in range(8):
        row = tokens[r * 8:(r + 1) * 8]
        print(8 - r, " ".join(ID_TO_PIECE[int(t)] for t in row))
    print("  a b c d e f g h")








"""
this is like the loop we'll use for training

so lets not worry too much about it right now

lets go ahead and get out loader set up for this and then we'll be looking good 
to write a trianing alg


for games_df in games_in_batches("~/my-site/data/positions/positions.csv", games_per_batch=10):
    dataset = ChessGameDataset(games_df)        
    board, label = dataset[1]
    print_board(board)
    print(label, MOVES[label])
"""

