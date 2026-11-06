"""
define the model here

no training, no eval just model

transformer based model

we need to define our input and ouput

input: 
start with
flattened map : 1x64

later add
prev moves :
permissions : 


output layer: whatever size X 1,858 
- softmax
- set illegal to -inf
- argmax
- back to vocab

"""


import torch
import torch.nn as nn
from chessbot.training.tokens import PIECE_IDS, MOVES, MOVE_TO_INDEX


class ChessModel(nn.Module):
    def __init__(self, dim=256):
        super().__init__()
        # so how many different tokens do we have in our input
        # so we want to encode our pieces along with their position
        # so we can have piece embeds and square embs
        self.piece_embedding = nn.Embedding(len(PIECE_IDS), dim)
        ## 13 x 512
        self.pos_embedding = nn.Embedding(64, dim)
        ## 64 x 512
        encoder_layer = nn.TransformerEncoderLayer(dim, nhead=4, dim_feedforward=1024, batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=6)
        ## 6 x 4(512^2) + 2x512^2 + 6x512
        self.norm = nn.LayerNorm(dim)
        self.out = nn.Linear(dim, len(MOVES))
        
    
    
    
    def forward(self, board):
        
        squares = torch.arange(64, device=board.device)
        x = self.piece_embedding(board)  + self.pos_embedding(squares)
        x = self.encoder(x)
        x = self.norm(x)
        return self.out(x.mean(dim=1))


print(PIECE_IDS)
print(sum(p.numel() for p in ChessModel().parameters()))