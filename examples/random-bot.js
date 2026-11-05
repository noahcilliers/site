// Example API player. It only uses the public HTTP API, the same way any other client would.
//
//   node examples/random-bot.js <server-url> <game-id> <seat-token>
//   node examples/random-bot.js http://localhost:3000 3fa2c1d0 9b1e...
//
// Strategy: take a checkmate if available, else prefer captures, else play a random move.

const [server = 'http://localhost:3000', gameId, token] = process.argv.slice(2);
if (!gameId || !token) {
  console.error('Usage: node examples/random-bot.js <server-url> <game-id> <seat-token>');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(server + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function pickMove(game) {
  const moves = game.legalMoves;
  const captures = moves.filter((uci) => {
    const file = uci.charCodeAt(2) - 97;
    const rank = Number(uci[3]);
    return game.board[8 - rank][file] !== null;
  });
  const pool = captures.length && Math.random() < 0.7 ? captures : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

const { color } = await call('GET', `/api/games/${gameId}/seat`);
console.log(`Playing ${color} in game ${gameId}`);

let game = await call('GET', `/api/games/${gameId}`);
while (game.status === 'active') {
  if (game.turn === color) {
    await new Promise((r) => setTimeout(r, 400)); // feel a little more human
    const uci = pickMove(game);
    const res = await call('POST', `/api/games/${gameId}/moves`, { move: uci });
    console.log(`${color} plays ${res.move.san}`);
    game = res.game;
  } else {
    game = await call('GET', `/api/games/${gameId}?since=${game.version}`); // long-poll
  }
}
console.log(`Game over: ${game.status}${game.winner ? `, ${game.winner} wins` : ''}`);
