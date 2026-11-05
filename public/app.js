// Web client: the human seat. It talks to the same HTTP API the opponent uses.

const $ = (id) => document.getElementById(id);
const FILES = 'abcdefgh';
const GLYPHS = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const STORAGE_KEY = 'chess.session';
const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const INITIAL_BOARD = [
  BACK_RANK.map((t) => `b${t}`), Array(8).fill('bP'),
  ...Array.from({ length: 4 }, () => Array(8).fill(null)),
  Array(8).fill('wP'), BACK_RANK.map((t) => `w${t}`),
];

const state = {
  gameId: null,
  token: null,        // my seat token
  myColor: 'white',
  oppToken: null,
  game: null,         // latest snapshot from the server
  selected: null,     // square name, e.g. "e2"
  pieceImages: {},    // "wK" -> url, for the chosen set
  pieceSets: new Map(), // folder -> { wK: url, ... }
  pollId: 0,
  starting: false,  // a game is being created
};

// ---------- API ----------

const api = {
  async request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  },
  createGame: () => api.request('POST', '/api/games'),
  getGame: (id, since) => api.request('GET', `/api/games/${id}${since === undefined ? '' : `?since=${since}`}`),
  move: (id, move) => api.request('POST', `/api/games/${id}/moves`, { move }),
  resign: (id) => api.request('POST', `/api/games/${id}/resign`),
  pieces: () => api.request('GET', '/api/pieces'),
};

// ---------- Piece images ----------

/** Matches files like wK.svg, b_q.png, white-king.svg, Chess_klt45.svg. Returns "wK" etc. */
function classifyPieceFile(url) {
  const name = decodeURIComponent(url.split('/').pop()).replace(/\.[^.]+$/, '').toLowerCase();
  const words = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' };

  let color = /white|light/.test(name) ? 'w' : /black|dark/.test(name) ? 'b' : null;
  let type = Object.entries(words).find(([w]) => name.includes(w))?.[1] ?? null;

  const colorFirst = name.match(/^([wb])[-_ ]?([kqrbnp])$/);   // wk, b_q
  const typeFirst = name.match(/^([kqrbnp])[-_ ]?([wb])$/);    // kw, q-b
  const wikimedia = name.match(/^chess_([kqrbnp])([ld])t/);    // chess_klt45
  if (colorFirst) { color ??= colorFirst[1]; type ??= colorFirst[2].toUpperCase(); }
  else if (typeFirst) { color ??= typeFirst[2]; type ??= typeFirst[1].toUpperCase(); }
  else if (wikimedia) { color ??= wikimedia[2] === 'l' ? 'w' : 'b'; type ??= wikimedia[1].toUpperCase(); }

  return color && type ? color + type : null;
}

const SET_KEY = 'chess.pieceSet';
const GLYPH_SET = 'glyphs';

/** Groups piece images by folder. Each folder with all 12 pieces is a selectable set. */
async function loadPieceImages() {
  const sets = new Map(); // folder -> { wK: url, ... }
  try {
    for (const url of await api.pieces()) {
      const key = classifyPieceFile(url);
      if (!key) continue;
      const folder = decodeURIComponent(url.slice('/pieces/'.length, url.lastIndexOf('/') + 1)).replace(/\/$/, '');
      if (!sets.has(folder)) sets.set(folder, {});
      sets.get(folder)[key] ??= url;
    }
  } catch { /* fall back to glyphs */ }

  const complete = [...sets].filter(([, imgs]) => Object.keys(imgs).length === 12)
    .sort(([a], [b]) => a.localeCompare(b));
  state.pieceSets = new Map(complete);

  const select = $('piece-set');
  select.replaceChildren(
    ...complete.map(([folder]) => new Option(folder ? folder.split('/').pop() : 'pieces', folder)),
    new Option('Unicode glyphs', GLYPH_SET),
  );
  let saved = null;
  try { saved = localStorage.getItem(SET_KEY); } catch { /* ignore */ }
  const preferred = complete.find(([f]) => f.startsWith('sets/'))?.[0];
  usePieceSet(state.pieceSets.has(saved) || saved === GLYPH_SET ? saved : preferred ?? complete[0]?.[0] ?? GLYPH_SET);
}

