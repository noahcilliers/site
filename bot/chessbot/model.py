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
from chessbot.tokens import PIECE_IDS, MOVES, MOVE_TO_INDEX


class ChessModel(nn.Module):
    def _init_():
        super().__init__()
        self.piece_embedding = nn.Embedding()
    
    
    
    
    def forward(x):