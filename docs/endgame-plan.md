# Plan: teach the bot to finish games

The bot plays reasonable openings and middlegames but can't convert won endgames. It shuffles
pieces in positions like K+Q vs K instead of delivering mate. This plan fixes that in two parts:

1. **Play-time fixes** in `inference.py`. These are fast and exact, and need no training.
2. **Endgame fine-tune** of `chessbot_small_.pt`, so the model itself plays endgames better.

## 1. Why it fails

Measured on the training set (`positions_1200_1800.csv`, 100,000 games, 6.48M positions):

| | Positions | Share |
|---|---|---|
| 12 or fewer pieces | 678K | 10.5% |
| 10 or fewer pieces | 455K | 7.0% |
| 6 or fewer pieces | 150K | 2.3% |

- **Only 24.5% of games end in checkmate.** Most end by resignation, timeout or draw before the
  win is converted, so the bot almost never sees a mate played out to the end.
- **The endgames it does see are 1200–1800 players**, who often play them badly.
- **No move history.** The model only sees the current board, so it can't tell it's repeating
  itself. It also can't tell how close the 50-move rule is.
- **Imitation, not search.** In a won endgame many moves look "fine" to a human-move predictor,
  so it picks one that's plausible but makes no progress.

## 2. Part 1: play-time fixes (no training)

All of these go in `pick_move` in `bot/chessbot/inference.py`, applied in this order. If a step
decides the move, return it; otherwise fall through to the model.

### 2a. Endgame tablebase (5 or fewer pieces)

- python-chess has `chess.syzygy` built in.
- Download the 3-4-5 piece Syzygy tables (WDL + DTZ, about 1 GB) into `bot/tablebases/`
  (gitignore it). Source: `https://tablebase.lichess.ovh/tables/standard/3-4-5/`.
- Open once when the server starts: `tb = chess.syzygy.open_tablebase(path)`.
- If `chess.popcount(board.occupied) <= 5`, choose the move with:
  1. the best result for us: the lowest `tb.probe_wdl(board_after)`, since it's scored from the
     opponent's side
  2. among winning moves, the fastest progress: prefer a mate, then a capture or pawn move that
     keeps the win, then the smallest `abs(tb.probe_dtz(board_after))`
- This plays K+Q vs K, K+R vs K, K+P vs K and all other 5-piece endings perfectly.
- If the tables are missing, skip this step so the server still runs.

### 2b. Mate in one

- Try every legal move. If `board.is_checkmate()` after it, play it.
- About 30 move pushes per position, which costs nothing next to the model.

### 2c. Don't allow mate in one

- After the model scores moves, remove any move that lets the opponent mate next turn, unless
  every move does.
- About 30 × 30 pushes, still a few milliseconds.

### 2d. Avoid repetition when winning (needs history)

- The JS server only sends the FEN, so the bot can't see repetitions. Send the game's earlier
  FENs too:
  - `httpMoveEngine.js`: `body: { fen, history: [fen, ...] }`
  - `server.py`: `MoveRequest` gets an optional `history: list[str] = []`
- In `pick_move`, if we're ahead in material, drop moves that reach a position already in
  `history` twice (that's a threefold repetition draw), unless no other move is left.

**Done when:** in a test position, the bot mates with K+Q vs K and K+R vs K every time, and the
JS tests still pass.

## 3. Part 2: endgame fine-tune

### 3a. Data

Build a new file, `data/positions/positions_endgame.csv`, from the same PGN
(`data/partial.pgn.zst`). We've only used 100,000 of its ~2.2M games so far.

New flags for `preprocessing.py`:

| Flag | Meaning |
|---|---|
| `--max-pieces 12` | only keep positions with at most this many pieces (kings included) |
| `--winner-only` | in decisive games, keep only the winning side's moves; keep both sides in draws |
| `--skip-games N` | skip the first N kept games, so we don't reuse the 100k from training |

Run with higher-rated games, since their endgame technique is much better:

```bash
python bot/chessbot/training/preprocessing.py \
  --min-elo 1800 --max-pieces 12 --winner-only \
  --output data/positions/positions_endgame.csv
```

- **Target: 500K–1M endgame positions.** At ~6–7 endgame positions per game (fewer with
  `--winner-only`), that's roughly 150K–300K games.
- Keep the CSV columns the same (`game,ply,fen,move,white_elo,black_elo,result`) so
  `ChessGameDataset` reads it unchanged.

### 3b. Training

Add a `finetune()` next to `train()` in `bot/chessbot/training/training.py`:

- **Start from** `chessbot_small_.pt`: build `ChessModel()`, then `load_state_dict`.
- **Mix data:** 75% endgame positions plus 25% positions sampled from
  `positions_1200_1800.csv`, so it doesn't forget openings and middlegames.
- **Split** by game id, 10% held out, as in `run_training`.
- **Learning rate** `5e-5` (6× lower than pretraining), AdamW, weight decay 0.01.
- **1–2 epochs.** Save the best by validation loss to `models/chessbot_endgame.pt`.
- **Time:** at 94 ms per batch of 64, 1.3M positions ≈ 20K batches ≈ **35 minutes per epoch**.

To make `run_training` reusable, give it `csv_paths`, `lr` and `save_name` arguments rather than
hard-coding them.

### 3c. Better labels (optional, later)

Human moves in endgames are still noisy, even at 1800+. Two upgrades:

- **Tablebase labels:** for positions with 5 or fewer pieces, replace the human move with the
  tablebase's best move (same logic as 2a). These labels are perfect.
- **Stockfish labels:** for 6–12 pieces, label with Stockfish's best move at a shallow depth
  (`chess.engine`). This needs Stockfish installed (`brew install stockfish`) and takes longer
  to build.

## 4. Measuring it

Track the following before and after each change:

| Test | How | Goal |
|---|---|---|
| Endgame accuracy | top-1 move match on held-out positions with 12 or fewer pieces | up vs. `chessbot_small_.pt` |
| Overall accuracy | top-1 on the normal validation set | not worse than before |
| Conversion rate | 50 random won positions (K+Q vs K, K+R vs K, K+2 pawns vs K, R+P vs R); bot plays the winning side against a tablebase defender | mate or a won tablebase position within 50 moves |
| Live feel | play a few games on the site through to the end | it finishes games |

Put the conversion test in `bot/chessbot/eval_endgames.py` so it can be rerun after every change.

## 5. Order of work

1. **Mate in one + don't allow mate in one** (2b, 2c). About 15 minutes; fixes the worst
   blunders right away.
2. **Tablebase** (2a). Download about 1 GB; endings with 5 or fewer pieces become perfect.
3. **Conversion test** (`eval_endgames.py`), to get a baseline before training.
4. **Endgame dataset**: preprocessing flags, then build `positions_endgame.csv`.
5. **Fine-tune** to `chessbot_endgame.pt`, compare it with the tests above, and point
   `server.py`'s `MODEL_PATH` at it if it wins.
6. **History for repetition** (2d). Touches both the JS and Python servers.
7. **Optional:** tablebase or Stockfish labels (3c) if the 6–12 piece endings are still weak.

## 6. Risks

| Risk | Fix |
|---|---|
| Fine-tune makes openings worse | Keep the 25% mix of normal positions; check overall accuracy; lower the LR. |
| `--winner-only` learns overconfident play | Compare against a run without it on the conversion test. |
| Tablebase files missing on another machine | Make step 2a optional at startup. |
| 2c misses deeper mates | Expected. It only stops one-move blunders, and the model has to handle the rest. |
| Repetition rule causes blunders | Only apply it when ahead in material, and never remove the last legal move. |
