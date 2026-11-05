import { randomBytes } from 'node:crypto';

export const randomIds = {
  gameId: () => randomBytes(4).toString('hex'),
  seatToken: () => randomBytes(16).toString('hex'),
};
