export const WHITE = 'w';
export const BLACK = 'b';

export const PAWN = 'p';
export const KNIGHT = 'n';
export const BISHOP = 'b';
export const ROOK = 'r';
export const QUEEN = 'q';
export const KING = 'k';

export const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

export const opposite = (color) => (color === WHITE ? BLACK : WHITE);

const cache = new Map();

/** Pieces are small immutable value objects, shared by identity. */
export function piece(color, type) {
  const key = color + type;
  if (!cache.has(key)) cache.set(key, Object.freeze({ color, type }));
  return cache.get(key);
}

/** FEN letter: uppercase for white, lowercase for black. */
export function toFenChar(p) {
  return p.color === WHITE ? p.type.toUpperCase() : p.type;
}

export function fromFenChar(ch) {
  const type = ch.toLowerCase();
  if (!'pnbrqk'.includes(type)) return null;
  return piece(ch === type ? BLACK : WHITE, type);
}
