// Composition root: wires the adapters to the application and starts the server.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BotPlayer } from './application/botPlayer.js';
import { GameService } from './application/gameService.js';
import { createHttpMoveEngine } from './infrastructure/httpMoveEngine.js';
import { InMemoryGameRepository } from './infrastructure/inMemoryGameRepository.js';
import { randomIds } from './infrastructure/randomIds.js';
import { createHttpServer } from './interfaces/http/server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);
const botUrl = process.env.BOT_URL ?? 'http://127.0.0.1:8000'; // the Python bot (bot/chessbot/server.py)

const gameService = new GameService({ repository: new InMemoryGameRepository(), ids: randomIds });
const botPlayer = new BotPlayer({ gameService, engine: createHttpMoveEngine({ url: botUrl }) });
const server = createHttpServer({
  gameService,
  botPlayer,
  publicDir: join(root, 'public'),
  piecesDir: join(root, 'pieces'),
});

server.listen(port, () => {
  console.log(`Chess server running at http://localhost:${port}`);
  console.log(`Bot moves come from ${botUrl}/move`);
});
