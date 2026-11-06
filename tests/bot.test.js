import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BotPlayer } from '../src/application/botPlayer.js';
import { GameService } from '../src/application/gameService.js';
import { InMemoryGameRepository } from '../src/infrastructure/inMemoryGameRepository.js';
import { randomIds } from '../src/infrastructure/randomIds.js';
import { createHttpServer } from '../src/interfaces/http/server.js';

const quietLog = { error() {}, warn() {} };

/** Fake engine: answers from a list of moves, or with a function of the FEN. */
function scriptedEngine(answer) {
  const calls = [];
  return {
    calls,
    async chooseMove(fen) {
      calls.push(fen);
      return typeof answer === 'function' ? answer(fen, calls.length) : answer.shift();
    },
  };
}

function setup(engine, opts = {}) {
  const gameService = new GameService({ repository: new InMemoryGameRepository(), ids: randomIds });
  const bot = new BotPlayer({ gameService, engine, log: quietLog, retryMs: 10, ...opts });
  return { gameService, bot };
}

test('bot playing black replies after white moves', async () => {
  const engine = scriptedEngine(['e7e5']);
  const { gameService, bot } = setup(engine);
  const { game, seats } = await gameService.createGame();
  bot.play(game.id, seats.black, 'black');

  await gameService.makeMove(game.id, seats.white, 'e2e4');
  const after = await gameService.waitForChange(game.id, 1, 2000);
  assert.equal(after.version, 2);
  assert.equal(after.history[1].san, 'e5');
  assert.match(engine.calls[0], /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /); // engine got the FEN after 1. e4

  await gameService.resign(game.id, seats.white);
});

test('bot playing white moves first', async () => {
  const { gameService, bot } = setup(scriptedEngine(['d2d4']));
  const { game, seats } = await gameService.createGame();
  bot.play(game.id, seats.white, 'white');

  const after = await gameService.waitForChange(game.id, 0, 2000);
  assert.equal(after.history[0].san, 'd4');
  await gameService.resign(game.id, seats.black);
});

test('an illegal engine move falls back to a legal one', async () => {
  const { gameService, bot } = setup(scriptedEngine(['e2e5']));
  const { game, seats } = await gameService.createGame();
  bot.play(game.id, seats.white, 'white');

  const after = await gameService.waitForChange(game.id, 0, 2000);
  assert.equal(after.version, 1);
  assert.equal(after.turn, 'black');
  await gameService.resign(game.id, seats.black);
});

test('bot retries when the engine fails, then moves', async () => {
  const engine = scriptedEngine((fen, n) => {
    if (n < 3) throw new Error('bot server down');
    return 'g1f3';
  });
  const { gameService, bot } = setup(engine);
  const { game, seats } = await gameService.createGame();
  bot.play(game.id, seats.white, 'white');

  const after = await gameService.waitForChange(game.id, 0, 2000);
  assert.equal(after.history[0].san, 'Nf3');
  assert.equal(engine.calls.length, 3);
  await gameService.resign(game.id, seats.black);
});

test('bot stops once the game is over', async () => {
  const engine = scriptedEngine(() => 'e7e5');
  const { gameService, bot } = setup(engine);
  const { game, seats } = await gameService.createGame();
  bot.play(game.id, seats.black, 'black');

  await gameService.resign(game.id, seats.white);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(engine.calls.length, 0);
});

// ---------- HTTP: POST /api/games {"opponent":"bot"} ----------

let server;
let base;
let httpService;

before(async () => {
  httpService = new GameService({ repository: new InMemoryGameRepository(), ids: randomIds });
  const botPlayer = new BotPlayer({ gameService: httpService, engine: scriptedEngine(() => 'e7e5'), log: quietLog });
  server = createHttpServer({ gameService: httpService, botPlayer, publicDir: 'public', piecesDir: 'pieces' });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test('HTTP: playing the bot returns only your seat, and the bot replies', async () => {
  const created = await call('POST', '/api/games', { body: { opponent: 'bot', color: 'white' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.opponent, 'bot');
  assert.deepEqual(Object.keys(created.data.seats), ['white']);

  const { id } = created.data.game;
  const token = created.data.seats.white;
  await call('POST', `/api/games/${id}/moves`, { token, body: { move: 'e2e4' } });
  const after = await call('GET', `/api/games/${id}?since=1&timeout=2`);
  assert.equal(after.data.history[1].san, 'e5');

  await call('POST', `/api/games/${id}/resign`, { token });
});

test('HTTP: bad bot requests are rejected', async () => {
  assert.equal((await call('POST', '/api/games', { body: { opponent: 'bot' } })).status, 400);
  assert.equal((await call('POST', '/api/games', { body: { opponent: 'bot', color: 'red' } })).status, 400);
  assert.equal((await call('POST', '/api/games', { body: { opponent: 'human' } })).status, 400);

  const noBot = createHttpServer({ gameService: httpService, publicDir: 'public', piecesDir: 'pieces' });
  await new Promise((r) => noBot.listen(0, r));
  const res = await fetch(`http://localhost:${noBot.address().port}/api/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opponent: 'bot', color: 'white' }),
  });
  assert.equal(res.status, 503);
  noBot.close();
});
