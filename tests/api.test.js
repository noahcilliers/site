import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GameService } from '../src/application/gameService.js';
import { InMemoryGameRepository } from '../src/infrastructure/inMemoryGameRepository.js';
import { randomIds } from '../src/infrastructure/randomIds.js';
import { createHttpServer } from '../src/interfaces/http/server.js';

let server;
let base;

before(async () => {
  const gameService = new GameService({ repository: new InMemoryGameRepository(), ids: randomIds });
  server = createHttpServer({ gameService, publicDir: 'public', piecesDir: 'pieces' });
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

test('full flow: create, move with seat tokens, errors, long-poll, resign', async () => {
  const created = await call('POST', '/api/games');
  assert.equal(created.status, 201);
  const { game, seats } = created.data;
  assert.equal(game.legalMoves.length, 20);

  // Wrong token and wrong turn
  assert.equal((await call('POST', `/api/games/${game.id}/moves`, { token: 'nope', body: { move: 'e2e4' } })).status, 403);
  assert.equal((await call('POST', `/api/games/${game.id}/moves`, { token: seats.black, body: { move: 'e7e5' } })).status, 409);
  assert.equal((await call('POST', `/api/games/${game.id}/moves`, { token: seats.white, body: { move: 'e2e5' } })).status, 422);
  assert.equal((await call('POST', `/api/games/${game.id}/moves`, { token: seats.white, body: { move: 'zz' } })).status, 400);

  // Long-poll resolves when the other seat moves
  const waiting = call('GET', `/api/games/${game.id}?since=0&timeout=5`);
  const moved = await call('POST', `/api/games/${game.id}/moves`, { token: seats.white, body: { move: 'e2e4' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.move.san, 'e4');
  assert.equal((await waiting).data.version, 1);

  const black = await call('POST', `/api/games/${game.id}/moves`, { token: seats.black, body: { from: 'e7', to: 'e5' } });
  assert.equal(black.data.game.turn, 'white');

  assert.equal((await call('GET', `/api/games/${game.id}/seat`, { token: seats.black })).data.color, 'black');
  assert.equal((await call('GET', `/api/games/${game.id}/moves`)).data.moves.length, 29);

  const resigned = await call('POST', `/api/games/${game.id}/resign`, { token: seats.black });
  assert.equal(resigned.data.status, 'resigned');
  assert.equal(resigned.data.winner, 'white');
  assert.equal((await call('POST', `/api/games/${game.id}/moves`, { token: seats.white, body: { move: 'd2d4' } })).status, 409);

  assert.equal((await call('GET', '/api/games/missing')).status, 404);
  assert.equal((await call('GET', '/api/games')).data.length, 1);
});

test('static files are served without path traversal', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  const sneaky = await fetch(`${base}/pieces/..%2fpackage.json`);
  assert.equal(sneaky.status, 404);
});
