// Pure chess rules: move generation, attack detection, and applying moves.
// Every function takes a Position and returns new data; nothing is mutated.

import {
  BISHOP, KING, KNIGHT, PAWN, PROMOTION_TYPES, QUEEN, ROOK, WHITE,
  opposite, piece,
} from './piece.js';
import { Position } from './position.js';
import { offset, rankOf, toIndex, toName } from './square.js';

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const SQ = { a1: 0, b1: 1, c1: 2, d1: 3, e1: 4, f1: 5, g1: 6, h1: 7,
  a8: 56, b8: 57, c8: 58, d8: 59, e8: 60, f8: 61, g8: 62, h8: 63 };

/**
 * Move flags:
 *   normal | double (pawn two-step) | enpassant | castle-king | castle-queen
 */
function makeMove(pos, from, to, flag = 'normal', promotion = null) {
  const moving = pos.pieceAt(from);
  const captured = flag === 'enpassant'
    ? piece(opposite(moving.color), PAWN)
    : pos.pieceAt(to);
  return Object.freeze({ from, to, piece: moving, captured, promotion, flag });
}

export function toUci(move) {
  return toName(move.from) + toName(move.to) + (move.promotion ?? '');
}

/** Is `sq` attacked by any piece of color `by`? */
export function isSquareAttacked(pos, sq, by) {
  // Pawns: a `by` pawn attacks sq if it sits one rank "behind" sq diagonally.
  const pawnDr = by === WHITE ? -1 : 1;
  for (const df of [-1, 1]) {
    const s = offset(sq, df, pawnDr);
    const p = s >= 0 && pos.pieceAt(s);
    if (p && p.color === by && p.type === PAWN) return true;
  }
  for (const [df, dr] of KNIGHT_STEPS) {
    const s = offset(sq, df, dr);
    const p = s >= 0 && pos.pieceAt(s);
    if (p && p.color === by && p.type === KNIGHT) return true;
  }
  for (const [df, dr] of KING_STEPS) {
    const s = offset(sq, df, dr);
    const p = s >= 0 && pos.pieceAt(s);
    if (p && p.color === by && p.type === KING) return true;
  }
  const rayHits = (dirs, types) => dirs.some(([df, dr]) => {
    let s = offset(sq, df, dr);
    while (s >= 0) {
      const p = pos.pieceAt(s);
      if (p) return p.color === by && types.includes(p.type);
      s = offset(s, df, dr);
    }
    return false;
  });
  return rayHits(ORTHOGONAL, [ROOK, QUEEN]) || rayHits(DIAGONAL, [BISHOP, QUEEN]);
}

export function isInCheck(pos, color = pos.turn) {
  const king = pos.kingSquare(color);
  return king >= 0 && isSquareAttacked(pos, king, opposite(color));
}

/** Moves that obey piece movement rules but may leave the own king in check. */
export function pseudoLegalMoves(pos) {
  const moves = [];
  const us = pos.turn;
  const them = opposite(us);

  for (let from = 0; from < 64; from++) {
    const p = pos.pieceAt(from);
    if (!p || p.color !== us) continue;

    switch (p.type) {
      case PAWN: addPawnMoves(pos, from, moves); break;
      case KNIGHT: addStepMoves(pos, from, KNIGHT_STEPS, moves); break;
      case BISHOP: addSlideMoves(pos, from, DIAGONAL, moves); break;
      case ROOK: addSlideMoves(pos, from, ORTHOGONAL, moves); break;
      case QUEEN: addSlideMoves(pos, from, [...ORTHOGONAL, ...DIAGONAL], moves); break;
      case KING:
        addStepMoves(pos, from, KING_STEPS, moves);
        addCastlingMoves(pos, from, them, moves);
        break;
      default: break;
    }
  }
  return moves;
}

