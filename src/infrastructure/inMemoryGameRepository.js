/** Keeps games in process memory. Swap for a database-backed adapter with the same methods. */
export class InMemoryGameRepository {
  #records = new Map();

  async save(record) {
    this.#records.set(record.game.id, record);
  }

  async findById(id) {
    return this.#records.get(id) ?? null;
  }

  async findAll() {
    return [...this.#records.values()].sort((a, b) => b.game.createdAt - a.game.createdAt);
  }
}
