// NCS Tournament Control Room

const STORAGE_KEY   = 'ncs_games_v1';
const INTERVAL_KEY  = 'ncs_refresh_interval';

let games           = [];
let currentInterval = 60;      // seconds
let countdownSecs   = 60;
let countdownTimer  = null;
let activeGameId    = null;
let tempAway        = 0;
let tempHome        = 0;

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadGames();
  renderAll();

  const saved = localStorage.getItem(INTERVAL_KEY);
  if (saved) {
    currentInterval = parseInt(saved, 10);
    const sel = document.getElementById('intervalSel');
    if (sel) sel.value = saved;
  }

  startCountdown();
});

// ── Storage ───────────────────────────────────────────────────────────────

function loadGames() {
  try {
    games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { games = []; }
}

function saveGames() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

function uid() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── Render ────────────────────────────────────────────────────────────────

function renderAll() {
  renderGrid();
  renderCounter();
}

function renderGrid() {
  const grid  = document.getElementById('crGrid');
  const empty = document.getElementById('crEmpty');
  if (!grid) return;

  if (games.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = games.map(cardHtml).join('');
}

function cardHtml(g) {
  const st   = g.status || 'upcoming';
  const label = { live: 'LIVE GAME', upcoming: 'UPCOMING', final: 'FINAL' }[st];
  const inn  = inningLabel(g);
  const upd  = timeAgo(g.lastUpdated);
  const sched = fmtTime(g.scheduledTime);
  const gcHref = g.gcUrl || null;
  const awayWin = st === 'final' && g.awayScore > g.homeScore;
  const homeWin = st === 'final' && g.homeScore > g.awayScore;
  const awayCol = awayWin ? 'color:#60d090' : '';
  const homeCol = homeWin ? 'color:#60d090' : '';

  const gcBtn = gcHref
    ? `<a class="cr-card-btn gc-btn" href="${esc(gcHref)}" target="_blank" rel="noopener"><i class="ti ti-live-photo"></i> GAMECHANGER</a>`
    : `<button class="cr-card-btn gc-btn" disabled><i class="ti ti-live-photo"></i> GAMECHANGER</button>`;

  return `
<div class="cr-card status-${st}" id="card-${g.id}">
  <div class="cr-card-header">
    <div class="cr-status-label ${st}">
      <span class="cr-status-dot ${st}"></span>${label}
    </div>
    <div class="cr-card-actions-top">
      <button class="cr-icon-btn" title="Update score" data-action="edit" data-id="${g.id}"><i class="ti ti-pencil"></i></button>
      <button class="cr-icon-btn" title="Delete game"  data-action="del"  data-id="${g.id}"><i class="ti ti-trash"></i></button>
    </div>
  </div>

  <div class="cr-teams">
    <div class="cr-team-row">
      <div class="cr-team-name" style="${awayCol}">${esc(g.awayTeam || 'Away')}</div>
      <div class="cr-team-score" style="${awayCol}">${g.awayScore ?? 0}</div>
    </div>
    <div class="cr-team-row">
      <div class="cr-team-name" style="${homeCol}">${esc(g.homeTeam || 'Home')}</div>
      <div class="cr-team-score" style="${homeCol}">${g.homeScore ?? 0}</div>
    </div>
  </div>

  <div class="cr-score-rule"></div>

  <div class="cr-stats">
    <div class="cr-stat-row">
      <span class="cr-stat-label">INNING</span>
      <span class="cr-stat-value hi">${inn}</span>
    </div>
    <div class="cr-stat-row">
      <span class="cr-stat-label">ROUND</span>
      <span class="cr-stat-value">${esc(g.round || '—')}</span>
    </div>
    <div class="cr-stat-row">
      <span class="cr-stat-label">FIELD</span>
      <span class="cr-stat-value">${esc(g.field || '—')}</span>
    </div>
    <div class="cr-stat-row">
      <span class="cr-stat-label">TIME</span>
      <span class="cr-stat-value">${sched}</span>
    </div>
    <div class="cr-stat-row">
      <span class="cr-stat-label">UPDATED</span>
      <span class="cr-stat-value">${upd}</span>
    </div>
  </div>

  <div class="cr-card-footer">
    ${gcBtn}
    <button class="cr-card-btn" data-action="edit" data-id="${g.id}">
      <i class="ti ti-edit"></i> SCORE
    </button>
  </div>
</div>`;
}

// Delegated event handler on the grid
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  if (action === 'edit') openModal(id);
  if (action === 'del')  removeGame(id);
});