function addPawnMoves(pos, from, moves) {
  const us = pos.turn;
  const dir = us === WHITE ? 1 : -1;
  const startRank = us === WHITE ? 1 : 6;
  const promoRank = us === WHITE ? 7 : 0;

  const push = (to, flag) => {
    if (rankOf(to) === promoRank) {
      for (const promo of PROMOTION_TYPES) moves.push(makeMove(pos, from, to, flag, promo));
    } else {
      moves.push(makeMove(pos, from, to, flag));
    }
  };

  const one = offset(from, 0, dir);
  if (one >= 0 && !pos.pieceAt(one)) {
    push(one, 'normal');
    const two = offset(from, 0, 2 * dir);
    if (rankOf(from) === startRank && !pos.pieceAt(two)) {
      moves.push(makeMove(pos, from, two, 'double'));
    }
  }
  for (const df of [-1, 1]) {
    const to = offset(from, df, dir);
    if (to < 0) continue;
    const target = pos.pieceAt(to);
    if (target && target.color !== us) push(to, 'normal');
    else if (to === pos.enPassant) moves.push(makeMove(pos, from, to, 'enpassant'));
  }
}

function addStepMoves(pos, from, steps, moves) {
  for (const [df, dr] of steps) {
    const to = offset(from, df, dr);
    if (to < 0) continue;
    const target = pos.pieceAt(to);
    if (!target || target.color !== pos.turn) moves.push(makeMove(pos, from, to));
  }
}

function addSlideMoves(pos, from, dirs, moves) {
  for (const [df, dr] of dirs) {
    let to = offset(from, df, dr);
    while (to >= 0) {
      const target = pos.pieceAt(to);
      if (target) {
        if (target.color !== pos.turn) moves.push(makeMove(pos, from, to));
        break;
      }
      moves.push(makeMove(pos, from, to));
      to = offset(to, df, dr);
    }
  }
}

function addCastlingMoves(pos, from, them, moves) {
  const white = pos.turn === WHITE;
  const home = white ? SQ.e1 : SQ.e8;
  if (from !== home || isSquareAttacked(pos, home, them)) return;

  const rook = piece(pos.turn, ROOK);
  const empty = (...sqs) => sqs.every((s) => !pos.pieceAt(s));
  const safe = (...sqs) => sqs.every((s) => !isSquareAttacked(pos, s, them));

  const [kRight, qRight] = white ? ['K', 'Q'] : ['k', 'q'];
  const [f, g, h] = white ? [SQ.f1, SQ.g1, SQ.h1] : [SQ.f8, SQ.g8, SQ.h8];
  const [d, c, b, a] = white ? [SQ.d1, SQ.c1, SQ.b1, SQ.a1] : [SQ.d8, SQ.c8, SQ.b8, SQ.a8];

  if (pos.castling[kRight] && pos.pieceAt(h) === rook && empty(f, g) && safe(f, g)) {
    moves.push(makeMove(pos, from, g, 'castle-king'));
  }
  if (pos.castling[qRight] && pos.pieceAt(a) === rook && empty(d, c, b) && safe(d, c)) {
    moves.push(makeMove(pos, from, c, 'castle-queen'));
  }
}

/** Returns the Position after `move`. Assumes the move came from the generator. */
export function applyMove(pos, move) {
  const board = [...pos.board];
  const us = pos.turn;
  const { from, to, flag } = move;
  const moving = board[from];

  board[from] = null;
  board[to] = move.promotion ? piece(us, move.promotion) : moving;

  if (flag === 'enpassant') {
    board[offset(to, 0, us === WHITE ? -1 : 1)] = null;
  } else if (flag === 'castle-king') {
    board[to - 1] = board[to + 1];
    board[to + 1] = null;
  } else if (flag === 'castle-queen') {
    board[to + 1] = board[to - 2];
    board[to - 2] = null;
  }

  const castling = { ...pos.castling };
  if (moving.type === KING) {
    if (us === WHITE) castling.K = castling.Q = false;
    else castling.k = castling.q = false;
  }
  for (const sq of [from, to]) {
    if (sq === SQ.h1) castling.K = false;
    if (sq === SQ.a1) castling.Q = false;
    if (sq === SQ.h8) castling.k = false;
    if (sq === SQ.a8) castling.q = false;
  }

  return new Position({
    board,
    turn: opposite(us),
    castling,
    enPassant: flag === 'double' ? (from + to) / 2 : null,
    halfmove: moving.type === PAWN || move.captured ? 0 : pos.halfmove + 1,
    fullmove: us === WHITE ? pos.fullmove : pos.fullmove + 1,
  });
}

