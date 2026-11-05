import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLACK, Game, IllegalMoveError, NotYourTurnError, Position, STATUS, WHITE,
} from '../src/domain/index.js';

const play = (game, ...moves) => moves.forEach((m) => game.play(game.turn, m));

test("fool's mate ends in checkmate with SAN suffix", () => {
  const g = new Game({ id: 't' });
  play(g, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(g.status, STATUS.CHECKMATE);
  assert.equal(g.winner, BLACK);
  assert.equal(g.history.at(-1).san, 'Qh4#');
  assert.deepEqual(g.legalMoves(), []);
});

test('rejects moves out of turn and illegal moves', () => {
  const g = new Game({ id: 't' });
  assert.throws(() => g.play(BLACK, 'e7e5'), NotYourTurnError);
  assert.throws(() => g.play(WHITE, 'e2e5'), IllegalMoveError);
  assert.throws(() => g.play(WHITE, 'e1e2'), IllegalMoveError);
});

test('accepts object move format', () => {
  const g = new Game({ id: 't' });
  const rec = g.play(WHITE, { from: 'g1', to: 'f3' });
  assert.equal(rec.san, 'Nf3');
});

test('en passant', () => {
  const g = new Game({ id: 't' });
  play(g, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  const rec = g.play(WHITE, 'e5d6');
  assert.equal(rec.flag, 'enpassant');
  assert.equal(rec.san, 'exd6');
  assert.match(g.position.toFEN(), /^rnbqkbnr\/1pp1pppp\/p2P4\/8\/8\/8\/PPPP1PPP\/RNBQKBNR b KQkq - 0 3$/);
});

test('castling moves the rook and clears rights', () => {
  const g = new Game({ id: 't', position: Position.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1') });
  assert.equal(g.play(WHITE, 'e1g1').san, 'O-O');
  assert.equal(g.play(BLACK, 'e8c8').san, 'O-O-O');
  assert.equal(g.position.toFEN(), '2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2');
});

test('cannot castle through check', () => {
  const g = new Game({ id: 't', position: Position.fromFEN('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1') });
  assert.throws(() => g.play(WHITE, 'e1g1'), IllegalMoveError);
});

test('promotion defaults to queen and supports underpromotion', () => {
  const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
  const g1 = new Game({ id: 't', position: Position.fromFEN(fen) });
  assert.equal(g1.play(WHITE, 'a7a8').san, 'a8=Q');
  const g2 = new Game({ id: 't', position: Position.fromFEN(fen) });
  assert.equal(g2.play(WHITE, { from: 'a7', to: 'a8', promotion: 'knight' }).san, 'a8=N');
});

test('stalemate', () => {
  const g = new Game({ id: 't', position: Position.fromFEN('7k/8/6Q1/8/8/8/8/K7 w - - 0 1') });
  g.play(WHITE, 'g6f7');
  assert.equal(g.status, STATUS.STALEMATE);
  assert.equal(g.winner, null);
});

test('threefold repetition', () => {
  const g = new Game({ id: 't' });
  play(g, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(g.status, STATUS.DRAW_REPETITION);
});

test('insufficient material after capture', () => {
  const g = new Game({ id: 't', position: Position.fromFEN('7k/8/8/8/8/8/1r6/K6n w - - 0 1') });
  assert.equal(g.status, STATUS.ACTIVE);
  g.play(WHITE, 'a1b2');
  assert.equal(g.status, STATUS.DRAW_MATERIAL);
});

test('SAN disambiguation', () => {
  const g = new Game({ id: 't', position: Position.fromFEN('4k3/8/8/8/8/8/4K3/R6R w - - 0 1') });
  assert.equal(g.play(WHITE, 'a1d1').san, 'Rad1');
});
