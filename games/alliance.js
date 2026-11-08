const GRID = 15;
const START_HEARTS = 3;
const START_RANGE = 3;
const START_AP = 1;
const TURN_MS = 5 * 60 * 1000; // 5 minutes
const READY_COUNTDOWN_MS = 10 * 1000;

const state = {
  user: null, // { username, token }
  view: "auth",
  lobbies: [],
  lobby: null,
  selectedAction: null,
  selectedCell: null,
  pollTimer: null,
  uiTimer: null,
  lastHash: null,
  chatMode: "public",
  dmTarget: "",
  keyPair: null,
  publicKeys: {},
};

// ---------- E2E crypto (RSA-OAEP + AES-GCM hybrid) ----------
const KEY_STORAGE = "alliance_e2e_v1";

async function ensureKeyPair() {
  if (state.keyPair) return state.keyPair;
  const raw = localStorage.getItem(KEY_STORAGE);
  if (raw) {
    try {
      const jwk = JSON.parse(raw);
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        jwk.privateKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
      );
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        jwk.publicKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
      );
      state.keyPair = { privateKey, publicKey, publicJwk: jwk.publicKey };
      return state.keyPair;
    } catch (e) {
      console.warn("Failed to load keypair", e);
    }
  }
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  localStorage.setItem(
    KEY_STORAGE,
    JSON.stringify({ publicKey: publicJwk, privateKey: privateJwk })
  );
  state.keyPair = { privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk };
  return state.keyPair;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function importPublicJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

async function encryptDm(plaintext, recipientPublicJwk) {
  if (!state.keyPair) await ensureKeyPair();
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(plaintext)
  );
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const recipientKey = await importPublicJwk(recipientPublicJwk);
  const wrappedTo = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientKey, rawAes);
  // Also wrap for sender so they can re-read their own DMs
  const wrappedFrom = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    state.keyPair.publicKey,
    rawAes
  );
  return {
    ciphertext: bufToB64(ciphertext),
    iv: bufToB64(iv),
    wrappedKey: bufToB64(wrappedTo),
    wrappedKeySender: bufToB64(wrappedFrom),
  };
}