function renderCounter() {
  const live  = games.filter(g => g.status === 'live').length;
  const total = games.length;
  const el = document.getElementById('crCounter');
  if (el) el.textContent = `GAMES ${live}/${total}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function inningLabel(g) {
  if (g.status === 'upcoming') return 'Not started';
  if (g.status === 'final' || g.inning === 'F') return 'Final';
  if (!g.inning) return '—';
  const ordinals = ['','1st','2nd','3rd','4th','5th','6th','7th'];
  const o = ordinals[g.inning] || `${g.inning}th`;
  const halves = { top: 'Top', mid: 'Mid', bottom: 'Bot', end: 'End' };
  const h = halves[g.inningHalf] || '';
  return h ? `${h} ${o}` : o;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

function timeAgo(iso) {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m === 1) return '1 min ago';
    if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)}h ago`;
  } catch { return '—'; }
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Add Game ──────────────────────────────────────────────────────────────

function addGame() {
  const away = val('newAway');
  const home = val('newHome');
  if (!away || !home) { alert('Enter both team names.'); return; }

  games.push({
    id:            uid(),
    status:        'upcoming',
    awayTeam:      away,
    homeTeam:      home,
    awayScore:     0,
    homeScore:     0,
    inning:        null,
    inningHalf:    'top',
    gcUrl:         val('newGcUrl') || null,
    field:         val('newField') || null,
    round:         val('newRound') || 'Pool Play',
    pool:          val('newPool')  || null,
    scheduledTime: val('newTime')  || null,
    lastUpdated:   new Date().toISOString()
  });

  saveGames();
  renderAll();
  ['newAway','newHome','newGcUrl','newField','newPool','newTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function removeGame(id) {
  if (!confirm('Delete this game?')) return;
  games = games.filter(g => g.id !== id);
  saveGames();
  renderAll();
}

function clearAll() {
  if (!confirm('Delete ALL games? This cannot be undone.')) return;
  games = [];
  saveGames();
  renderAll();
}

// ── Score Modal ───────────────────────────────────────────────────────────

function openModal(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;

  activeGameId = id;
  tempAway     = g.awayScore ?? 0;
  tempHome     = g.homeScore ?? 0;

  setText('modalTitle',   `UPDATE — ${g.awayTeam} vs ${g.homeTeam}`);
  setText('modalAwyName', g.awayTeam || 'Away');
  setText('modalHmName',  g.homeTeam || 'Home');
  setText('modalAwyNum',  tempAway);
  setText('modalHmNum',   tempHome);

  setVal('modalInning',   g.inning   || '1');
  setVal('modalHalf',     g.inningHalf || 'top');
  setVal('modalStatus',   g.status   || 'upcoming');

  document.getElementById('crModal').style.display = 'flex';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('crModal')) return;
  document.getElementById('crModal').style.display = 'none';
  activeGameId = null;
}

function adj(side, delta) {
  if (side === 'away') {
    tempAway = Math.max(0, tempAway + delta);
    setText('modalAwyNum', tempAway);
  } else {
    tempHome = Math.max(0, tempHome + delta);
    setText('modalHmNum', tempHome);
  }
}

function saveScore() {
  if (!activeGameId) return;
  const idx = games.findIndex(g => g.id === activeGameId);
  if (idx < 0) return;

  games[idx].awayScore   = tempAway;
  games[idx].homeScore   = tempHome;
  games[idx].inning      = val('modalInning') || null;
  games[idx].inningHalf  = val('modalHalf');
  games[idx].status      = val('modalStatus');
  games[idx].lastUpdated = new Date().toISOString();

  saveGames();
  renderAll();
  document.getElementById('crModal').style.display = 'none';
  activeGameId = null;
}

function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function setVal(id, v)    { const el = document.getElementById(id); if (el) el.value = v; }

// ── Refresh ───────────────────────────────────────────────────────────────

async function refreshAll() {
  const btn = document.getElementById('crRefreshBtn');
  if (btn) btn.classList.add('spinning');

  // Attempt live fetch for games that have a GameChanger URL.
  // GameChanger doesn't expose a public CORS API, so this resolves
  // immediately and falls through to the manual-update UI gracefully.
  await Promise.allSettled(
    games
      .filter(g => g.status === 'live' && g.gcUrl)
      .map(g => tryFetchGC(g))
  );

  saveGames();
  renderAll();

  // Reset countdown
  countdownSecs = currentInterval;
  updateTimerDisplay();

  setTimeout(() => { if (btn) btn.classList.remove('spinning'); }, 700);
}

