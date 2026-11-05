// Squares are indexes 0..63. a1 = 0, h1 = 7, a8 = 56, h8 = 63.

const FILES = 'abcdefgh';

export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 3;

export function toIndex(name) {
  if (typeof name !== 'string' || !/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
}

export function toName(sq) {
  return FILES[fileOf(sq)] + (rankOf(sq) + 1);
}

/** Square reached by moving (df, dr) from sq, or -1 if it falls off the board. */
export function offset(sq, df, dr) {
  const f = fileOf(sq) + df;
  const r = rankOf(sq) + dr;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}