async function decryptDm(msg) {
  if (!state.keyPair) await ensureKeyPair();
  const tryKeys = [];
  if (msg.wrappedKey) tryKeys.push(msg.wrappedKey);
  if (msg.wrappedKeySender) tryKeys.push(msg.wrappedKeySender);
  for (const wk of tryKeys) {
    try {
      const rawAes = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        state.keyPair.privateKey,
        b64ToBuf(wk)
      );
      const aesKey = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, [
        "decrypt",
      ]);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBuf(msg.iv) },
        aesKey,
        b64ToBuf(msg.ciphertext)
      );
      return new TextDecoder().decode(plain);
    } catch (_) {
      /* try next */
    }
  }
  return "[unable to decrypt]";
}

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
    const now = Date.now();
    const game = {
      id: gameId,
      lobbyId: lobby.id,
      players,
      log: [{ t: now, type: "system", text: "Game started. Fog of war is active. Turn 1 begins." }],
      host: lobby.host,
      turn: 1,
      turnStartedAt: now,
      ready: [],
      worldPeace: [],
      countdownEndsAt: null,
      status: "playing",
      winners: null,
      publicChat: [],
      dms: [],
    };
    db.games[gameId] = game;
    lobby.status = "playing";
    lobby.gameId = gameId;
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "getGame") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (!lobby.gameId) {
      return {
        ok: true,
        lobby: { id: lobby.id, name: lobby.name, host: lobby.host, status: lobby.status, players: lobby.players },
        game: null,
      };
    }
    const game = db.games[lobby.gameId];
    if (!game) return { ok: false, error: "Game missing" };
    tickGame(game);
    saveDemo(db);
    return {
      ok: true,
      game: publicGameView(game, me.username),
      lobby: { id: lobby.id, name: lobby.name, host: lobby.host, status: lobby.status, players: lobby.players },
    };
  }

  if (action === "doAction") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = db.games[lobby.gameId];
    tickGame(game);
    if (game.status === "finished") {
      saveDemo(db);
      return { ok: true, game: publicGameView(game, me.username) };
    }
    const result = applyAction(game, me.username, payload.act, payload.target);
    if (!result.ok) return result;
    checkEndConditions(game);
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "setReady") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = db.games[lobby.gameId];
    tickGame(game);
    if (game.status === "finished") return { ok: true, game: publicGameView(game, me.username) };
    const p = game.players[me.username];
    if (!p || !p.alive) return { ok: false, error: "Only living players can ready" };
    const on = !!payload.ready;
    game.ready = game.ready || [];
    if (on && !game.ready.includes(me.username)) game.ready.push(me.username);
    if (!on) game.ready = game.ready.filter((n) => n !== me.username);
    maybeStartReadyCountdown(game);
    tickGame(game);
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "setWorldPeace") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = db.games[lobby.gameId];
    tickGame(game);
    if (game.status === "finished") return { ok: true, game: publicGameView(game, me.username) };
    const p = game.players[me.username];
    if (!p || !p.alive) return { ok: false, error: "Only living players can vote" };
    const on = !!payload.worldPeace;
    game.worldPeace = game.worldPeace || [];
    if (on && !game.worldPeace.includes(me.username)) game.worldPeace.push(me.username);
    if (!on) game.worldPeace = game.worldPeace.filter((n) => n !== me.username);
    checkEndConditions(game);
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "nextTurn") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || lobby.host !== me.username) return { ok: false, error: "Host only" };
    const game = db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    if (game.status === "finished") return { ok: true, game: publicGameView(game, me.username) };
    advanceTurn(game, "Host forced the next turn.");
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  if (action === "endGame") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || lobby.host !== me.username) return { ok: false, error: "Host only" };
    lobby.status = "finished";
    const game = lobby.gameId ? db.games[lobby.gameId] : null;
    if (game && game.status !== "finished") {
      game.status = "finished";
      game.log.push({ t: Date.now(), type: "system", text: "Host ended the game." });
    }
    saveDemo(db);
    return { ok: true };
  }

  if (action === "updatePublicKey") {
    me.publicKey = payload.publicKey || null;
    saveDemo(db);
    return { ok: true };
  }

  if (action === "sendChat") {
    const lobby = db.lobbies[payload.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    const channel = payload.channel === "dm" ? "dm" : "public";
    if (channel === "public") {
      const text = String(payload.text || "").trim().slice(0, 200);
      if (!text) return { ok: false, error: "Empty message" };
      game.publicChat = game.publicChat || [];
      game.publicChat.push({ from: me.username, text, t: Date.now() });
      if (game.publicChat.length > 80) game.publicChat = game.publicChat.slice(-60);
    } else {
      const to = String(payload.to || "");
      if (!to || !game.players[to]) return { ok: false, error: "Invalid recipient" };
      if (to === me.username) return { ok: false, error: "Cannot DM yourself" };
      if (!payload.ciphertext || !payload.iv || !payload.wrappedKey)
        return { ok: false, error: "Encrypted payload required" };
      game.dms = game.dms || [];
      game.dms.push({
        from: me.username,
        to,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        wrappedKey: payload.wrappedKey,
        wrappedKeySender: payload.wrappedKeySender || null,
        t: Date.now(),
      });
      if (game.dms.length > 120) game.dms = game.dms.slice(-100);
    }
    saveDemo(db);
    return { ok: true, game: publicGameView(game, me.username) };
  }

  return { ok: false, error: "Unknown action" };
}

function livingNames(game) {
  return Object.keys(game.players).filter((n) => game.players[n].alive);
}

function advanceTurn(game, reason) {
  if (game.status === "finished") return;
  Object.values(game.players).forEach((p) => {
    if (p.alive) p.ap += 1;
  });
  game.turn = (game.turn || 1) + 1;
  game.turnStartedAt = Date.now();
  game.ready = [];
  game.countdownEndsAt = null;
  game.log.push({
    t: Date.now(),
    type: "system",
    text: reason || `Turn ${game.turn} begins. Living players received 1 AP.`,
  });
  if (game.log.length > 100) game.log = game.log.slice(-80);
}

function maybeStartReadyCountdown(game) {
  const living = livingNames(game);
  if (living.length === 0) return;
  const need = Math.floor((living.length * 2) / 3) + 1; // strictly more than 2/3
  const readyCount = (game.ready || []).filter((n) => living.includes(n)).length;
  if (readyCount >= need && !game.countdownEndsAt) {
    game.countdownEndsAt = Date.now() + READY_COUNTDOWN_MS;
    game.log.push({
      t: Date.now(),
      type: "system",
      text: `More than ⅔ ready (${readyCount}/${living.length}). Next turn in 10 seconds.`,
    });
  }
  if (readyCount < need) game.countdownEndsAt = null;
}

