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


##import torch
import torch.nn as nn
from chessbot.tokens import PIECE_IDS, MOVES, MOVE_TO_INDEX


class ChessModel(nn.Module):
    def _init_(self, dim):
        super().__init__()
        # so how many different tokens do we have in our input
        # so we want to encode our pieces along with their position
        # so we can have piece embeds and square embs
        self.piece_embedding = nn.Embedding(len(PIECE_IDS), dim)
        self.pos_embedding = nn.Embedding(64, dim)

        self.encode = nn.TransformerEncodeLayer(dim, nhead=4, bath_first=True)
        self.decode = nn.TransformerDecodeLayer(dim, nhead=16, batch_first=True)
    
        self.out = nn.Linear(dim, len(MOVES))
    
    
    
    def forward(self, board):
        
        squares = torch.arange(64, device=board.device)
        x = self.piece_embedding(board)  + self.pos_embedding(squares)
        x = self.encode(x)
        x = self.decode(x)
        
        return self.out(x)


print(PIECE_IDS)