function usePieceSet(folder) {
  state.pieceImages = state.pieceSets.get(folder) ?? {};
  $('piece-set').value = folder;
  try { localStorage.setItem(SET_KEY, folder); } catch { /* ignore */ }
}

function pieceElement(code) {
  const el = document.createElement('div');
  el.className = 'piece';
  const url = state.pieceImages[code];
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = code;
    img.draggable = false;
    el.append(img);
  } else {
    const span = document.createElement('span');
    span.className = `glyph ${code[0]}`;
    span.textContent = GLYPHS[code[1]];
    el.append(span);
  }
  return el;
}

// ---------- Board helpers ----------

const pieceAt = (sq) => {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  return (state.game?.board ?? INITIAL_BOARD)[8 - rank][file];
};
const myLetter = () => state.myColor[0];
const isMyTurn = () => state.game?.status === 'active' && state.game.turn === state.myColor;
const movesFrom = (sq) => (state.game?.legalMoves ?? []).filter((m) => m.startsWith(sq));
const targetsFrom = (sq) => [...new Set(movesFrom(sq).map((m) => m.slice(2, 4)))];

// ---------- Rendering ----------

function render() {
  renderBoard();
  renderStatus();
  renderMoves();
}

function renderBoard() {
  const board = $('board');
  board.replaceChildren();
  const g = state.game;
  const flipped = state.myColor === 'black';
  const last = g?.history.at(-1);
  const targets = state.selected ? targetsFrom(state.selected) : [];
  const checkedKing = g?.inCheck ? (g.turn === 'white' ? 'wK' : 'bK') : null;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = flipped ? 7 - col : col;
      const rank = flipped ? row + 1 : 8 - row;
      const sq = FILES[file] + rank;
      const code = (g?.board ?? INITIAL_BOARD)[8 - rank][file];

      const cell = document.createElement('div');
      cell.className = `sq ${(file + rank) % 2 === 0 ? 'light' : 'dark'}`;
      cell.dataset.sq = sq;
      if (last && (last.from === sq || last.to === sq)) cell.classList.add('last');
      if (state.selected === sq) cell.classList.add('selected');
      if (targets.includes(sq)) cell.classList.add('target', ...(code ? ['capture'] : []));
      if (code && code === checkedKing) cell.classList.add('check');

      if (row === 7) cell.append(coord('file', FILES[file]));
      if (col === 0) cell.append(coord('rank', rank));

      if (code) {
        const p = pieceElement(code);
        if (code[0] === myLetter() && isMyTurn()) p.classList.add('mine');
        cell.append(p);
      }
      board.append(cell);
    }
  }
}

function coord(kind, text) {
  const s = document.createElement('span');
  s.className = `coord ${kind}`;
  s.textContent = text;
  return s;
}

function renderStatus() {
  const g = state.game;
  const el = $('status');
  const sub = $('substatus');
  el.classList.remove('alert');
  el.dataset.turn = g?.status === 'active' ? g.turn : '';
  const opp = state.myColor === 'white' ? 'black' : 'white';

  if (!g) {
    el.textContent = 'Move any white piece to start a game.';
    sub.textContent = 'Your opponent plays black through the API.';
    return;
  }
  const endings = {
    checkmate: `Checkmate. ${cap(g.winner)} wins.`,
    stalemate: 'Stalemate. The game is drawn.',
    resigned: `${cap(g.winner === 'white' ? 'black' : 'white')} resigned. ${cap(g.winner)} wins.`,
    'draw-fifty-move': 'Drawn by the fifty-move rule.',
    'draw-threefold-repetition': 'Drawn by threefold repetition.',
    'draw-insufficient-material': 'Drawn: not enough material to mate.',
  };
  if (g.status !== 'active') {
    el.textContent = endings[g.status] ?? g.status;
    el.classList.add('alert');
    sub.textContent = 'Start a new game to play again.';
    return;
  }
  if (isMyTurn()) {
    el.textContent = g.inCheck ? 'Check. Your move.' : 'Your move.';
    if (g.inCheck) el.classList.add('alert');
    sub.textContent = `You're playing ${state.myColor}.`;
  } else {
    el.textContent = g.inCheck ? `Check. Waiting for ${opp}.` : `Waiting for ${opp}.`;
    sub.textContent = `The ${opp} seat moves through the API. Open the panel below to play it yourself.`;
  }
}

