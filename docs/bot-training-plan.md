# Plan: a chess bot that plays like me

Train a small transformer that, given a position, predicts the move I would play. It plays
on the site through the existing API and only ever chooses from the API's legal-move list.

## 1. Goal and how we'll know it works

- **Main metric:** move-match accuracy on my own games the model never saw (top-1 and top-3).
- **Baselines to beat:**
  1. The same model before fine-tuning on my games (general human play at my rating).
  2. Maia at my rating, as an outside reference.
- **Legality:** 100%, guaranteed by only scoring legal moves (see section 5).
- **Feel test:** I play it a few times and it should feel familiar: my openings, my habits, my
  kinds of mistakes.

## 2. Data

### My games

- **Target: 2,000–5,000 games. Minimum: about 1,000.**
  - Under ~500 games, fine-tuning mostly adds noise.
  - 1,000 games (about 35,000 of my moves) is enough to shift the model toward my style.
  - 2,000–5,000 is where personalisation clearly shows.
  - Past ~10,000, gains get smaller.
- Use **one time-control family** (e.g. only blitz, or only rapid). People play differently
  under different clocks, so mixing them blurs the style.
- Prefer **recent games**. My play changes as my rating changes. Weight the last year or two more
  heavily, or drop very old games.
- Exclude: non-standard variants, games under 10 moves, abandoned games, games against bots.
- Sources:
  - Lichess: `https://lichess.org/api/games/user/<username>` (PGN export)
  - Chess.com: the public API's monthly archives for my username

### Public games for pretraining

- The Lichess open database (`database.lichess.org`), one compressed PGN file per month.
- Keep games where **both players are within ±200 of my rating**, in **my time control**.
- **Target: about 500,000 filtered games** (about 20 million positions). That's enough to
  pretrain the ~11M model below. Scale up later only if it is clearly still improving.
- **Download only part of one month (about 1–3 GB). Never the whole file.**
  - Monthly files are big (tens of GB), but they are a single compressed stream, so you can
    read from the start and stop whenever you like:
    ```bash
    curl -s https://database.lichess.org/standard/<month-file>.pgn.zst \
      | zstd -dc | python3 filter_games.py --rating 1400-1800 --time blitz --max-games 500000
    ```
  - The filter script stops reading once it has enough games, and curl stops downloading with it.
  - Typically 5–15% of games pass the rating and time-control filter, so 500,000 kept games means
    reading about 3–10 million. That's roughly 1–3 GB of download.
  - Nothing big is saved. Only the kept games are written, at about 200–400 MB of PGN.
- **Training data on disk:** each example is about 150–200 bytes, so 20M positions is about
  3–4 GB. To save space, store only each game's move list and build the examples while training.

### Splits

- Split **by game, never by position**, so positions from one game can't be in both training and
  test.
- My games: hold out the **most recent 10–15%** as the test set. This tests what we care about:
  predicting how I play now.
- Public games: hold out 1% for validation during pretraining.

## 3. Turning games into examples

For each of **my** moves (in my games) or **every** move (in public games), produce:

| Field | Content |
|---|---|
| `board` | 64 tokens, one per square: empty, or one of 12 pieces |
| `meta` | side to move, 4 castling flags, en-passant file (or none), halfmove clock bucket |
| `history` | the last 12 moves played, as move tokens |
| `legal` | indexes of all legal moves |
| `target` | index of the move actually played |
| `weight` | 1.0, or higher for recent games during fine-tuning |

- Replay each PGN with the existing engine in `src/domain/` (`Position`, `legalMoves`, `toSan`).
  This handles SAN parsing and gives the exact same legal-move list the API serves, so training
  matches what the bot sees live.
- Save in a compact binary format (NumPy arrays or Parquet), not JSON.

## 4. Tokens and moves

**Input vocabulary (~100 tokens):**

- 13 piece tokens: empty plus white/black pawn, knight, bishop, rook, queen, king
- 64 square tokens, used for history moves
- 4 promotion tokens: q, r, b, n
- side, castling and en-passant tokens
- specials: `[CLS]`, `[SEP]`, `[PAD]`

The model never sees JSON. The bot server parses the API response and builds these tokens.

**Output: a fixed list of every possible move.**

