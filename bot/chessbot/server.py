from pathlib import Path
import uvicorn
from fastapi import FastAPI
from chessbot.model import ChessModel
import torch
from chessbot.inference import pick_move
from pydantic import BaseModel
import chess
from fastapi import FastAPI, HTTPException

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "chessbot_best.pt"
model = ChessModel()
model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu", weights_only=True))
model.eval()

app = FastAPI()


class MoveRequest(BaseModel):
    fen: str


@app.post("/move")
def compute_move(req: MoveRequest):
    try:
        board = chess.Board(req.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid FEN")
    if board.is_game_over():
        raise HTTPException(status_code=400, detail="game is over")
    return {"move": pick_move(model, req.fen)}



def main():
    uvicorn.run(app, host="127.0.0.1", port=8000)



if __name__ == "__main__":
    main()