function tickGame(game) {
  if (!game || game.status === "finished") return;
  const now = Date.now();
  // Ready countdown finished
  if (game.countdownEndsAt && now >= game.countdownEndsAt) {
    advanceTurn(game, `Turn ${((game.turn || 1) + 1)} begins (ready vote). Living players received 1 AP.`);
  }
  // 5-minute turn timer
  if (game.turnStartedAt && now - game.turnStartedAt >= TURN_MS) {
    advanceTurn(game, `Turn ${((game.turn || 1) + 1)} begins (timer). Living players received 1 AP.`);
  }
  checkEndConditions(game);
}

function checkEndConditions(game) {
  if (!game || game.status === "finished") return;
  const living = livingNames(game);
  if (living.length === 1) {
    game.status = "finished";
    game.winners = living;
    game.log.push({
      t: Date.now(),
      type: "system",
      text: `${living[0]} is the last player standing and wins!`,
    });
    return;
  }
  if (living.length === 0) {
    game.status = "finished";
    game.winners = [];
    game.log.push({ t: Date.now(), type: "system", text: "No one remains. Draw." });
    return;
  }
  const peace = (game.worldPeace || []).filter((n) => living.includes(n));
  if (peace.length === living.length && living.length > 0) {
    game.status = "finished";
    game.winners = living.slice();
    game.log.push({
      t: Date.now(),
      type: "system",
      text: `World peace declared. Victors: ${living.join(", ")}.`,
    });
  }
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
  const living = Object.keys(game.players).filter((n) => game.players[n].alive);
  // DMs: only messages involving viewer
  const dms = (game.dms || []).filter(
    (m) => m.from === viewer || m.to === viewer
  );
  return {
    id: game.id,
    positions,
    alive,
    log: game.log || [],
    host: game.host,
    turn: game.turn || 1,
    turnStartedAt: game.turnStartedAt || null,
    ready: game.ready || [],
    worldPeace: game.worldPeace || [],
    countdownEndsAt: game.countdownEndsAt || null,
    status: game.status || "playing",
    winners: game.winners || null,
    livingCount: living.length,
    publicChat: game.publicChat || [],
    dms,
    publicKeys: collectPublicKeys(game),
    you: me
      ? { hearts: me.hearts, ap: me.ap, range: me.range, alive: me.alive, x: me.x, y: me.y }
      : null,
    playerNames: Object.keys(game.players),
  };
}

function collectPublicKeys(game) {
  const db = loadDemo();
  const map = {};
  Object.keys(game.players || {}).forEach((name) => {
    const u = db.users.find((x) => x.username === name);
    if (u && u.publicKey) map[name] = u.publicKey;
  });
  Object.assign(map, game.publicKeys || {});
  return map;
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
      victim.ap = 0;
      game.log.push({
        t: Date.now(),
        type: "kill",
        text: `${actorName} dealt the final blow to ${targetName}.`,
      });
      if (game.log.length > 100) game.log = game.log.slice(-80);
      // remove from ready / world peace
      game.ready = (game.ready || []).filter((n) => n !== targetName);
      game.worldPeace = (game.worldPeace || []).filter((n) => n !== targetName);
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown action" };
}

// ---------- Auth ----------
async function uploadPublicKey() {
  try {
    const kp = await ensureKeyPair();
    await api("updatePublicKey", { publicKey: kp.publicJwk });
  } catch (e) {
    console.warn("Public key upload failed", e);
  }
}

