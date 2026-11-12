const GRID = 15;
const START_HEARTS = 3;
const START_RANGE = 3;
const START_AP = 1;
const TURN_MS = 5 * 60 * 1000;
const READY_COUNTDOWN_MS = 10 * 1000;
const NO_AP_COUNTDOWN_MS = 30 * 1000;
const MAX_LOG = 120;

const CORS = {
  "Access-Control-Allow-Origin": "https://wowe-main.eu",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj) =>
  new Response(JSON.stringify(obj), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const uuid = () => crypto.randomUUID();

async function hashPassword(password, salt) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(salt + ":" + password)
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Alliance {
  constructor(state) {
    this.state = state;
    this.db = { users: [], lobbies: {}, games: {} };
    this.saved = null;
    // load stored data once, before any request is handled
    state.blockConcurrencyWhile(async () => {
      const raw = await state.storage.get("db");
      if (raw) {
        this.db = JSON.parse(raw);
        this.saved = raw;
      }
    });
  }

  async save() {
    const db = this.db;
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
    for (const id of Object.keys(db.lobbies)) {
      const l = db.lobbies[id];
      if (l.status === "finished" && l.created < cutoff) {
        if (l.gameId) delete db.games[l.gameId];
        delete db.lobbies[id];
      }
    }
    const s = JSON.stringify(db);
    if (s !== this.saved) {
      await this.state.storage.put("db", s); // only write when something changed
      this.saved = s;
    }
  }

  async fetch(request) {
    if (request.method === "GET") {
      return json({ ok: true, service: "Alliance", version: 3 });
    }
    try {
      const body = JSON.parse((await request.text()) || "{}");
      const result = await this.handle(body);
      await this.save();
      return json(result);
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) });
    }
  }

  async handle(body) {
    const db = this.db;
    const action = body.action;

    if (action === "register") return this.register(body);
    if (action === "login") return this.login(body);

    const user = body.token ? db.users.find((u) => u.id === body.token) : null;
    if (!user) return { ok: false, error: "Not logged in" };

    switch (action) {
      case "listLobbies": return this.listLobbies();
      case "createLobby": return this.createLobby(user, body);
      case "joinLobby": return this.joinLobby(user, body);
      case "leaveLobby": return this.leaveLobby(user, body);
      case "startGame": return this.startGame(user, body);
      case "getGame": return this.getGame(user, body);
      case "doAction": return this.doAction(user, body);
      case "setReady": return this.setReady(user, body);
      case "setWorldPeace": return this.setWorldPeace(user, body);
      case "nextTurn": return this.nextTurn(user, body);
      case "endGame": return this.endGame(user, body);
      case "updatePublicKey": return this.updatePublicKey(user, body);
      case "sendChat": return this.sendChat(user, body);
    }
    return { ok: false, error: "Unknown action" };
  }

  // ---------- Auth ----------
  async register(body) {
    const db = this.db;
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username.length < 3 || username.length > 24) return { ok: false, error: "Username 3–24 chars" };
    if (!/^[A-Za-z0-9_]+$/.test(username)) return { ok: false, error: "Username: letters, numbers, _ only" };
    if (password.length < 6) return { ok: false, error: "Password min 6 characters" };

    const salt = uuid();
    const passwordHash = await hashPassword(password, salt); // compute first...
    // ...then check + add with no waiting in between
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return { ok: false, error: "Username taken" };
    const id = uuid();
    db.users.push({ id, username, salt, passwordHash, created: Date.now() });
    return { ok: true, username, token: id };
  }

  async login(body) {
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const u = this.db.users.find((x) => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return { ok: false, error: "Invalid username or password" };
    const h = await hashPassword(password, u.salt);
    if (u.passwordHash !== h) return { ok: false, error: "Invalid username or password" };
    return { ok: true, username: u.username, token: u.id };
  }

  // ---------- Lobbies ----------
  publicLobby(l) {
    return {
      id: l.id, name: l.name, host: l.host, players: l.players,
      maxPlayers: l.maxPlayers, status: l.status, created: l.created,
    };
  }

  listLobbies() {
    const list = Object.values(this.db.lobbies)
      .filter((l) => l.status === "waiting" || l.status === "playing")
      .map((l) => this.publicLobby(l));
    return { ok: true, lobbies: list };
  }

  createLobby(user, body) {
    const id = uuid();
    const lobby = {
      id,
      name: String(body.name || user.username + "'s lobby").slice(0, 40),
      host: user.username,
      players: [user.username],
      maxPlayers: Math.min(16, Math.max(2, Number(body.maxPlayers) || 6)),
      status: "waiting",
      created: Date.now(),
      gameId: null,
    };
    this.db.lobbies[id] = lobby;
    return { ok: true, lobby: this.publicLobby(lobby) };
  }

  joinLobby(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (lobby.status !== "waiting") {
      if (!lobby.players.includes(user.username)) return { ok: false, error: "Game already started" };
      return { ok: true, lobby: this.publicLobby(lobby) };
    }
    if (lobby.players.includes(user.username)) return { ok: true, lobby: this.publicLobby(lobby) };
    if (lobby.players.length >= lobby.maxPlayers) return { ok: false, error: "Lobby full" };
    lobby.players.push(user.username);
    return { ok: true, lobby: this.publicLobby(lobby) };
  }

  leaveLobby(user, body) {
    const db = this.db;
    const lobby = db.lobbies[body.lobbyId];
    if (!lobby) return { ok: true };
    lobby.players = lobby.players.filter((p) => p !== user.username);
    if (lobby.players.length === 0) {
      if (lobby.gameId && db.games[lobby.gameId]) delete db.games[lobby.gameId];
      delete db.lobbies[body.lobbyId];
    } else if (lobby.host === user.username) {
      lobby.host = lobby.players[0];
    }
    return { ok: true };
  }

  // ---------- Game ----------
  startGame(user, body) {
    const db = this.db;
    const lobby = db.lobbies[body.lobbyId];
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (lobby.host !== user.username) return { ok: false, error: "Only host can start" };
    if (lobby.players.length < 2) return { ok: false, error: "Need at least 2 players" };
    if (lobby.status === "playing") return { ok: false, error: "Already started" };

    const positions = this.placePlayers(lobby.players);
    const players = {};
    lobby.players.forEach((name) => {
      const pos = positions[name];
      players[name] = {
        x: pos.x, y: pos.y, hearts: START_HEARTS, ap: START_AP, range: START_RANGE, alive: true,
      };
    });

    const gameId = uuid();
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
    return { ok: true, game: this.gameView(game, user.username) };
  }

  getGame(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (!lobby.gameId) return { ok: true, lobby: this.publicLobby(lobby), game: null };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "Game missing" };
    this.tickGame(game);
    return { ok: true, lobby: this.publicLobby(lobby), game: this.gameView(game, user.username) };
  }

  doAction(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No active game" };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "Game missing" };
    this.tickGame(game);
    if (game.status === "finished") return { ok: true, game: this.gameView(game, user.username) };
    const result = this.applyAction(game, user.username, body.act, body.target);
    if (!result.ok) return result;
    this.maybeStartNoApCountdown(game);
    this.checkEndConditions(game);
    return { ok: true, game: this.gameView(game, user.username) };
  }

  setReady(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    this.tickGame(game);
    if (game.status === "finished") return { ok: true, game: this.gameView(game, user.username) };
    const p = game.players[user.username];
    if (!p || !p.alive) return { ok: false, error: "Only living players can ready" };
    const on = !!body.ready;
    game.ready = game.ready || [];
    if (on && !game.ready.includes(user.username)) game.ready.push(user.username);
    if (!on) game.ready = game.ready.filter((n) => n !== user.username);
    this.maybeStartReadyCountdown(game);
    this.tickGame(game);
    return { ok: true, game: this.gameView(game, user.username) };
  }

  setWorldPeace(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    this.tickGame(game);
    if (game.status === "finished") return { ok: true, game: this.gameView(game, user.username) };
    const p = game.players[user.username];
    if (!p || !p.alive) return { ok: false, error: "Only living players can vote" };
    const on = !!body.worldPeace;
    game.worldPeace = game.worldPeace || [];
    if (on && !game.worldPeace.includes(user.username)) game.worldPeace.push(user.username);
    if (!on) game.worldPeace = game.worldPeace.filter((n) => n !== user.username);
    this.checkEndConditions(game);
    return { ok: true, game: this.gameView(game, user.username) };
  }

  nextTurn(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || lobby.host !== user.username) return { ok: false, error: "Host only" };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    if (game.status === "finished") return { ok: true, game: this.gameView(game, user.username) };
    this.advanceTurn(game, "Host forced the next turn.");
    return { ok: true, game: this.gameView(game, user.username) };
  }

  endGame(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || lobby.host !== user.username) return { ok: false, error: "Host only" };
    lobby.status = "finished";
    const game = lobby.gameId ? this.db.games[lobby.gameId] : null;
    if (game && game.status !== "finished") {
      game.status = "finished";
      game.log.push({ t: Date.now(), type: "system", text: "Host ended the game." });
    }
    return { ok: true };
  }

  updatePublicKey(user, body) {
    user.publicKey = body.publicKey || null;
    return { ok: true };
  }

  sendChat(user, body) {
    const lobby = this.db.lobbies[body.lobbyId];
    if (!lobby || !lobby.gameId) return { ok: false, error: "No game" };
    const game = this.db.games[lobby.gameId];
    if (!game) return { ok: false, error: "No game" };
    const channel = body.channel === "dm" ? "dm" : "public";
    if (channel === "public") {
      const text = String(body.text || "").trim().slice(0, 200);
      if (!text) return { ok: false, error: "Empty message" };
      game.publicChat = game.publicChat || [];
      game.publicChat.push({ from: user.username, text, t: Date.now() });
      if (game.publicChat.length > 80) game.publicChat = game.publicChat.slice(-60);
    } else {
      const to = String(body.to || "");
      if (!to || !game.players[to]) return { ok: false, error: "Invalid recipient" };
      if (to === user.username) return { ok: false, error: "Cannot DM yourself" };
      if (!body.ciphertext || !body.iv || !body.wrappedKey)
        return { ok: false, error: "Encrypted payload required" };
      game.dms = game.dms || [];
      game.dms.push({
        from: user.username, to,
        ciphertext: body.ciphertext, iv: body.iv,
        wrappedKey: body.wrappedKey,
        wrappedKeySender: body.wrappedKeySender || null,
        t: Date.now(),
      });
      if (game.dms.length > 120) game.dms = game.dms.slice(-100);
    }
    return { ok: true, game: this.gameView(game, user.username) };
  }

  // ---------- Rules engine ----------
  livingNames(game) {
    return Object.keys(game.players).filter((n) => game.players[n].alive);
  }

  trimLog(game) {
    if (game.log && game.log.length > MAX_LOG) {
      game.log = game.log.slice(-Math.floor(MAX_LOG * 0.7));
    }
  }

  advanceTurn(game, reason) {
    if (game.status === "finished") return;
    Object.values(game.players).forEach((p) => { if (p.alive) p.ap += 1; });
    game.turn = (game.turn || 1) + 1;
    game.turnStartedAt = Date.now();
    game.ready = [];
    game.countdownEndsAt = null;
    game.noApCountdownEndsAt = null;
    game.log.push({
      t: Date.now(), type: "system",
      text: reason || "Turn " + game.turn + " begins. Living players received 1 AP.",
    });
    this.trimLog(game);
  }

  maybeStartReadyCountdown(game) {
    const living = this.livingNames(game);
    if (living.length === 0) return;
    const need = Math.floor((living.length * 2) / 3) + 1;
    const readyCount = (game.ready || []).filter((n) => living.includes(n)).length;
    if (readyCount >= need && !game.countdownEndsAt) {
      game.countdownEndsAt = Date.now() + READY_COUNTDOWN_MS;
      game.log.push({
        t: Date.now(), type: "system",
        text: "More than ⅔ ready (" + readyCount + "/" + living.length + "). Next turn in 10 seconds.",
      });
    }
    if (readyCount < need) game.countdownEndsAt = null;
  }

  maybeStartNoApCountdown(game) {
    if (game.status === "finished") return;
    const living = this.livingNames(game);
    if (living.length === 0) { game.noApCountdownEndsAt = null; return; }
    const anyAp = living.some((n) => (game.players[n].ap || 0) > 0);
    if (anyAp) { game.noApCountdownEndsAt = null; return; }
    if (!game.noApCountdownEndsAt) {
      game.noApCountdownEndsAt = Date.now() + NO_AP_COUNTDOWN_MS;
      game.log.push({
        t: Date.now(), type: "system",
        text: "No living player has AP left. Next turn in 30 seconds.",
      });
    }
  }

  tickGame(game) {
    if (!game || game.status === "finished") return;
    const now = Date.now();
    this.maybeStartNoApCountdown(game);
    if (game.countdownEndsAt && now >= game.countdownEndsAt) {
      this.advanceTurn(game, "Turn " + ((game.turn || 1) + 1) + " begins (ready vote). Living players received 1 AP.");
    }
    if (game.noApCountdownEndsAt && now >= game.noApCountdownEndsAt) {
      this.advanceTurn(game, "Turn " + ((game.turn || 1) + 1) + " begins (no AP left). Living players received 1 AP.");
    }
    if (game.turnStartedAt && now - game.turnStartedAt >= TURN_MS) {
      this.advanceTurn(game, "Turn " + ((game.turn || 1) + 1) + " begins (timer). Living players received 1 AP.");
    }
    this.checkEndConditions(game);
  }

  checkEndConditions(game) {
    if (!game || game.status === "finished") return;
    const living = this.livingNames(game);
    if (living.length === 1) {
      game.status = "finished";
      game.winners = living;
      game.log.push({ t: Date.now(), type: "system", text: living[0] + " is the last player standing and wins!" });
      return;
    }
    if (living.length === 0) {
      game.status = "finished";
      game.winners = [];
      game.log.push({ t: Date.now(), type: "system", text: "No one remains. Draw." });
      return;
    }
    const peace = (game.worldPeace || []).filter((n) => living.includes(n));
    if (peace.length === living.length) {
      game.status = "finished";
      game.winners = living.slice();
      game.log.push({ t: Date.now(), type: "system", text: "World peace declared. Victors: " + living.join(", ") + "." });
    }
  }

  placePlayers(names) {
    const cells = [];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells.push({ x, y });
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const out = {};
    names.forEach((n, idx) => { out[n] = cells[idx]; });
    return out;
  }

  gameView(game, viewer) {
    const positions = {};
    const alive = {};
    Object.keys(game.players).forEach((name) => {
      const p = game.players[name];
      positions[name] = { x: p.x, y: p.y };
      alive[name] = p.alive;
    });
    const me = game.players[viewer];
    const living = this.livingNames(game);
    const dms = (game.dms || []).filter((m) => m.from === viewer || m.to === viewer);
    const publicKeys = {};
    Object.keys(game.players).forEach((name) => {
      const u = this.db.users.find((x) => x.username === name);
      if (u && u.publicKey) publicKeys[name] = u.publicKey;
    });
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
      noApCountdownEndsAt: game.noApCountdownEndsAt || null,
      status: game.status || "playing",
      winners: game.winners || null,
      livingCount: living.length,
      publicChat: game.publicChat || [],
      dms,
      publicKeys,
      you: me ? { hearts: me.hearts, ap: me.ap, range: me.range, alive: me.alive, x: me.x, y: me.y } : null,
      playerNames: Object.keys(game.players),
    };
  }

  chebyshev(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  }

  inRange(x1, y1, x2, y2, range) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    if (dx === 0 && dy === 0) return false;
    if (dx === 0 || dy === 0) return Math.max(dx, dy) <= range;
    return Math.max(dx, dy) <= Math.max(0, range - 1);
  }

  applyAction(game, actorName, act, target) {
    const actor = game.players[actorName];
    if (!actor || !actor.alive) return { ok: false, error: "You are eliminated" };

    if (act === "upgrade") {
      if (actor.ap < 2) return { ok: false, error: "Need 2 AP" };
      actor.ap -= 2;
      actor.range += 1;
      return { ok: true };
    }

    if (act === "move") {
      if (actor.ap < 1) return { ok: false, error: "Need 1 AP" };
      const x = target && target.x;
      const y = target && target.y;
      if (x == null || y == null || x < 0 || y < 0 || x >= GRID || y >= GRID)
        return { ok: false, error: "Invalid cell" };
      if (this.chebyshev(actor.x, actor.y, x, y) !== 1) return { ok: false, error: "Must be adjacent" };
      const occupied = Object.values(game.players).some((p) => p.alive && p.x === x && p.y === y);
      if (occupied) return { ok: false, error: "Cell occupied" };
      actor.ap -= 1;
      actor.x = x;
      actor.y = y;
      return { ok: true };
    }

    if (act === "give" || act === "shoot") {
      if (actor.ap < 1) return { ok: false, error: "Need 1 AP" };
      const targetName = target && target.name;
      const victim = game.players[targetName];
      if (!victim) return { ok: false, error: "Invalid target" };
      if (targetName === actorName) return { ok: false, error: "Cannot target yourself" };
      if (!this.inRange(actor.x, actor.y, victim.x, victim.y, actor.range))
        return { ok: false, error: "Out of range" };

      if (act === "give") {
        if (!victim.alive) return { ok: false, error: "Target is dead" };
        actor.ap -= 1;
        victim.ap += 1;
        return { ok: true };
      }

      if (!victim.alive) return { ok: false, error: "Already dead" };
      actor.ap -= 1;
      victim.hearts -= 1;
      if (victim.hearts <= 0) {
        victim.hearts = 0;
        victim.alive = false;
        victim.ap = 0;
        game.log.push({ t: Date.now(), type: "kill", text: actorName + " dealt the final blow to " + targetName + "." });
        this.trimLog(game);
        game.ready = (game.ready || []).filter((n) => n !== targetName);
        game.worldPeace = (game.worldPeace || []).filter((n) => n !== targetName);
      }
      return { ok: true };
    }

    return { ok: false, error: "Unknown action" };
  }
}