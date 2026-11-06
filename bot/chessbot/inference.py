import chess, torch
from chessbot.training.tokens import board_tokens, MOVES, MOVE_TO_INDEX

def flip_move(move):
    return move[0] + str(9 - int(move[1])) + move[2] + str(9 - int(move[3])) + move[4:]

def to_vocab(uci, black):
    """Real-board UCI move -> its index in MOVES (side-to-move view, queen promo = plain move)."""
    if black:
        uci = flip_move(uci)
    if uci.endswith("q"):
        uci = uci[:-1]
    return MOVE_TO_INDEX[uci]

@torch.no_grad()
def pick_move(model, fen, temperature=0.0):
    board = chess.Board(fen)
    black = board.turn == chess.BLACK
    x = torch.tensor(board_tokens(fen), dtype=torch.long).unsqueeze(0)   # (1, 64): a batch of one
    logits = model(x)[0]                                                 # (1858,)

    legal = {to_vocab(m.uci(), black): m for m in board.legal_moves}   # vocab index -> real move
    mask = torch.full_like(logits, float("-inf"))
    mask[list(legal)] = 0
    logits = logits + mask                                               # illegal moves -> -inf

    if temperature == 0:
        idx = logits.argmax().item()                                     # best move, no softmax needed
    else:
        probs = torch.softmax(logits / temperature, dim=-1)
        idx = torch.multinomial(probs, 1).item()
    return legal[idx].uci()