/**
 * Alliance (Tank Turn Tactics) — client
 * Fog of war: only positions + final blows are public. Hearts / AP / range / hits stay private.
 */

const GRID = 15;
const START_HEARTS = 3;
const START_RANGE = 3;
const START_AP = 0;

const state = {
  user: null,          // { username, token }
  view: "auth",
  lobbies: [],
  lobby: null,         // current lobby / game
  selectedAction: null,
  selectedCell: null,
  pollTimer: null,
  lastHash: null,
};

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function showSpinner(on) {
  $("#spinner").classList.toggle("show", !!on);
}

function showView(name) {
  state.view = name;
  ["auth", "lobbies", "game"].forEach((v) => {
    const el = $(`#view-${v}`);
    if (el) el.classList.toggle("active", v === name);
  });
  $("#btn-logout").classList.toggle("d-none", name === "auth");
  $("#nav-user").classList.toggle("d-none", name === "auth");
  if (name !== "game") stopPolling();
}

function authMsg(text, type = "danger") {
  const el = $("#auth-msg");
  el.textContent = text;
  el.className = `alert alert-${type} mt-3`;
  el.classList.remove("d-none");
}

function toast(msg, type = "info") {
  // simple non-blocking feedback
  console.log(`[${type}]`, msg);
}

// ---------- API layer ----------
async function api(action, payload = {}) {
  if (ALLIANCE_DEMO_MODE) return demoApi(action, payload);

  const body = { action, ...payload };
  if (state.user?.token) body.token = state.user.token;

  const res = await fetch(ALLIANCE_REMOTE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoid CORS preflight issues with GAS
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---------- Demo (localStorage) mode ----------
const DEMO_KEY = "alliance_demo_v1";

function loadDemo() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY)) || { users: [], lobbies: {}, games: {} };
  } catch {
    return { users: [], lobbies: {}, games: {} };
  }
}
function saveDemo(db) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(db));
}

function hashPass(pass, salt) {
  // lightweight demo hash (not for production security; real GAS uses proper hashing)
  let h = 0;
  const s = salt + pass;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return "demo_" + (h >>> 0).toString(16);
}

function demoApi(action, payload) {
  const db = loadDemo();
  const uid = () => "id_" + Math.random().toString(36).slice(2, 10);

  if (action === "register") {
    const { username, password } = payload;
    if (!username || username.length < 3) return { ok: false, error: "Username too short" };
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return { ok: false, error: "Username taken" };
    const salt = uid();
    const user = { id: uid(), username, salt, passwordHash: hashPass(password, salt) };
    db.users.push(user);
    saveDemo(db);
    return { ok: true, username: user.username, token: user.id };
  }

  if (action === "login") {
    const u = db.users.find((x) => x.username.toLowerCase() === (payload.username || "").toLowerCase());
    if (!u || u.passwordHash !== hashPass(payload.password, u.salt))
      return { ok: false, error: "Invalid username or password" };
    return { ok: true, username: u.username, token: u.id };
  }

  // Auth required from here
  const me = db.users.find((u) => u.id === payload.token);
  if (!me) return { ok: false, error: "Not logged in" };

  if (action === "listLobbies") {
    const list = Object.values(db.lobbies)
      .filter((l) => l.status === "waiting" || l.status === "playing")
      .map((l) => ({
        id: l.id,
        name: l.name,
        host: l.host,
        players: l.players,
        maxPlayers: l.maxPlayers,
        status: l.status,
        created: l.created,
      }));
    return { ok: true, lobbies: list };
  }

  if (action === "createLobby") {
    const id = uid();
    const lobby = {
      id,
      name: (payload.name || `${me.username}'s lobby`).slice(0, 40),
      host: me.username,
      players: [me.username],
      maxPlayers: Math.min(16, Math.max(2, +payload.maxPlayers || 6)),
      status: "waiting",
      created: Date.now(),
      gameId: null,
    };
    db.lobbies[id] = lobby;
    saveDemo(db);
    return { ok: true, lobby };
  }

  if (action === "joinLobby") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (lobby.status !== "waiting") return { ok: false, error: "Game already started" };
    if (lobby.players.includes(me.username)) return { ok: true, lobby };
    if (lobby.players.length >= lobby.maxPlayers) return { ok: false, error: "Lobby full" };
    lobby.players.push(me.username);
    saveDemo(db);
    return { ok: true, lobby };
  }

  if (action === "leaveLobby") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby) return { ok: true };
    lobby.players = lobby.players.filter((p) => p !== me.username);
    if (lobby.players.length === 0) {
      delete db.lobbies[payload.lobbyId];
      if (lobby.gameId) delete db.games[lobby.gameId];
    } else if (lobby.host === me.username) {
      lobby.host = lobby.players[0];
    }
    saveDemo(db);
    return { ok: true };
  }

  if (action === "startGame") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || lobby.host !== me.username) return { ok: false, error: "Only host can start" };
    if (lobby.players.length < 2) return { ok: false, error: "Need at least 2 players" };
    if (lobby.status === "playing") return { ok: false, error: "Already started" };

    const positions = placePlayers(lobby.players);
    const players = {};
    lobby.players.forEach((name) => {
      const pos = positions[name];
      players[name] = {
        x: pos.x,
        y: pos.y,
        hearts: START_HEARTS,
        ap: START_AP,
        range: START_RANGE,
        alive: true,
      };
    });

    const gameId = uid();
    const game = {
      id: gameId,
      lobbyId: lobby.id,
      players,
      log: [{ t: Date.now(), type: "system", text: "Game started. Fog of war is active." }],
      host: lobby.host,
    };
    db.games[gameId] = game;
    lobby.status = "playing";
    lobby.gameId = gameId;
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "getGame") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No active game" };
    const game = db.games[lobby.gameId];
    if (!game) return { ok: false, error: "Game missing" };
    return { ok: true, game: publicGameView(game, me.username), lobby: { id: lobby.id, name: lobby.name, host: lobby.host, status: lobby.status, players: lobby.players } };
  }

  if (action === "doAction") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = db.games[lobby.gameId];
    const result = applyAction(game, me.username, payload.act, payload.target);
    if (!result.ok) return result;
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "grantAp") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || lobby.host !== me.username) return { ok: false, error: "Host only" };
    const game = db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    Object.values(game.players).forEach((p) => {
      if (p.alive) p.ap += 1;
    });
    game.log.push({ t: Date.now(), type: "system", text: "Host granted 1 AP to all living players." });
    if (game.log.length > 100) game.log = game.log.slice(-80);
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "endGame") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || lobby.host !== me.username) return { ok: false, error: "Host only" };
    lobby.status = "finished";
    saveDemo(db);
    return { ok: true };
  }

  return { ok: false, error: "Unknown action" };
}

