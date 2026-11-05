import { GameOverError, IllegalMoveError, InvalidMoveFormatError, NotYourTurnError } from './errors.js';
import { BLACK, WHITE, opposite } from './piece.js';
import { Position } from './position.js';
import {
  applyMove, findLegalMove, hasInsufficientMaterial, isInCheck, legalMoves,
  parseMoveRequest, toSan, toUci,
} from './rules.js';
import { toName } from './square.js';

export const STATUS = Object.freeze({
  ACTIVE: 'active',
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
  DRAW_FIFTY_MOVE: 'draw-fifty-move',
  DRAW_REPETITION: 'draw-threefold-repetition',
  DRAW_MATERIAL: 'draw-insufficient-material',
  RESIGNED: 'resigned',
});

/**
 * Game aggregate: owns the current position, the move history and the outcome.
 * All rule enforcement happens here or in rules.js.
 */
export class Game {
  constructor({ id, position = Position.initial(), createdAt = new Date() }) {
    this.id = id;
    this.createdAt = createdAt;
    this.position = position;
    this.history = [];
    this.repetitions = new Map([[position.repetitionKey(), 1]]);
    this.status = STATUS.ACTIVE;
    this.winner = null;
    this.version = 0;
    this.#evaluate();
  }

  get turn() {
    return this.position.turn;
  }

  get isOver() {
    return this.status !== STATUS.ACTIVE;
  }

  legalMoves() {
    if (this.isOver) return [];
    return legalMoves(this.position);
  }

  /**
   * Plays a move for `color`. `request` is "e2e4" or { from, to, promotion }.
   * Returns the recorded move.
   */
  play(color, request) {
    if (this.isOver) throw new GameOverError(`Game is over (${this.status})`);
    if (color !== this.turn) throw new NotYourTurnError(`It is ${colorName(this.turn)}'s turn`);

    const parsed = parseMoveRequest(request);
    if (parsed.from < 0 || parsed.to < 0) {
      throw new InvalidMoveFormatError('Move must look like "e2e4", "e7e8q" or { from, to, promotion }');
    }
    const move = findLegalMove(this.position, request);
    if (!move) throw new IllegalMoveError(`Illegal move: ${describe(request)}`);

    const record = {
      ply: this.history.length + 1,
      color,
      uci: toUci(move),
      san: toSan(this.position, move),
      from: toName(move.from),
      to: toName(move.to),
      piece: move.piece.type,
      captured: move.captured?.type ?? null,
      promotion: move.promotion,
      flag: move.flag,
      fenAfter: null,
    };

    this.position = applyMove(this.position, move);
    record.fenAfter = this.position.toFEN();
    this.history.push(record);

    const key = this.position.repetitionKey();
    this.repetitions.set(key, (this.repetitions.get(key) ?? 0) + 1);

    this.version++;
    this.#evaluate();
    return record;
  }

  resign(color) {
    if (this.isOver) throw new GameOverError(`Game is over (${this.status})`);
    this.status = STATUS.RESIGNED;
    this.winner = opposite(color);
    this.version++;
  }

  #evaluate() {
    const pos = this.position;
    if (legalMoves(pos).length === 0) {
      if (isInCheck(pos)) {
        this.status = STATUS.CHECKMATE;
        this.winner = opposite(pos.turn);
      } else {
        this.status = STATUS.STALEMATE;
      }
    } else if (pos.halfmove >= 100) {
      this.status = STATUS.DRAW_FIFTY_MOVE;
    } else if ((this.repetitions.get(pos.repetitionKey()) ?? 0) >= 3) {
      this.status = STATUS.DRAW_REPETITION;
    } else if (hasInsufficientMaterial(pos)) {
      this.status = STATUS.DRAW_MATERIAL;
    }
  }

  /** Plain-data view for any presenter (HTTP, CLI, ...). */
  snapshot() {
    const pos = this.position;
    const board = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row = [];
      for (let file = 0; file < 8; file++) {
        const p = pos.pieceAt(rank * 8 + file);
        row.push(p ? p.color + p.type.toUpperCase() : null);
      }
      board.push(row);
    }
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      version: this.version,
      fen: pos.toFEN(),
      turn: colorName(pos.turn),
      status: this.status,
      winner: this.winner ? colorName(this.winner) : null,
      inCheck: isInCheck(pos),
      board, // board[0] is rank 8, board[0][0] is a8. Cells: "wK", "bP", ... or null.
      legalMoves: this.legalMoves().map(toUci),
      history: this.history.map(({ fenAfter, ...rest }) => ({ ...rest, color: colorName(rest.color), fen: fenAfter })),
    };
  }
}

export const colorName = (c) => (c === WHITE ? 'white' : 'black');

export function parseColor(name) {
  const v = String(name ?? '').toLowerCase();
  if (v === 'white' || v === 'w') return WHITE;
  if (v === 'black' || v === 'b') return BLACK;
  return null;
}

function describe(request) {
  return typeof request === 'string' ? request : JSON.stringify(request);
}
