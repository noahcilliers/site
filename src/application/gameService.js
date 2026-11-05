import { BLACK, Game, WHITE, colorName } from '../domain/index.js';
import { GameNotFoundError, UnauthorizedSeatError } from './errors.js';

/**
 * Use cases for playing chess. Each game has two seats (white, black); each seat
 * gets a secret token when the game is created. Whoever holds a seat's token can
 * move for that colour, whether that's the web UI or an API client.
 *
 * Ports (injected):
 *   repository: { save(record), findById(id), findAll() }
 *   ids:        { gameId(): string, seatToken(): string }
 */
export class GameService {
  #repository;
  #ids;
  #waiters = new Map(); // gameId -> Set<() => void>

  constructor({ repository, ids }) {
    this.#repository = repository;
    this.#ids = ids;
  }

  async createGame() {
    const game = new Game({ id: this.#ids.gameId() });
    const seats = { [WHITE]: this.#ids.seatToken(), [BLACK]: this.#ids.seatToken() };
    await this.#repository.save({ game, seats });
    return {
      game: game.snapshot(),
      seats: { white: seats[WHITE], black: seats[BLACK] },
    };
  }

  async listGames() {
    const records = await this.#repository.findAll();
    return records.map(({ game }) => {
      const s = game.snapshot();
      return { id: s.id, createdAt: s.createdAt, turn: s.turn, status: s.status, moves: s.history.length };
    });
  }

  async getGame(id) {
    return (await this.#load(id)).game.snapshot();
  }

  async makeMove(id, token, move) {
    const record = await this.#load(id);
    const color = this.#seatFor(record, token);
    const played = record.game.play(color, move);
    await this.#repository.save(record);
    this.#notify(id);
    return { move: { ...played, color: colorName(played.color) }, game: record.game.snapshot() };
  }

  async resign(id, token) {
    const record = await this.#load(id);
    record.game.resign(this.#seatFor(record, token));
    await this.#repository.save(record);
    this.#notify(id);
    return record.game.snapshot();
  }

  /** Which colour a token controls in a game, or throws. */
  async whoAmI(id, token) {
    return colorName(this.#seatFor(await this.#load(id), token));
  }

  /**
   * Long-poll helper: resolves with the game as soon as its version is greater
   * than `sinceVersion`, or with the current state after `timeoutMs`.
   */
  async waitForChange(id, sinceVersion, timeoutMs = 25000) {
    const current = (await this.#load(id)).game;
    if (current.version > sinceVersion) return current.snapshot();

    await new Promise((resolve) => {
      const waiters = this.#waiters.get(id) ?? new Set();
      this.#waiters.set(id, waiters);
      const done = () => {
        clearTimeout(timer);
        waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      waiters.add(done);
    });
    return this.getGame(id);
  }

  async #load(id) {
    const record = await this.#repository.findById(id);
    if (!record) throw new GameNotFoundError(`No game with id ${id}`);
    return record;
  }

  #seatFor(record, token) {
    if (token && token === record.seats[WHITE]) return WHITE;
    if (token && token === record.seats[BLACK]) return BLACK;
    throw new UnauthorizedSeatError('A valid seat token is required');
  }

  #notify(id) {
    for (const wake of [...(this.#waiters.get(id) ?? [])]) wake();
  }
}
