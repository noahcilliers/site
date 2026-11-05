import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { GameNotFoundError, UnauthorizedSeatError } from '../../application/errors.js';
import {
  DomainError, GameOverError, IllegalMoveError, InvalidMoveFormatError, NotYourTurnError,
} from '../../domain/errors.js';
import { Router } from './router.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const IMAGE_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function statusFor(err) {
  if (err instanceof HttpError) return err.status;
  if (err instanceof GameNotFoundError) return 404;
  if (err instanceof UnauthorizedSeatError) return 403;
  if (err instanceof NotYourTurnError || err instanceof GameOverError) return 409;
  if (err instanceof IllegalMoveError) return 422;
  if (err instanceof InvalidMoveFormatError) return 400;
  if (err instanceof DomainError) return 400;
  return 500;
}

/**
 * HTTP adapter: translates requests into GameService calls and results into JSON.
 * Also serves the web UI (publicDir) and piece images (piecesDir).
 */
export function createHttpServer({ gameService, publicDir, piecesDir }) {
  const api = new Router()
    .get('/api/games', () => gameService.listGames())
    .post('/api/games', async () => ({ status: 201, body: await gameService.createGame() }))
    .get('/api/games/:id', ({ params, query }) => {
      if (query.has('since')) {
        const timeout = Math.min(Number(query.get('timeout') ?? 25), 60) * 1000;
        return gameService.waitForChange(params.id, Number(query.get('since')), timeout);
      }
      return gameService.getGame(params.id);
    })
    .get('/api/games/:id/moves', async ({ params }) => {
      const game = await gameService.getGame(params.id);
      return { turn: game.turn, status: game.status, moves: game.legalMoves };
    })
    .post('/api/games/:id/moves', async ({ params, body, token }) => {
      const move = body.move ?? (body.from ? { from: body.from, to: body.to, promotion: body.promotion } : null);
      if (!move) throw new HttpError(400, 'Body must include "move": "e2e4" or "from"/"to"');
      return gameService.makeMove(params.id, token, move);
    })
    .post('/api/games/:id/resign', ({ params, token }) => gameService.resign(params.id, token))
    .get('/api/games/:id/seat', async ({ params, token }) => ({
      color: await gameService.whoAmI(params.id, token),
    }))
    .get('/api/pieces', async () => listPieceImages(piecesDir));

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const route = api.match(req.method, url.pathname);
        if (!route) throw new HttpError(404, 'Not found');
        if (route.methodNotAllowed) throw new HttpError(405, 'Method not allowed');
        const body = req.method === 'POST' ? await readJson(req) : {};
        const result = await route.handler({
          params: route.params,
          query: url.searchParams,
          body,
          token: readToken(req, body),
        });
        const isWrapped = result && typeof result === 'object' && 'status' in result && 'body' in result;
        return sendJson(res, isWrapped ? result.status : 200, isWrapped ? result.body : result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      if (url.pathname.startsWith('/pieces/')) {
        if (!IMAGE_EXTS.has(extname(url.pathname).toLowerCase())) throw new HttpError(404, 'Not found');
        return await serveFile(res, piecesDir, url.pathname.slice('/pieces/'.length));
      }
      return await serveFile(res, publicDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    } catch (err) {
      const status = statusFor(err);
      if (status === 500) console.error(err);
      return sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    }
  });
}

function readToken(req, body) {
  const auth = req.headers.authorization ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers['x-seat-token'] ?? body.token ?? null;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e5) throw new HttpError(413, 'Body too large');
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data, null, 2));
}

async function serveFile(res, root, relative) {
  const base = resolve(root);
  const target = resolve(base, normalize(decodeURIComponent(relative)));
  if (target !== base && !target.startsWith(base + sep)) throw new HttpError(404, 'Not found');
  try {
    if (!(await stat(target)).isFile()) throw new Error();
  } catch {
    throw new HttpError(404, 'Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' });
  res.end(await readFile(target));
}

/** Lists piece images in the pieces folder and its subfolders. PNGs come first so they win. */
async function listPieceImages(dir) {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const rank = (f) => (extname(f).toLowerCase() === '.png' ? 0 : 1);
  return entries
    .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((f) => `/pieces/${f.split(sep).map(encodeURIComponent).join('/')}`);
}