function placePlayers(names) {
  const cells = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells.push({ x, y });
  // shuffle
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const out = {};
  names.forEach((n, i) => {
    out[n] = cells[i];
  });
  return out;
}

function publicGameView(game, viewer) {
  const positions = {};
  const alive = {};
  Object.entries(game.players).forEach(([name, p]) => {
    positions[name] = { x: p.x, y: p.y };
    alive[name] = p.alive;
  });
  const me = game.players[viewer];
  return {
    id: game.id,
    positions,
    alive,
    log: game.log || [],
    host: game.host,
    you: me
      ? { hearts: me.hearts, ap: me.ap, range: me.range, alive: me.alive, x: me.x, y: me.y }
      : null,
    playerNames: Object.keys(game.players),
  };
}

function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

function applyAction(game, actorName, act, target) {
  const actor = game.players[actorName];
  if (!actor || !actor.alive) return { ok: false, error: "You are eliminated" };

  if (act === "upgrade") {
    if (actor.ap < 2) return { ok: false, error: "Need 2 AP" };
    actor.ap -= 2;
    actor.range += 1;
    // private — no public log
    return { ok: true };
  }

  if (act === "move") {
    if (actor.ap < 1) return { ok: false, error: "Need 1 AP" };
    const { x, y } = target || {};
    if (x == null || y == null || x < 0 || y < 0 || x >= GRID || y >= GRID)
      return { ok: false, error: "Invalid cell" };
    if (chebyshev(actor.x, actor.y, x, y) !== 1) return { ok: false, error: "Must be adjacent" };
    const occupied = Object.values(game.players).some((p) => p.alive && p.x === x && p.y === y);
    if (occupied) return { ok: false, error: "Cell occupied" };
    actor.ap -= 1;
    actor.x = x;
    actor.y = y;
    return { ok: true };
  }

  if (act === "give" || act === "shoot") {
    if (actor.ap < 1) return { ok: false, error: "Need 1 AP" };
    const targetName = target?.name;
    const victim = game.players[targetName];
    if (!victim) return { ok: false, error: "Invalid target" };
    if (targetName === actorName) return { ok: false, error: "Cannot target yourself" };
    const dist = chebyshev(actor.x, actor.y, victim.x, victim.y);
    if (dist > actor.range) return { ok: false, error: "Out of range" };

    if (act === "give") {
      if (!victim.alive) return { ok: false, error: "Target is dead" };
      actor.ap -= 1;
      victim.ap += 1;
      // private transfer — no public log of who gave to whom
      return { ok: true };
    }

    // shoot
    if (!victim.alive) return { ok: false, error: "Already dead" };
    actor.ap -= 1;
    victim.hearts -= 1;
    if (victim.hearts <= 0) {
      victim.hearts = 0;
      victim.alive = false;
      // transfer remaining AP to killer (classic rule variant)
      actor.ap += victim.ap;
      victim.ap = 0;
      game.log.push({
        t: Date.now(),
        type: "kill",
        text: `${actorName} dealt the final blow to ${targetName}.`,
      });
      if (game.log.length > 100) game.log = game.log.slice(-80);
    }
    // hit itself is secret unless it was the final blow
    return { ok: true };
  }

  return { ok: false, error: "Unknown action" };
}

