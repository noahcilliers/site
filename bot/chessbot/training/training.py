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
from chessbot.model import ChessModel
import torch.optim as optim
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[2] / "models"   # my-site/bot/models
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

def train():
    """
    setup model: load or build

    optimizer


    """
    model = ChessModel().to(DEVICE)
    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)

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
    best_valid_loss = float("inf")

    for epoch in range(nums_epochs):
        """
        in training what are we doing?
        
        - run our training over the epoch

        - get our loss

        - apply the loss

        - get the valid

        keep track of : 
        - valid loss
        - total loss
        - epoch loss

        """
        train_loss = 0
        ### run train
        model.train()
        for boards, labels in train_dataloader:
            boards, labels = boards.to(DEVICE), labels.to(DEVICE)
            logits = model(boards)
            loss = loss_fn(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        train_loss /= len(train_dataloader)

        ### run valid
        model.eval()
        valid_loss = 0
        with torch.no_grad():
            for boards, labels in valid_dataloader:
                boards, labels = boards.to(DEVICE), labels.to(DEVICE)
                valid_loss += loss_fn(model(boards), labels).item()
        valid_loss /= len(valid_dataloader)

        print(f"For epoch {epoch} : {{ Training loss: {train_loss:.3f} loss and Valid loss: {valid_loss:.3f} }}")

        #save model
        if valid_loss < best_valid_loss:
            best_valid_loss = valid_loss
            torch.save(model.state_dict(), MODEL_DIR / "chessbot_best.pt")

if __name__ == "__main__":
    train()    
    
    