function renderMoves() {
  const list = $('moves');
  list.replaceChildren();
  const history = state.game?.history ?? [];
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = `${i / 2 + 1}.`;
    li.append(n);
    for (const mv of [history[i], history[i + 1]]) {
      const s = document.createElement('span');
      s.className = 'm';
      if (mv) {
        s.textContent = mv.san;
        if (mv === history.at(-1)) s.classList.add('latest');
      }
      li.append(s);
    }
    list.append(li);
  }
  list.scrollTop = list.scrollHeight;
}

function renderConnection() {
  const opp = state.myColor === 'white' ? 'black' : 'white';
  const origin = location.origin;
  $('opp-color').textContent = opp;
  $('game-id').textContent = state.gameId;
  $('opp-token').textContent = state.oppToken ?? '(not available in this tab)';
  const token = state.oppToken ?? '<SEAT_TOKEN>';
  const example = state.myColor === 'white' ? 'e7e5' : 'e2e4';
  $('curl').textContent =
    `curl -X POST ${origin}/api/games/${state.gameId}/moves \\\n` +
    `  -H "Authorization: Bearer ${token}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"move":"${example}"}'`;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// ---------- Moving ----------

async function tryMove(from, to) {
  const candidates = movesFrom(from).filter((m) => m.slice(2, 4) === to);
  if (!candidates.length) return false;
  let uci = candidates[0];
  if (candidates.length > 1) {
    const promo = await choosePromotion();
    if (!promo) return false;
    uci = from + to + promo;
  }
  state.selected = null;
  try {
    const res = await api.move(state.gameId, uci);
    state.game = res.game;
  } catch (err) {
    flash(err.message);
  }
  render();
  return true;
}

function choosePromotion() {
  const dialog = $('promo');
  const box = $('promo-choices');
  box.replaceChildren();
  return new Promise((resolve) => {
    for (const t of ['Q', 'R', 'B', 'N']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' }[t];
      b.append(pieceElement(myLetter() + t));
      b.onclick = () => { dialog.close(); resolve(t.toLowerCase()); };
      box.append(b);
    }
    dialog.onclose = () => resolve(null);
    dialog.showModal();
  });
}

function flash(message) {
  const el = $('status');
  el.textContent = message;
  el.classList.add('alert');
  setTimeout(renderStatus, 2200);
}

// Pointer handling: click-to-move and drag-to-move share one code path.
function setupBoardInput() {
  const board = $('board');
  let drag = null;

  const squareAt = (x, y) => document.elementFromPoint(x, y)?.closest('.sq')?.dataset.sq ?? null;

  board.addEventListener('pointerdown', async (e) => {
    const sq = e.target.closest('.sq')?.dataset.sq;
    if (!sq) return;
    if (!state.game && !state.starting && pieceAt(sq)?.[0] === 'w') {
      try { await startGame('white'); } catch (err) { flash(err.message); return; }
    }
    if (!isMyTurn()) return;
    const code = pieceAt(sq);

    if (state.selected && state.selected !== sq && targetsFrom(state.selected).includes(sq)) {
      tryMove(state.selected, sq);
      return;
    }
    if (code && code[0] === myLetter()) {
      state.selected = state.selected === sq ? null : sq;
      render();
      if (state.selected) {
        drag = { from: sq, startX: e.clientX, startY: e.clientY, ghost: null, code };
        try { board.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
      }
    } else {
      state.selected = null;
      render();
    }
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
      const cell = board.querySelector(`[data-sq="${drag.from}"]`);
      const size = cell.getBoundingClientRect().width;
      drag.ghost = pieceElement(drag.code);
      drag.ghost.classList.add('ghost');
      Object.assign(drag.ghost.style, { width: `${size * 0.9}px`, height: `${size * 0.9}px` });
      document.body.append(drag.ghost);
      cell.querySelector('.piece')?.classList.add('dragging');
    }
    if (drag.ghost) {
      drag.ghost.style.left = `${e.clientX}px`;
      drag.ghost.style.top = `${e.clientY}px`;
      board.querySelectorAll('.sq.hover').forEach((n) => n.classList.remove('hover'));
      const over = squareAt(e.clientX, e.clientY);
      if (over && targetsFrom(drag.from).includes(over)) {
        board.querySelector(`[data-sq="${over}"]`)?.classList.add('hover');
      }
    }
  });

  const endDrag = async (e) => {
    if (!drag) return;
    const { from, ghost } = drag;
    drag = null;
    if (!ghost) return; // it was a click; keep the selection
    ghost.remove();
    const over = squareAt(e.clientX, e.clientY);
    if (!(over && over !== from && await tryMove(from, over))) render();
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
}

// ---------- Session + polling ----------

async function startGame(color) {
  state.starting = true;
  state.myColor = color;
  let created;
  try {
    created = await api.createGame();
  } finally {
    state.starting = false;
  }
  state.gameId = created.game.id;
  state.token = created.seats[color];
  state.oppToken = created.seats[color === 'white' ? 'black' : 'white'];
  state.game = created.game;
  state.selected = null;
  saveSession();
  showGameUi();
  poll();
}

function showGameUi() {
  setGameControls(true);
  history.replaceState(null, '', `?game=${state.gameId}`);
  renderConnection();
  render();
}

/** Toggles between the pre-game controls and the in-game ones. */
function setGameControls(inGame) {
  $('play-black').classList.toggle('hidden', inGame);
  for (const id of ['restart', 'resign', 'moves', 'connect']) $(id).classList.toggle('hidden', !inGame);
}

async function poll() {
  const id = ++state.pollId;
  while (id === state.pollId && state.gameId) {
    try {
      const g = await api.getGame(state.gameId, state.game?.version ?? 0);
      if (id !== state.pollId) return;
      if (g.version !== state.game?.version) {
        state.game = g;
        render();
      }
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      gameId: state.gameId, token: state.token, oppToken: state.oppToken, myColor: state.myColor,
    }));
  } catch { /* storage unavailable */ }
}