// ---------- Auth ----------
async function doLogin(username, password) {
  showSpinner(true);
  try {
    const data = await api("login", { username, password });
    state.user = { username: data.username, token: data.token };
    localStorage.setItem("alliance_session", JSON.stringify(state.user));
    $("#nav-user").textContent = state.user.username;
    showView("lobbies");
    await refreshLobbies();
  } catch (e) {
    authMsg(e.message || "Login failed");
  } finally {
    showSpinner(false);
  }
}

async function doRegister(username, password) {
  showSpinner(true);
  try {
    const data = await api("register", { username, password });
    state.user = { username: data.username, token: data.token };
    localStorage.setItem("alliance_session", JSON.stringify(state.user));
    $("#nav-user").textContent = state.user.username;
    showView("lobbies");
    await refreshLobbies();
  } catch (e) {
    authMsg(e.message || "Registration failed");
  } finally {
    showSpinner(false);
  }
}

function logout() {
  state.user = null;
  localStorage.removeItem("alliance_session");
  stopPolling();
  showView("auth");
}

// ---------- Lobbies ----------
async function refreshLobbies() {
  try {
    const data = await api("listLobbies");
    state.lobbies = data.lobbies || [];
    renderLobbies();
  } catch (e) {
    $("#lobby-list").innerHTML = `<div class="text-danger text-center py-3">${e.message}</div>`;
  }
}

function renderLobbies() {
  const el = $("#lobby-list");
  if (!state.lobbies.length) {
    el.innerHTML = `<div class="text-muted text-center py-4">No open lobbies. Create one!</div>`;
    return;
  }
  el.innerHTML = state.lobbies
    .map((l) => {
      const full = l.players.length >= l.maxPlayers;
      const playing = l.status === "playing";
      return `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <strong>${escapeHtml(l.name)}</strong>
          <div class="small text-muted">Host: ${escapeHtml(l.host)} · ${l.players.length}/${l.maxPlayers}
            ${playing ? '<span class="badge bg-warning text-dark ms-1">In game</span>' : ""}
          </div>
        </div>
        <button class="btn btn-sm ${playing ? "btn-outline-warning" : "btn-primary"}"
          data-join="${l.id}" ${full && !playing ? "disabled" : ""}>
          ${playing ? "Spectate / Rejoin" : full ? "Full" : "Join"}
        </button>
      </div>`;
    })
    .join("");
  el.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", () => joinLobby(btn.dataset.join));
  });
}

async function createLobby() {
  const name = $("#lobby-name").value.trim() || `${state.user.username}'s lobby`;
  const maxPlayers = +$("#lobby-max").value || 6;
  showSpinner(true);
  try {
    const data = await api("createLobby", { name, maxPlayers });
    bootstrap.Modal.getInstance($("#modal-create-lobby"))?.hide();
    await enterLobby(data.lobby);
  } catch (e) {
    alert(e.message);
  } finally {
    showSpinner(false);
  }
}

async function joinLobby(id) {
  showSpinner(true);
  try {
    const data = await api("joinLobby", { lobbyId: id });
    await enterLobby(data.lobby);
  } catch (e) {
    alert(e.message);
  } finally {
    showSpinner(false);
  }
}

async function enterLobby(lobby) {
  state.lobby = lobby;
  showView("game");
  $("#game-title").textContent = lobby.name;
  const isHost = lobby.host === state.user.username;
  $("#host-panel").classList.toggle("d-none", !isHost || lobby.status === "playing");
  $("#btn-end-game").classList.toggle("d-none", !isHost);
  $("#btn-start-game").classList.toggle("d-none", lobby.status === "playing");
  await refreshGame();
  startPolling();
}

