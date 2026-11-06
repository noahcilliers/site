"""
This defines my training algorithms for the model


for games_df in games_in_batches("~/my-site/data/positions/positions.csv", games_per_batch=10):
    dataset = ChessGameDataset(games_df)        
    board, label = dataset[1]
    print_board(board)
    print(label, MOVES[label])

"""
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from data import ChessGameDataset
from bot.chessbot.model import ChessModel
import torch.optim as optim

def train():
    """
    setup model: load or build

    optimizer


    """
    model = ChessModel()
    optimizer = optim.AdamW(
    model.parameters(), 
    lr=0.001, 
    betas=(0.9, 0.999), 
    eps=1e-08, 
    weight_decay=0.01, 
    amsgrad=False,
    fused=None
    )

    run_training(model, optimizer)





def run_training(model, optimizer, nums_epochs=10):
    df = pd.read_csv("~/my-site/data/positions/positions.csv")

    # split by game, not by row, so no game is in both sets
    games = pd.Series(df["game"].unique())
    valid_games = set(games.sample(frac=0.1, random_state=42))
    valid_df = df[df["game"].isin(valid_games)]
    train_df = df[~df["game"].isin(valid_games)]

    train_dataloader = DataLoader(ChessGameDataset(train_df), batch_size=64, shuffle=True)
    valid_dataloader = DataLoader(ChessGameDataset(valid_df), batch_size=64, shuffle=False)

    loss_fn = nn.CrossEntropyLoss()
    for epoch in range(nums_epochs):


if __name__ == "__main__":
    train()    
    
    