async function resumeSession() {
  const wanted = new URLSearchParams(location.search).get('game');
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* ignore */ }
  if (!wanted || !saved || saved.gameId !== wanted) return false;
  Object.assign(state, saved);
  try {
    state.game = await api.getGame(state.gameId);
  } catch {
    return false; // server restarted; games are in memory
  }
  showGameUi();
  poll();
  return true;
}

function resetToSetup() {
  state.pollId++;
  Object.assign(state, {
    gameId: null, token: null, oppToken: null, game: null, selected: null, myColor: 'white',
  });
  history.replaceState(null, '', location.pathname);
  setGameControls(false);
  render();
}

// ---------- Wire up ----------

$('play-black').addEventListener('click', async () => {
  try { await startGame('black'); } catch (err) { flash(err.message); }
});
$('restart').addEventListener('click', resetToSetup);
$('resign').addEventListener('click', async () => {
  if (state.game?.status !== 'active' || !confirm('Resign this game?')) return;
  try { state.game = await api.resign(state.gameId); render(); } catch (err) { flash(err.message); }
});
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(btn.dataset.copy).textContent);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    } catch { /* clipboard blocked */ }
  });
});

$('piece-set').addEventListener('change', (e) => { usePieceSet(e.target.value); render(); });
setupBoardInput();
await loadPieceImages();
if (!(await resumeSession())) {
  state.game = null;
  render();
}
