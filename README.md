# Chess engine + API

A chess engine with full rules, an HTTP API for making moves, and a small web UI.
One player moves on the web board; the other plays through the API.

No dependencies. Needs Node 20+.

```bash
npm start          # http://localhost:3000
npm test           # rules, perft and API tests
```

## How a game works

1. Open http://localhost:3000, pick a colour, click **Create game**.
2. The page shows a **game ID** and the opponent's **seat token**.
3. The opponent makes moves with that token through the API (curl, a bot, anything).
   The web board updates as soon as they move.

Try it with the example bot:

```bash
node examples/random-bot.js http://localhost:3000 <game-id> <seat-token>
```

## Architecture

```
src/
  domain/            Pure chess. No I/O, no HTTP.
    square.js        Square indexes ↔ names ("e4")
    piece.js         Colours, piece types, FEN letters
    position.js      Immutable board state, FEN in/out
    rules.js         Move generation, check detection, applying moves, SAN
    game.js          Game aggregate: turns, history, checkmate/stalemate/draws, resign
    errors.js        Domain errors (illegal move, not your turn, ...)
  application/
    gameService.js   Use cases: create, get, move, resign, wait for change. Seat tokens.
  infrastructure/
    inMemoryGameRepository.js   Storage adapter (swap for a database later)
    randomIds.js                ID/token generation
  interfaces/http/
    server.js        HTTP adapter: routes → GameService, errors → status codes, static files
    router.js
  main.js            Composition root: wires everything together
public/              Web UI (plain HTML/CSS/JS)
pieces/              Piece images (see below)
examples/            Example API player
tests/               node:test suites
```

Dependencies point inward: `interfaces → application → domain`. The domain can be reused
from a CLI, a different server, or a test without changes.

Rules covered: castling (incl. through-check), en passant, promotion (incl. underpromotion),
check, checkmate, stalemate, fifty-move rule, threefold repetition, insufficient material.
Move generation is checked against standard perft numbers.

## API

Moves for a seat need its token, sent as `Authorization: Bearer <token>`
(or `X-Seat-Token`, or `"token"` in the JSON body).

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/games` | New game. Returns `{ game, seats: { white, black } }` |
| `GET` | `/api/games` | List games |
| `GET` | `/api/games/:id` | Game state (board, FEN, turn, status, legal moves, history) |
| `GET` | `/api/games/:id?since=<version>` | Long-poll: waits until the game changes (up to `timeout` seconds, default 25) |
| `GET` | `/api/games/:id/moves` | Legal moves for the side to move, in UCI (`e2e4`, `e7e8q`) |
| `POST` | `/api/games/:id/moves` | Make a move. Body: `{"move":"e7e5"}` or `{"from":"e7","to":"e5","promotion":"q"}` |
| `POST` | `/api/games/:id/resign` | Resign your seat |
| `GET` | `/api/games/:id/seat` | Which colour your token controls |

Example:

```bash
curl -X POST http://localhost:3000/api/games/<id>/moves \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"move":"e7e5"}'
```

Errors return `{ "error": "..." }` with: `400` bad move format, `403` bad token,
`404` unknown game, `409` not your turn / game over, `422` illegal move.

## Piece images

Put image files (`.png`, `.svg`, `.webp`, ...) in `pieces/` or any subfolder. When a piece has
several images, PNG wins. The UI matches common names:
`wK.svg`, `bq.png`, `white-king.svg`, `black_knight.png`, `Chess_klt45.svg`.
Any piece without an image is drawn as a Unicode glyph.

Each folder that has all 12 pieces shows up in the **Pieces** picker on the page.
`pieces/generate_sets.py` (no dependencies) builds five ASCII sets into `pieces/sets/`:
classic, chunky, mosaic, coin and letters. Edit the art in that file and rerun it.

## Notes

Games live in memory, so restarting the server clears them.
