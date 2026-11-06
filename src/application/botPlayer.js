/**
 * Plays one seat of a game automatically. It uses the same GameService calls as any
 * other player: wait for the game to change, and move with its seat token on its turn.
 *
 * Ports (injected):
 *   gameService: GameService
 *   engine:      { chooseMove(fen): Promise<string> }   returns a UCI move, e.g. "e7e5"
 */
export class BotPlayer {
  #gameService;
  #engine;
  #log;
  #retryMs;
  #idleMs;

  constructor({ gameService, engine, log = console, retryMs = 2000, idleMs = 60 * 60 * 1000 }) {
    this.#gameService = gameService;
    this.#engine = engine;
    this.#log = log;
    this.#retryMs = retryMs;   // first wait after the engine fails; doubles up to 30s
    this.#idleMs = idleMs;     // stop playing a game nobody has touched for this long
  }

  /** Starts playing `color` ("white" | "black") in the background. Returns immediately. */
  play(gameId, token, color) {
    this.#run(gameId, token, color).catch((err) => {
      this.#log.error(`Bot stopped in game ${gameId}:`, err);
    });
  }

  async #run(gameId, token, color) {
    let game = await this.#gameService.getGame(gameId);
    let lastChange = Date.now();
    let failures = 0;

    while (game.status === 'active' && Date.now() - lastChange < this.#idleMs) {
      if (game.turn !== color) {
        const next = await this.#gameService.waitForChange(gameId, game.version);
        if (next.version !== game.version) lastChange = Date.now();
        game = next;
        continue;
      }

      try {
        const move = await this.#chooseMove(game);
        game = (await this.#gameService.makeMove(gameId, token, move)).game;
        lastChange = Date.now();
        failures = 0;
      } catch (err) {
        const fresh = await this.#gameService.getGame(gameId);
        if (fresh.version !== game.version) { // the game moved on meanwhile (e.g. the human resigned)
          game = fresh;
          continue;
        }
        failures += 1;
        const wait = Math.min(this.#retryMs * 2 ** (failures - 1), 30_000);
        this.#log.error(`Bot could not move in game ${gameId} (retrying in ${wait / 1000}s): ${err.message}`);
        await new Promise((r) => setTimeout(r, wait));
        game = await this.#gameService.getGame(gameId);
      }
    }
  }

  /** Asks the engine for a move; falls back to a random legal move if it suggests an illegal one. */
  async #chooseMove(game) {
    const move = await this.#engine.chooseMove(game.fen);
    if (game.legalMoves.includes(move)) return move;
    this.#log.warn(`Bot engine suggested illegal move "${move}" in game ${game.id}; playing a random legal move`);
    return game.legalMoves[Math.floor(Math.random() * game.legalMoves.length)];
  }
}
