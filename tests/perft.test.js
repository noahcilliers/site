// Perft counts every leaf of the move tree to a fixed depth and compares against
// published reference numbers. It is the standard check that move generation is correct.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Position } from '../src/domain/position.js';
import { applyMove, legalMoves } from '../src/domain/rules.js';

function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(pos, m), depth - 1);
  return n;
}

const cases = [
  ['start position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

for (const [name, fen, expected] of cases) {
  test(`perft: ${name}`, () => {
    const pos = Position.fromFEN(fen);
    expected.forEach((count, i) => assert.equal(perft(pos, i + 1), count, `depth ${i + 1}`));
  });
}
