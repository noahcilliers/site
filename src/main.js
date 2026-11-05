// Composition root: wires the adapters to the application and starts the server.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameService } from './application/gameService.js';
import { InMemoryGameRepository } from './infrastructure/inMemoryGameRepository.js';
import { randomIds } from './infrastructure/randomIds.js';
import { createHttpServer } from './interfaces/http/server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);

const gameService = new GameService({ repository: new InMemoryGameRepository(), ids: randomIds });
const server = createHttpServer({
  gameService,
  publicDir: join(root, 'public'),
  piecesDir: join(root, 'pieces'),
});

server.listen(port, () => {
  console.log(`Chess server running at http://localhost:${port}`);
});
