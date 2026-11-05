import { InvalidFenError } from './errors.js';
import { BLACK, KING, WHITE, fromFenChar, toFenChar } from './piece.js';
import { toIndex, toName } from './square.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * An immutable snapshot of the board and the state needed to continue play.
 * castling: { K, Q, k, q } booleans (FEN letters).
 * enPassant: target square index or null.
 */
export class Position {
  constructor({ board, turn, castling, enPassant, halfmove, fullmove }) {
    this.board = Object.freeze([...board]);
    this.turn = turn;
    this.castling = Object.freeze({ ...castling });
    this.enPassant = enPassant;
    this.halfmove = halfmove;
    this.fullmove = fullmove;
    Object.freeze(this);
  }

  static initial() {
    return Position.fromFEN(START_FEN);
  }

  static fromFEN(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new InvalidFenError('FEN needs at least 4 fields');
    const [placement, turn, castling, ep, half = '0', full = '1'] = parts;

    const rows = placement.split('/');
    if (rows.length !== 8) throw new InvalidFenError('FEN board needs 8 ranks');
    const board = new Array(64).fill(null);
    rows.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
        } else {
          const p = fromFenChar(ch);
          if (!p || file > 7) throw new InvalidFenError(`Bad FEN rank: ${row}`);
          board[rank * 8 + file] = p;
          file += 1;
        }
      }
      if (file !== 8) throw new InvalidFenError(`Bad FEN rank: ${row}`);
    });

    if (turn !== WHITE && turn !== BLACK) throw new InvalidFenError('Bad side to move');
    if (!/^(-|[KQkq]{1,4})$/.test(castling)) throw new InvalidFenError('Bad castling field');
    const enPassant = ep === '-' ? null : toIndex(ep);
    if (enPassant === -1) throw new InvalidFenError('Bad en passant square');

    return new Position({
      board,
      turn,
      castling: {
        K: castling.includes('K'),
        Q: castling.includes('Q'),
        k: castling.includes('k'),
        q: castling.includes('q'),
      },
      enPassant,
      halfmove: Number(half) || 0,
      fullmove: Number(full) || 1,
    });
  }

  toFEN() {
    return `${this.placementFEN()} ${this.turn} ${this.castlingFEN()} ${
      this.enPassant === null ? '-' : toName(this.enPassant)
    } ${this.halfmove} ${this.fullmove}`;
  }

  /** The parts of the FEN that define "the same position" for repetition. */
  repetitionKey() {
    return `${this.placementFEN()} ${this.turn} ${this.castlingFEN()} ${this.enPassant ?? '-'}`;
  }

  placementFEN() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 8 + file];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        row += toFenChar(p);
      }
      rows.push(row + (empty || ''));
    }
    return rows.join('/');
  }

  castlingFEN() {
    const s = ['K', 'Q', 'k', 'q'].filter((k) => this.castling[k]).join('');
    return s || '-';
  }

  pieceAt(sq) {
    return this.board[sq];
  }

  kingSquare(color) {
    return this.board.findIndex((p) => p && p.color === color && p.type === KING);
  }
}