- Number every move that can ever occur in UCI form (from-square, to-square, optional
  promotion). That's about 1,900 moves, the same idea Leela Chess Zero uses.
- The model outputs one score per move.
- Before the softmax, mask everything **not** in the position's legal list, so the probabilities
  only cover legal moves.

This is simpler and faster than generating move text character by character, and it makes an
illegal move impossible.

## 5. Model

An encoder-only transformer. It reads `[CLS] meta board [SEP] history`, about 90–100 tokens, and
puts a move-scoring head on the `[CLS]` output.

| Option | Layers | Width | Heads | Params | When to use |
|---|---|---|---|---|---|
| Small | 4 | 256 | 4 | ~3M | Training on my games only, or a first quick run |
| **Main** | 6 | 384 | 6 | ~11M | Pretrain on ~500k public games, then fine-tune on mine |
| Large | 8 | 512 | 8 | ~25M | Only with 2M+ public games and Main clearly still improving |

- Learned position embeddings: each board square always sits at the same position in the input.
- Dropout 0.1 for pretraining, 0.1–0.2 for fine-tuning.

## 6. Training

### Stage A: pretraining on public games

- Loss: cross-entropy on the masked move distribution.
- Optimiser: AdamW, learning rate 3e-4, cosine decay, ~2,000 warmup steps, weight decay 0.05.
- Batch: ~1,024 positions.
- 2–3 passes over the ~20M positions, stopping when validation accuracy flattens.

**Rough compute** for the Main model (~11M params) on 20M positions: about 1.3×10¹⁷ operations
per pass. That's very roughly half a day per pass on an Apple Silicon Mac, or under an hour on a
rented GPU. For a first pipeline check, use 1–2M positions; that runs in well under an hour.

### Stage B: fine-tuning on my games

- Start from the Stage A model.
- Learning rate 1e-5 to 5e-5, 3–10 epochs, **early stopping** on my held-out games.
- If it overfits (training accuracy rises while held-out falls):
  - freeze the bottom half of the layers, or
  - use LoRA adapters, or
  - mix ~20% public games into each batch so it doesn't forget general chess.
- Weight recent games higher.

## 7. Evaluation

Report on my held-out games:

- top-1 and top-3 move match for: pretrained only, fine-tuned, and Maia at my rating
- the same numbers split by game phase:
  - opening (moves 1–10)
  - middlegame
  - endgame (≤ 6 pieces besides kings and pawns)

Expect top-1 around 50% for a good human-move predictor. Personalisation should add a few points
on top of the pretrained model, mostly in openings and recurring structures.

## 8. Serving on the site

- A bot server exposes `POST /move` with `{ fen, legalMoves, history }` and returns `{ move }`.
- It builds tokens, runs the model, masks to `legalMoves`, then **samples** with temperature
  about 1.0 rather than always taking the top move. Sampling gives the natural variety a person
  shows. Use temperature 0 (always the top move) for evaluation runs.
- Each request is independent (the full position is in the request), so many games can run at
  once. Batch requests that arrive together.
- Speed: an 11M model on CPU takes milliseconds per move. A GPU isn't needed for serving.
- Missing piece: the chess server needs a hook that calls the bot's URL when it is the bot's
  turn and plays the returned move. It doesn't exist yet.

## 9. Milestones

1. **Data export:** download my games and stream ~500k Lichess games (1–3 GB), filtered by rating and time
   control.
2. **Example builder:** PGN to training arrays using the existing engine, with checks that every
   target move is in its legal list.
3. **Small model on my games only:** sanity-check the full pipeline end to end.
4. **Pretrain the Main model** on ~500k filtered public games (about 20M positions).
5. **Fine-tune on my games** and compare against baselines.
6. **Bot server and site hook:** play it live on the site.
7. **Iterate:** more data, sampling temperature, recency weighting.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Too few of my games | Rely on pretraining; fine-tune with frozen layers or LoRA. |
| Test leakage | Split by game and by date, never by position. |
| Mixed time controls | Filter to one family for both pretraining and fine-tuning. |
| Model plays "average player", not me | Check per-phase results. Raise fine-tuning epochs or recency weight while watching held-out accuracy. |
| My style changes over time | Retrain periodically on recent games. |