async function leaveGame() {
  if (state.lobby) {
    try {
      await api("leaveLobby", { lobbyId: state.lobby.id });
    } catch (_) {}
  }
  state.lobby = null;
  stopPolling();
  showView("lobbies");
  refreshLobbies();
}

// ---------- Game UI ----------
function renderBoard(game) {
  const board = $("#board");
  board.innerHTML = "";
  const posMap = {}; // "x,y" -> {name, alive}
  Object.entries(game.positions || {}).forEach(([name, p]) => {
    posMap[`${p.x},${p.y}`] = { name, alive: game.alive?.[name] !== false };
  });

  const me = game.you;
  const selected = state.selectedCell;
  const action = state.selectedAction;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      const key = `${x},${y}`;
      const occ = posMap[key];

      if (occ) {
        const isMe = me && occ.name === state.user.username;
        cell.textContent = occ.name.slice(0, 2).toUpperCase();
        cell.title = occ.name + (occ.alive ? "" : " (eliminated)");
        if (!occ.alive) cell.classList.add("dead");
        else if (isMe) cell.classList.add("own");
        else cell.classList.add("enemy");
      } else {
        cell.classList.add("empty");
      }

      // highlights for current action
      if (me && me.alive && action) {
        if (action === "move" && !occ) {
          if (chebyshev(me.x, me.y, x, y) === 1) cell.classList.add("adjacent");
        }
        if ((action === "shoot" || action === "give") && occ && occ.alive && occ.name !== state.user.username) {
          if (chebyshev(me.x, me.y, x, y) <= me.range) cell.classList.add("in-range");
        }
      }

      if (selected && selected.x === x && selected.y === y) cell.classList.add("selected");

      cell.addEventListener("click", () => onCellClick(x, y, occ));
      board.appendChild(cell);
    }
  }
}

function renderPlayers(game) {
  const list = $("#player-list");
  const names = game.playerNames || Object.keys(game.positions || {});
  $("#player-count").textContent = names.length;
  list.innerHTML = names
    .map((n) => {
      const alive = game.alive?.[n] !== false;
      const isMe = n === state.user.username;
      const isHost = n === game.host;
      return `<li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span>${escapeHtml(n)}${isMe ? " <em>(you)</em>" : ""}${isHost ? ' <span class="badge bg-secondary">host</span>' : ""}</span>
        <span class="badge ${alive ? "bg-success" : "bg-secondary"}">${alive ? "Alive" : "Out"}</span>
      </li>`;
    })
    .join("");
}

function renderLog(game) {
  const box = $("#public-log");
  const entries = (game.log || []).slice().reverse();
  box.innerHTML = entries.length
    ? entries
        .map(
          (e) =>
            `<div class="log-entry ${e.type || ""}">${escapeHtml(e.text)} <span class="text-muted small">${formatTime(e.t)}</span></div>`
        )
        .join("")
    : `<div class="text-muted">No public events yet.</div>`;
}

function renderOwnStats(game) {
  const you = game.you;
  if (!you) {
    $("#stat-hearts").textContent = "–";
    $("#stat-ap").textContent = "–";
    $("#stat-range").textContent = "–";
    return;
  }
  $("#stat-hearts").textContent = you.alive ? you.hearts : 0;
  $("#stat-ap").textContent = you.ap;
  $("#stat-range").textContent = you.range;
  updateActionButtons(you);
}

function updateActionButtons(you) {
  const alive = you && you.alive;
  $$("#action-bar [data-action]").forEach((btn) => {
    const act = btn.dataset.action;
    let can = alive;
    if (act === "upgrade") can = can && you.ap >= 2;
    else can = can && you.ap >= 1;
    btn.disabled = !can;
    btn.classList.toggle("active", state.selectedAction === act);
  });
}

function onCellClick(x, y, occ) {
  const game = state.lobby?._game;
  if (!game || !game.you?.alive) return;
  const act = state.selectedAction;
  if (!act) {
    state.selectedCell = { x, y };
    renderBoard(game);
    return;
  }

  if (act === "move") {
    doAction({ act: "move", target: { x, y } });
    return;
  }
  if (act === "shoot" || act === "give") {
    if (!occ || !occ.alive) {
      $("#action-hint").textContent = "Click a living player within your range.";
      return;
    }
    doAction({ act, target: { name: occ.name } });
  }
}

async function doAction(payload) {
  if (!state.lobby) return;
  showSpinner(true);
  try {
    const data = await api("doAction", { lobbyId: state.lobby.id, ...payload });
    state.selectedAction = null;
    state.selectedCell = null;
    $("#action-hint").textContent = "Select an action, then click a valid cell / player.";
    applyGameData(data.game);
  } catch (e) {
    alert(e.message);
  } finally {
    showSpinner(false);
  }
}