async function tryFetchGC(game) {
  // GameChanger does not provide a public, CORS-enabled API for client-side
  // consumption. This placeholder is wired up so that if an endpoint becomes
  // available it can be dropped in here without touching the rest of the UI.
  return null;
}

// ── Countdown ─────────────────────────────────────────────────────────────

function startCountdown() {
  stopCountdown();
  if (currentInterval <= 0) { updateTimerDisplay(); return; }
  countdownSecs = currentInterval;
  countdownTimer = setInterval(() => {
    countdownSecs--;
    updateTimerDisplay();
    if (countdownSecs <= 0) {
      refreshAll();
      countdownSecs = currentInterval;
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function updateTimerDisplay() {
  const el = document.getElementById('crTimer');
  if (!el) return;
  el.textContent = currentInterval <= 0 ? 'auto off' : `next ${countdownSecs}s`;
}

function setInterval_(v) {   // called from select onchange
  currentInterval = parseInt(v, 10);
  localStorage.setItem(INTERVAL_KEY, String(currentInterval));
  startCountdown();
}

// ── Settings panel ────────────────────────────────────────────────────────

function toggleSettings() {
  const el = document.getElementById('crSettings');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── Sample Data ───────────────────────────────────────────────────────────

function loadSample() {
  if (games.length > 0 && !confirm('Replace current games with sample NCS data?')) return;

  const offset = m => new Date(Date.now() + m * 60000).toISOString().slice(0, 16);

  games = [
    { id: uid(), status: 'live',     awayTeam: 'Bananas 2K15',        homeTeam: 'Texas Storm 12U',        awayScore: 5, homeScore: 3, inning: 4,    inningHalf: 'bottom', gcUrl: null, field: 'Field 1', round: 'Pool Play',   pool: 'Pool A', scheduledTime: offset(-90),  lastUpdated: new Date().toISOString() },
    { id: uid(), status: 'live',     awayTeam: 'TX Bombers Gold',      homeTeam: 'Austin Reign 12U',       awayScore: 2, homeScore: 2, inning: 3,    inningHalf: 'top',    gcUrl: null, field: 'Field 2', round: 'Pool Play',   pool: 'Pool A', scheduledTime: offset(-60),  lastUpdated: new Date().toISOString() },
    { id: uid(), status: 'live',     awayTeam: 'SA Fury Select',       homeTeam: 'DFW Premier 12U',        awayScore: 1, homeScore: 4, inning: 5,    inningHalf: 'top',    gcUrl: null, field: 'Field 3', round: 'Pool Play',   pool: 'Pool B', scheduledTime: offset(-75),  lastUpdated: new Date().toISOString() },
    { id: uid(), status: 'upcoming', awayTeam: 'Bananas 2K15',        homeTeam: 'HTX Chaos 12U',          awayScore: 0, homeScore: 0, inning: null, inningHalf: 'top',    gcUrl: null, field: 'Field 1', round: 'Pool Play',   pool: 'Pool A', scheduledTime: offset(60),   lastUpdated: new Date().toISOString() },
    { id: uid(), status: 'upcoming', awayTeam: 'Georgetown Gold',     homeTeam: 'Round Rock Revolution',  awayScore: 0, homeScore: 0, inning: null, inningHalf: 'top',    gcUrl: null, field: 'Field 4', round: 'Bracket Play',pool: null,     scheduledTime: offset(120),  lastUpdated: new Date().toISOString() },
    { id: uid(), status: 'final',    awayTeam: 'Waco Warriors 12U',   homeTeam: 'Killeen Crush',          awayScore: 3, homeScore: 6, inning: 'F',  inningHalf: null,     gcUrl: null, field: 'Field 2', round: 'Pool Play',   pool: 'Pool B', scheduledTime: offset(-240), lastUpdated: new Date(Date.now() - 120 * 60000).toISOString() },
    { id: uid(), status: 'final',    awayTeam: 'Cedar Park Heat',     homeTeam: 'Pflugerville Power',     awayScore: 8, homeScore: 4, inning: 'F',  inningHalf: null,     gcUrl: null, field: 'Field 3', round: 'Pool Play',   pool: 'Pool A', scheduledTime: offset(-180), lastUpdated: new Date(Date.now() - 60 * 60000).toISOString() },
    { id: uid(), status: 'upcoming', awayTeam: 'San Marcos Stingers', homeTeam: 'New Braunfels Elite 12U',awayScore: 0, homeScore: 0, inning: null, inningHalf: 'top',    gcUrl: null, field: 'Field 5', round: 'Pool Play',   pool: 'Pool B', scheduledTime: offset(90),   lastUpdated: new Date().toISOString() }
  ];

  saveGames();
  renderAll();
}
