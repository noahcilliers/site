/**
 * Move engine backed by the Python bot server (bot/chessbot/server.py).
 *
 *   POST {url}/move   {"fen": "<FEN>"}  ->  {"move": "e2e4"}
 *
 * Returns { chooseMove(fen) } so the application layer never sees HTTP.
 */
export function createHttpMoveEngine({ url, timeoutMs = 10_000 }) {
  const endpoint = `${url.replace(/\/+$/, '')}/move`;

  return {
    async chooseMove(fen) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Bot server answered ${res.status}: ${data.detail ?? 'no details'}`);
      if (typeof data.move !== 'string') throw new Error('Bot server response has no "move"');
      return data.move;
    },
  };
}