async function refreshGame() {
  if (!state.lobby) return;
  try {
    const data = await api("getGame", { lobbyId: state.lobby.id });
    if (data.lobby) {
      state.lobby = { ...state.lobby, ...data.lobby };
      const isHost = state.lobby.host === state.user.username;
      $("#host-panel").classList.toggle("d-none", !isHost);
      $("#btn-start-game").classList.toggle("d-none", state.lobby.status === "playing");
    }
    if (data.game) applyGameData(data.game);
  } catch (e) {
    // still in lobby waiting for start
    if (state.lobby.status === "waiting") {
      renderWaitingLobby();
    } else {
      console.warn(e);
    }
  }
}

function applyGameData(game) {
  state.lobby._game = game;
  renderBoard(game);
  renderPlayers(game);
  renderLog(game);
  renderOwnStats(game);
}

function renderWaitingLobby() {
  const lobby = state.lobby;
  $("#board").innerHTML = "";
  $("#player-list").innerHTML = (lobby.players || [])
    .map(
      (n) =>
        `<li class="list-group-item py-2">${escapeHtml(n)}${n === state.user.username ? " (you)" : ""}${n === lobby.host ? ' <span class="badge bg-secondary">host</span>' : ""}</li>`
    )
    .join("");
  $("#player-count").textContent = (lobby.players || []).length;
  $("#public-log").innerHTML = `<div class="text-muted">Waiting for host to start the game…</div>`;
  $("#stat-hearts").textContent = "–";
  $("#stat-ap").textContent = "–";
  $("#stat-range").textContent = "–";
  $$("#action-bar [data-action]").forEach((b) => (b.disabled = true));
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (state.view === "game" && state.lobby) refreshGame();
  }, 2500);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatTime(t) {
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------- Events ----------
function bindEvents() {
  $("#form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin($("#login-user").value.trim(), $("#login-pass").value);
  });
  $("#form-register").addEventListener("submit", (e) => {
    e.preventDefault();
    const p1 = $("#reg-pass").value;
    const p2 = $("#reg-pass2").value;
    if (p1 !== p2) return authMsg("Passwords do not match");
    doRegister($("#reg-user").value.trim(), p1);
  });
  $("#btn-logout").addEventListener("click", logout);
  $("#btn-refresh-lobbies").addEventListener("click", refreshLobbies);
  $("#btn-confirm-create").addEventListener("click", createLobby);
  $("#btn-leave-game").addEventListener("click", leaveGame);
  $("#btn-start-game").addEventListener("click", async () => {
    showSpinner(true);
    try {
      const data = await api("startGame", { lobbyId: state.lobby.id });
      applyGameData(data.game);
      state.lobby.status = "playing";
      $("#btn-start-game").classList.add("d-none");
      $("#host-panel").classList.remove("d-none");
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
  });
  $("#btn-grant-ap").addEventListener("click", async () => {
    showSpinner(true);
    try {
      const data = await api("grantAp", { lobbyId: state.lobby.id });
      applyGameData(data.game);
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
  });
  $("#btn-end-game").addEventListener("click", async () => {
    if (!confirm("End this game for everyone?")) return;
    await api("endGame", { lobbyId: state.lobby.id });
    leaveGame();
  });

  $$("#action-bar [data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.action;
      if (act === "upgrade") {
        doAction({ act: "upgrade" });
        return;
      }
      state.selectedAction = state.selectedAction === act ? null : act;
      state.selectedCell = null;
      const hints = {
        move: "Click an adjacent empty cell to move (1 AP).",
        give: "Click a living player within your range to give them 1 AP (costs you 1 AP).",
        shoot: "Click a living player within your range to shoot (1 AP, 1 heart damage).",
      };
      $("#action-hint").textContent = state.selectedAction
        ? hints[state.selectedAction]
        : "Select an action, then click a valid cell / player.";
      if (state.lobby?._game) {
        updateActionButtons(state.lobby._game.you);
        renderBoard(state.lobby._game);
      }
    });
  });
}

// ---------- Boot ----------
function boot() {
  bindEvents();
  const saved = localStorage.getItem("alliance_session");
  if (saved) {
    try {
      state.user = JSON.parse(saved);
      $("#nav-user").textContent = state.user.username;
      showView("lobbies");
      refreshLobbies();
      return;
    } catch (_) {}
  }
  showView("auth");
  if (ALLIANCE_DEMO_MODE) {
    console.info("Alliance running in DEMO mode (localStorage). Set ALLIANCE_REMOTE_URL in alliance-config.js for real multiplayer.");
  }
}

boot();