export function legalMoves(pos) {
  return pseudoLegalMoves(pos).filter((m) => !isInCheck(applyMove(pos, m), pos.turn));
}

/**
 * Finds the legal move matching a request.
 * Accepts "e2e4" / "e7e8q" or { from: 'e2', to: 'e4', promotion?: 'q' }.
 * Returns null if no legal move matches.
 */
export function findLegalMove(pos, request) {
  const { from, to, promotion } = parseMoveRequest(request);
  if (from < 0 || to < 0) return null;
  return legalMoves(pos).find((m) => m.from === from && m.to === to
    && (m.promotion ?? null) === (m.promotion ? (promotion ?? QUEEN) : null)) ?? null;
}

export function parseMoveRequest(request) {
  if (typeof request === 'string') {
    const m = request.trim().toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])=?([qrbn])?$/);
    if (!m) return { from: -1, to: -1, promotion: null };
    return { from: toIndex(m[1]), to: toIndex(m[2]), promotion: m[3] ?? null };
  }
  if (request && typeof request === 'object') {
    const names = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
    const raw = request.promotion ? String(request.promotion).toLowerCase() : null;
    const promo = raw ? (names[raw] ?? raw[0]) : null;
    return {
      from: toIndex(String(request.from ?? '').toLowerCase()),
      to: toIndex(String(request.to ?? '').toLowerCase()),
      promotion: promo,
    };
  }
  return { from: -1, to: -1, promotion: null };
}

/** Standard Algebraic Notation for a legal move, e.g. "Nbd7", "exd5", "e8=Q+", "O-O#". */
export function toSan(pos, move, all = legalMoves(pos)) {
  let san;
  if (move.flag === 'castle-king') san = 'O-O';
  else if (move.flag === 'castle-queen') san = 'O-O-O';
  else {
    const isCapture = Boolean(move.captured);
    if (move.piece.type === PAWN) {
      san = (isCapture ? toName(move.from)[0] + 'x' : '') + toName(move.to);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      const rivals = all.filter((m) => m.to === move.to && m.from !== move.from
        && m.piece === move.piece);
      let disambig = '';
      if (rivals.length) {
        const name = toName(move.from);
        const sameFile = rivals.some((m) => toName(m.from)[0] === name[0]);
        const sameRank = rivals.some((m) => toName(m.from)[1] === name[1]);
        if (!sameFile) disambig = name[0];
        else if (!sameRank) disambig = name[1];
        else disambig = name;
      }
      san = move.piece.type.toUpperCase() + disambig + (isCapture ? 'x' : '') + toName(move.to);
    }
  }
  const next = applyMove(pos, move);
  if (isInCheck(next)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

/** True when neither side can possibly deliver mate (K v K, K+minor v K, KB v KB same colour). */
export function hasInsufficientMaterial(pos) {
  const others = [];
  pos.board.forEach((p, sq) => {
    if (p && p.type !== KING) others.push({ p, sq });
  });
  if (others.length === 0) return true;
  if (others.length === 1) return [BISHOP, KNIGHT].includes(others[0].p.type);
  if (others.every(({ p }) => p.type === BISHOP)) {
    const shade = (sq) => ((sq >> 3) + (sq & 7)) % 2;
    return others.every(({ sq }) => shade(sq) === shade(others[0].sq));
  }
  return false;
}