async function doLogin(username, password) {
  showSpinner(true);
  try {
    const data = await api("login", { username, password });
    state.user = { username: data.username, token: data.token };
    localStorage.setItem("alliance_session", JSON.stringify(state.user));
    $("#nav-user").textContent = state.user.username;
    await uploadPublicKey();
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
    await uploadPublicKey();
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
  $("#host-panel").classList.toggle("d-none", !isHost);
  $("#btn-end-game").classList.toggle("d-none", !isHost);
  $("#btn-start-game").classList.toggle("d-none", lobby.status === "playing");
  $("#btn-next-turn").classList.toggle("d-none", lobby.status !== "playing");
  $("#game-over-banner").classList.add("d-none");
  await refreshGame();
  startPolling();
  startUiTimer();
}

async function leaveGame() {
  if (state.lobby) {
    try {
      await api("leaveLobby", { lobbyId: state.lobby.id });
    } catch (_) {}
  }
  state.lobby = null;
  stopPolling();
  stopUiTimer();
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

      // Own range is always visible only to you (not others' ranges)
      if (me && me.alive) {
        const dist = chebyshev(me.x, me.y, x, y);
        if (dist > 0 && dist <= me.range) {
          cell.classList.add("own-range");
        }
      }

      // Stronger highlights for current action
      if (me && me.alive && action) {
        if (action === "move" && !occ) {
          if (chebyshev(me.x, me.y, x, y) === 1) cell.classList.add("adjacent");
        }
        if (
          (action === "shoot" || action === "give") &&
          occ &&
          occ.alive &&
          occ.name !== state.user.username
        ) {
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
  const readySet = new Set(game.ready || []);
  const peaceSet = new Set(game.worldPeace || []);
  list.innerHTML = names
    .map((n) => {
      const alive = game.alive?.[n] !== false;
      const isMe = n === state.user.username;
      const isHost = n === game.host;
      const badges = [];
      if (isHost) badges.push('<span class="badge bg-secondary">host</span>');
      if (alive && readySet.has(n)) badges.push('<span class="badge bg-success">ready</span>');
      if (alive && peaceSet.has(n)) badges.push('<span class="badge bg-primary">peace</span>');
      return `<li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span>${escapeHtml(n)}${isMe ? " <em>(you)</em>" : ""} ${badges.join(" ")}</span>
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
  const finished = state.lobby?._game?.status === "finished";
  const alive = you && you.alive && !finished;
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
      $("#btn-end-game").classList.toggle("d-none", !isHost);
      $("#btn-start-game").classList.toggle("d-none", !isHost || state.lobby.status === "playing");
      $("#btn-next-turn").classList.toggle(
        "d-none",
        !isHost || state.lobby.status !== "playing"
      );
    }
    if (data.game) applyGameData(data.game);
    else if (state.lobby.status === "waiting") renderWaitingLobby();
  } catch (e) {
    if (state.lobby.status === "waiting") {
      renderWaitingLobby();
    } else {
      console.warn(e);
    }
  }
}

function applyGameData(game) {
  state.lobby._game = game;
  if (game.publicKeys) state.publicKeys = { ...state.publicKeys, ...game.publicKeys };
  renderBoard(game);
  renderPlayers(game);
  renderLog(game);
  renderOwnStats(game);
  renderTurnUI(game);
  renderMetaButtons(game);
  renderChat(game);
}

function renderTurnUI(game) {
  if (!game || game.status === "finished") {
    $("#turn-label").textContent = "Game over";
    $("#turn-timer").textContent = "––:––";
    $("#ready-count").classList.add("d-none");
    $("#countdown-badge").classList.add("d-none");
    return;
  }
  $("#turn-label").textContent = `Turn ${game.turn || 1}`;
  const living = game.livingCount || 0;
  const readyN = (game.ready || []).length;
  const need = living > 0 ? Math.floor((living * 2) / 3) + 1 : 0;
  $("#ready-count").classList.remove("d-none");
  $("#ready-count").textContent = `Ready ${readyN}/${living} (need ${need})`;
  updateTimersDisplay(game);
}

function updateTimersDisplay(game) {
  if (!game || game.status === "finished") return;
  const now = Date.now();
  if (game.countdownEndsAt && game.countdownEndsAt > now) {
    const sec = Math.max(0, Math.ceil((game.countdownEndsAt - now) / 1000));
    $("#countdown-badge").classList.remove("d-none");
    $("#countdown-sec").textContent = String(sec);
  } else {
    $("#countdown-badge").classList.add("d-none");
  }
  if (game.turnStartedAt) {
    const left = Math.max(0, TURN_MS - (now - game.turnStartedAt));
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    $("#turn-timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
  } else {
    $("#turn-timer").textContent = "5:00";
  }
}

function renderMetaButtons(game) {
  const you = game?.you;
  const finished = game?.status === "finished";
  const alive = you && you.alive && !finished;

  $("#btn-ready").classList.toggle("d-none", !alive);
  $("#btn-world-peace").classList.toggle("d-none", !alive);

  if (alive) {
    const isReady = (game.ready || []).includes(state.user.username);
    $("#btn-ready").classList.toggle("btn-success", isReady);
    $("#btn-ready").classList.toggle("btn-outline-success", !isReady);
    $("#btn-ready").textContent = isReady ? "Ready ✓" : "Ready";

    const isPeace = (game.worldPeace || []).includes(state.user.username);
    $("#btn-world-peace").classList.toggle("btn-primary", isPeace);
    $("#btn-world-peace").classList.toggle("btn-outline-primary", !isPeace);
    $("#btn-world-peace").textContent = isPeace ? "World peace ✓" : "World peace";
  }

  const isHost = game?.host === state.user.username;
  $("#btn-next-turn").classList.toggle("d-none", !isHost || finished || state.lobby?.status !== "playing");
  $("#btn-start-game").classList.toggle("d-none", !isHost || state.lobby?.status === "playing");

  const banner = $("#game-over-banner");
  if (finished) {
    banner.classList.remove("d-none");
    if (game.winners && game.winners.length === 1) {
      banner.textContent = `${game.winners[0]} wins — last player standing!`;
    } else if (game.winners && game.winners.length > 1) {
      banner.textContent = `World peace! Victors: ${game.winners.join(", ")}`;
    } else {
      banner.textContent = "Game over.";
    }
  } else {
    banner.classList.add("d-none");
  }
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
  $("#turn-label").textContent = "Waiting";
  $("#turn-timer").textContent = "––:––";
  $("#ready-count").classList.add("d-none");
  $("#countdown-badge").classList.add("d-none");
  $("#btn-ready").classList.add("d-none");
  $("#btn-world-peace").classList.add("d-none");
  $("#btn-next-turn").classList.add("d-none");
  $("#game-over-banner").classList.add("d-none");
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

function startUiTimer() {
  stopUiTimer();
  state.uiTimer = setInterval(() => {
    const g = state.lobby?._game;
    if (g) updateTimersDisplay(g);
  }, 500);
}

function stopUiTimer() {
  if (state.uiTimer) {
    clearInterval(state.uiTimer);
    state.uiTimer = null;
  }
}

// ---------- Chat ----------
function setChatMode(mode) {
  state.chatMode = mode;
  $("#chat-tab-public").classList.toggle("active", mode === "public");
  $("#chat-tab-dm").classList.toggle("active", mode === "dm");
  $("#dm-target-row").classList.toggle("d-none", mode !== "dm");
  $("#chat-hint").textContent =
    mode === "public"
      ? "Public messages are visible to everyone."
      : "DMs are end-to-end encrypted. Only you and the recipient can read them.";
  const g = state.lobby?._game;
  if (g) renderChat(g);
  else updateChatControls();
}

function updateChatControls() {
  const inGame = !!(state.lobby && state.lobby.status === "playing" && state.lobby._game);
  const input = $("#chat-input");
  const send = $("#btn-chat-send");
  if (!inGame) {
    input.disabled = true;
    send.disabled = true;
    return;
  }
  if (state.chatMode === "dm") {
    const ok = !!state.dmTarget;
    input.disabled = !ok;
    send.disabled = !ok;
  } else {
    input.disabled = false;
    send.disabled = false;
  }
}

async function renderChat(game) {
  const box = $("#chat-box");
  const sel = $("#dm-target");
  const names = (game.playerNames || []).filter((n) => n !== state.user.username);
  const prev = state.dmTarget;
  sel.innerHTML =
    `<option value="">Select player…</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (prev && names.includes(prev)) {
    sel.value = prev;
    state.dmTarget = prev;
  } else {
    state.dmTarget = sel.value || "";
  }

  updateChatControls();

  if (state.chatMode === "public") {
    const msgs = game.publicChat || [];
    box.innerHTML = msgs.length
      ? msgs
          .slice()
          .reverse()
          .map(
            (m) =>
              `<div class="log-entry"><strong>${escapeHtml(m.from)}</strong>: ${escapeHtml(
                m.text
              )} <span class="text-muted small">${formatTime(m.t)}</span></div>`
          )
          .join("")
      : `<div class="text-muted">No public messages yet.</div>`;
    return;
  }

  // DM view
  const target = state.dmTarget;
  if (!target) {
    box.innerHTML = `<div class="text-muted">Select a player to view encrypted DMs.</div>`;
    return;
  }
  const thread = (game.dms || []).filter(
    (m) =>
      (m.from === state.user.username && m.to === target) ||
      (m.from === target && m.to === state.user.username)
  );
  if (!thread.length) {
    box.innerHTML = `<div class="text-muted">No messages with ${escapeHtml(target)} yet.</div>`;
    return;
  }
  const lines = [];
  for (const m of thread.slice().reverse()) {
    const text = m.localPlain || (await decryptDm(m));
    lines.push(
      `<div class="log-entry"><strong>${escapeHtml(m.from)}</strong>: ${escapeHtml(
        text
      )} <span class="text-muted small">${formatTime(m.t)}</span></div>`
    );
  }
  box.innerHTML = lines.join("");
}

async function sendChatMessage() {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text || !state.lobby) return;

  if (state.chatMode === "public") {
    showSpinner(true);
    try {
      const data = await api("sendChat", {
        lobbyId: state.lobby.id,
        channel: "public",
        text,
      });
      input.value = "";
      if (data.game) applyGameData(data.game);
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
    return;
  }

  const to = state.dmTarget;
  if (!to) return alert("Select a recipient");
  const pub = state.publicKeys[to];
  if (!pub) {
    return alert(
      "That player has no encryption key yet. They need to log in once so their key is uploaded."
    );
  }
  showSpinner(true);
  try {
    await ensureKeyPair();
    const enc = await encryptDm(text, pub);
    const data = await api("sendChat", {
      lobbyId: state.lobby.id,
      channel: "dm",
      to,
      ...enc,
      // optional: server ignores localPlain; we keep it only client-side for sent display
    });
    // Attach local plaintext for our own sent messages in this session
    if (data.game && data.game.dms) {
      const last = data.game.dms.filter((m) => m.from === state.user.username && m.to === to).pop();
      if (last) last.localPlain = text;
      // also stash on internal game object after apply
      applyGameData(data.game);
      const g = state.lobby._game;
      if (g && g.dms) {
        g.dms.forEach((m) => {
          if (m.from === state.user.username && m.to === to && m.ciphertext === enc.ciphertext) {
            m.localPlain = text;
          }
        });
        renderChat(g);
      }
    }
    input.value = "";
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    showSpinner(false);
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
      state.lobby.status = "playing";
      applyGameData(data.game);
      $("#btn-start-game").classList.add("d-none");
      $("#btn-next-turn").classList.remove("d-none");
      $("#host-panel").classList.remove("d-none");
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
  });
  $("#btn-next-turn").addEventListener("click", async () => {
    showSpinner(true);
    try {
      const data = await api("nextTurn", { lobbyId: state.lobby.id });
      applyGameData(data.game);
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
  });
  $("#btn-ready").addEventListener("click", async () => {
    const g = state.lobby?._game;
    if (!g) return;
    const currently = (g.ready || []).includes(state.user.username);
    showSpinner(true);
    try {
      const data = await api("setReady", { lobbyId: state.lobby.id, ready: !currently });
      applyGameData(data.game);
    } catch (e) {
      alert(e.message);
    } finally {
      showSpinner(false);
    }
  });
  $("#btn-world-peace").addEventListener("click", async () => {
    const g = state.lobby?._game;
    if (!g) return;
    const currently = (g.worldPeace || []).includes(state.user.username);
    showSpinner(true);
    try {
      const data = await api("setWorldPeace", {
        lobbyId: state.lobby.id,
        worldPeace: !currently,
      });
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

  $("#chat-tab-public").addEventListener("click", () => setChatMode("public"));
  $("#chat-tab-dm").addEventListener("click", () => setChatMode("dm"));
  $("#dm-target").addEventListener("change", () => {
    state.dmTarget = $("#dm-target").value;
    const g = state.lobby?._game;
    if (g) renderChat(g);
    else updateChatControls();
  });
  $("#btn-chat-send").addEventListener("click", sendChatMessage);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// ---------- Boot ----------
async function boot() {
  bindEvents();
  const saved = localStorage.getItem("alliance_session");
  if (saved) {
    try {
      state.user = JSON.parse(saved);
      $("#nav-user").textContent = state.user.username;
      showView("lobbies");
      await ensureKeyPair();
      await uploadPublicKey();
      refreshLobbies();
      return;
    } catch (_) {}
  }
  showView("auth");
  if (ALLIANCE_DEMO_MODE) {
    console.info(
      "Alliance running in DEMO mode (localStorage). Set ALLIANCE_REMOTE_URL in alliance-config.js for real multiplayer."
    );
  }
}

boot();
