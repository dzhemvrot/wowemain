const MAX_LOGS = 2000;
const MAX_ARCHIVE = 200;
const SESSION_MS = 12 * 60 * 60 * 1000; // logins last 12 hours
const CHOICE_LV = { for: "Par", against: "Pret", abstain: "Atturas" };

const CORS = {
  "Access-Control-Allow-Origin": "https://wowe-main.eu",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const emptySession = () => ({ open: false, date: null, openedBy: null, openedAt: null });
const defaults = () => ({
  members: [], attendance: {}, users: [], logs: [],
  publicSession: emptySession(), activeVote: null, voteArchive: [], codes: {},
});
const todayRiga = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Riga" }); // YYYY-MM-DD
const pubUser = (u) => ({ id: u.id, username: u.username, isAdmin: !!u.isAdmin });
const isMain = (u) => String(u.username).toLowerCase() === "admin";
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const IP_KEEP_MS = 90 * 24 * 60 * 60 * 1000; // how long IPs are kept
const STATUSES = ["present", "absent", "excused"];

// removes IPs from log entries older than IP_KEEP_MS (also the ones inside old text)
function scrubOldIps(logs, field) {
  const cutoff = Date.now() - IP_KEEP_MS;
  for (const l of logs) {
    if (Date.parse(l.ts) >= cutoff) continue;
    if (l.ip) delete l.ip;
    if (typeof l[field] === "string" && l[field].includes("IP:")) {
      l[field] = l[field].replace(/\s*·?\s*IP:\s*[0-9a-fA-F:.]+/g, "");
    }
  }
}

// apply only what the organizer's page CHANGED since it last loaded (client vs base)
function mergeAttendance(server, client, base) {
  const out = JSON.parse(JSON.stringify(server || {}));
  const dates = new Set([...Object.keys(client || {}), ...Object.keys(base || {})]);
  for (const date of dates) {
    const c = (client && client[date]) || {};
    const b = (base && base[date]) || {};
    for (const id of new Set([...Object.keys(c), ...Object.keys(b)])) {
      if (c[id] === b[id]) continue; // this page didn't touch it
      if (c[id] !== undefined && !STATUSES.includes(c[id])) continue;
      if (!out[date]) out[date] = {};
      if (c[id] === undefined) delete out[date][id];
      else out[date][id] = c[id];
    }
    if (out[date] && !Object.keys(out[date]).length) delete out[date];
  }
  return out;
}

// ---------- passwords ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 },
    key, 256
  );
  return hex(bits);
}
async function makeHash(password) {
  const salt = crypto.randomUUID();
  return { salt, passwordHash: await pbkdf2(password, salt), algo: "pbkdf2" };
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function checkPassword(user, password) {
  if (user.algo === "pbkdf2") return same(await pbkdf2(password, user.salt), user.passwordHash);
  if (user.passwordHash && user.salt) return same(await sha256(user.salt + password), user.passwordHash); // old format
  if (user.password) return user.password === password; // very old plaintext
  return false;
}

// keep ballots cast by the public while an organizer's older copy gets saved
function mergeVote(cur, inc) {
  if (!inc || !cur || cur.id !== inc.id) return inc;
  const ballots = { ...(cur.ballots || {}) };
  for (const [id, b] of Object.entries(inc.ballots || {})) {
    const old = ballots[id];
    if (!old || (b.history || []).length > (old.history || []).length) ballots[id] = b;
  }
  return { ...inc, ballots };
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_ALPHABET[x % 32]).join(""); // 32 divides 256, so no bias
}

export class Sp {
  constructor(state, env) {
    this.state = state;
    this.data = defaults();
    this.saved = null;
    this.fails = new Map(); // login rate limiting, per IP
	this.codeFails = new Map(); // wrong-code rate limiting
    state.blockConcurrencyWhile(async () => {
      let raw = await state.storage.get("data");
      if (!raw) {
        raw = await env.DB.get("data:sp"); // first start: copy from the old KV store
        if (raw) await state.storage.put("data", raw);
      }
      if (raw) {
        this.data = { ...defaults(), ...JSON.parse(raw) };
        this.saved = raw;
      }
    });
  }

  ensureCodes() {
    const d = this.data;
    if (!d.codes) d.codes = {};
    const ids = new Set(d.members.map((m) => m.id));
    for (const id of Object.keys(d.codes)) if (!ids.has(id)) delete d.codes[id]; // removed members
    const used = new Set(Object.values(d.codes));
    for (const m of d.members) {
      if (!d.codes[m.id]) {
        let c;
        do { c = newCode(); } while (used.has(c));
        used.add(c);
        d.codes[m.id] = c;
      }
    }
  }

  checkCode(memberId, code, ip) {
    const now = Date.now();
    const km = "m:" + memberId, ki = "i:" + ip;
    const fm = this.codeFails.get(km) || { n: 0, until: 0 };
    const fi = this.codeFails.get(ki) || { n: 0, until: 0 };
    if (fm.until > now || fi.until > now) {
      return "Pārāk daudz nepareizu kodu. Mēģini pēc 10 minūtēm.";
    }
    const real = (this.data.codes || {})[memberId];
    const given = String(code || "").toUpperCase().replace(/[\s-]/g, "");
    if (real && same(real, given)) {
      this.codeFails.delete(km);
      return null;
    }
    fm.n++; fi.n++;
    if (fm.n >= 5) { fm.until = now + 10 * 60 * 1000; fm.n = 0; }
    if (fi.n >= 20) { fi.until = now + 10 * 60 * 1000; fi.n = 0; }
    this.codeFails.set(km, fm);
    this.codeFails.set(ki, fi);
    return "Nepareizs kods.";
  }

  async persist() {
    this.ensureCodes();
    const d = this.data;
    d.logs = d.logs.slice(-MAX_LOGS);
    scrubOldIps(d.logs, "details");
    d.voteArchive = d.voteArchive.slice(-MAX_ARCHIVE);
    const s = JSON.stringify({
      members: d.members, attendance: d.attendance, users: d.users, logs: d.logs,
      publicSession: d.publicSession, activeVote: d.activeVote, voteArchive: d.voteArchive,
      codes: d.codes,
    });
    if (s !== this.saved) {
      await this.state.storage.put("data", s);
      this.saved = s;
    }
  }

  backupData() {
    const d = this.data;
    return {
      format: "sp-backup-v1",
      createdAt: new Date().toISOString(),
      data: {
        members: d.members, attendance: d.attendance, users: d.users, logs: d.logs,
        publicSession: d.publicSession, activeVote: d.activeVote,
        voteArchive: d.voteArchive, codes: d.codes,
      },
    };
  }

  log(username, action, details, ip) {
    this.data.logs.push({
      ts: new Date().toISOString(),
      username, action, details: details || "", ip: ip || null,
    });
  }

  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(request.url).pathname.replace(/^\/sp/, "").replace(/\/+$/, "") || "/";
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      if (request.method === "GET") {
        if (path === "/__cron") return json(this.backupData());
        if (path === "/public") return json(this.publicView());
        return json({ ok: false, error: "not found" }, 404);
      }
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);

      const text = await request.text();
      const body = text ? JSON.parse(text) : {};
      let res;
      if (path === "/login") res = await this.login(body, ip);
      else if (path === "/checkin") res = this.checkin(body, ip);
      else if (path === "/vote") res = this.vote(body, ip);
      else {
        const user = await this.auth(body);
        if (!user) return json({ ok: false, error: "Not logged in" }, 401);
        res = await this.authed(path, user, body, ip);
      }
      await this.persist();
      return json(res);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) });
    }
  }

  // ---------- sessions ----------
  async auth(body) {
    if (!body.token) return null;
    const s = await this.state.storage.get("s:" + body.token);
    if (!s || s.exp < Date.now()) return null;
    return this.data.users.find((u) => u.id === s.userId) || null;
  }

  async killSessions(userId, exceptToken) {
    const all = await this.state.storage.list({ prefix: "s:" });
    for (const [k, v] of all) {
      if (v.userId === userId && k !== "s:" + exceptToken) await this.state.storage.delete(k);
    }
  }

  async login(body, ip) {
    const now = Date.now();
    const f = this.fails.get(ip) || { n: 0, until: 0 };
    if (f.until > now) return { ok: false, error: "Pārāk daudz mēģinājumu. Mēģini pēc 15 minūtēm." };

    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = this.data.users.find((u) => String(u.username).toLowerCase() === username.toLowerCase());
    const ok = user && (await checkPassword(user, password));
    if (!ok) {
      f.n++;
      if (f.n >= 8) { f.until = now + 15 * 60 * 1000; f.n = 0; }
      this.fails.set(ip, f);
      return { ok: false, error: "Nepareizs lietotājvārds vai parole." };
    }
    this.fails.delete(ip);

    if (user.algo !== "pbkdf2") { // upgrade old hash to the stronger one
      Object.assign(user, await makeHash(password));
      delete user.password;
    }

    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await this.state.storage.put("s:" + token, { userId: user.id, exp: now + SESSION_MS });
    const all = await this.state.storage.list({ prefix: "s:" }); // tidy expired sessions
    for (const [k, v] of all) if (v.exp < now) await this.state.storage.delete(k);

    this.log(user.username, "login", "", ip);
    return { ok: true, token, user: pubUser(user) };
  }

  // ---------- public endpoints ----------
  publicView() {
    const d = this.data;
    const s = d.publicSession || emptySession();
    const att = {};
    if (s.open && s.date && d.attendance[s.date]) {
      att[s.date] = {};
      for (const [id, st] of Object.entries(d.attendance[s.date])) {
        if (st === "present") att[s.date][id] = "present";
      }
    }
    let av = null;
    const v = d.activeVote;
    if (v && v.open) {
      const ballots = {};
      for (const [id, b] of Object.entries(v.ballots || {})) {
        if (b && b.choice) ballots[id] = { choice: v.secret ? "voted" : b.choice };
      }
      av = {
        id: v.id, title: v.title, description: v.description, majority: v.majority,
        ballot: v.ballot, abstainAs: v.abstainAs, secret: v.secret, date: v.date,
        eligible: v.eligible, open: true, ballots,
      };
    }
    return {
      ok: true,
      members: d.members.map((m) => ({ id: m.id, name: m.name, joinedOn: m.joinedOn || null })),
      attendance: att,
      publicSession: { open: !!s.open, date: s.date || null },
      activeVote: av,
    };
  }

  checkin(body, ip) {
    const d = this.data;
    const s = d.publicSession;
    const today = todayRiga();
    if (!s || !s.open || s.date !== today) return { ok: false, error: "Reģistrācija ir slēgta." };
    const m = d.members.find((x) => x.id === body.memberId);
    if (!m || (m.joinedOn && m.joinedOn > today)) return { ok: false, error: "Persona nav atrasta." };
    const codeErr = this.checkCode(m.id, body.code, ip);
    if (codeErr) return { ok: false, error: codeErr };
    if (!d.attendance[today]) d.attendance[today] = {};
    d.attendance[today][m.id] = "present";
    this.log("publisks", "public_checkin", m.name + " · " + today, ip);
    return { ok: true };
  }

  vote(body, ip) {
    const d = this.data;
    const av = d.activeVote;
    if (!av || !av.open || av.id !== body.voteId) return { ok: false, error: "Balsošana ir slēgta." };
    const m = d.members.find((x) => x.id === body.memberId);
    if (!m || !(av.eligible || []).includes(m.id)) return { ok: false, error: "Tu neesi tiesīgo sarakstā." };
    const codeErr = this.checkCode(m.id, body.code, ip);
    if (codeErr) return { ok: false, error: codeErr };
    const choice = body.choice;
    if (!["for", "against", "abstain"].includes(choice)) return { ok: false, error: "Nederīga izvēle." };
    if (av.ballot === "fa" && choice === "abstain") return { ok: false, error: "Šeit nav «Atturas»." };
    if (!av.ballots) av.ballots = {};
    const prev = av.ballots[m.id] || { choice: null, history: [] };
    if (!prev.history) prev.history = [];
    prev.history.push({ choice, ts: new Date().toISOString() });
    prev.choice = choice;
    av.ballots[m.id] = prev;
    this.log("publisks", "cast_vote", m.name + " · " + CHOICE_LV[choice], ip);
    return { ok: true };
  }

  // ---------- organizer endpoints ----------
  fullView(user) {
    const d = this.data;
    const admin = !!user.isAdmin;
    return {
      ok: true,
      members: d.members,
      attendance: d.attendance,
      users: admin ? d.users.map(pubUser) : [],
      // IPs are added to the text ONLY for admins; everyone else gets no logs
      logs: admin
        ? d.logs.map((l) => ({
            ts: l.ts, username: l.username, action: l.action,
            details: (l.details || "") + (l.ip ? " · IP: " + l.ip : ""),
          }))
        : [],
      publicSession: d.publicSession || emptySession(),
      activeVote: d.activeVote || null,
      voteArchive: d.voteArchive || [],
    };
  }

  async authed(path, user, body, ip) {
    const d = this.data;

    if (path === "/data") return this.fullView(user);

    if (path === "/save") {
      if (Array.isArray(body.members)) d.members = body.members;
      if (body.attendance && typeof body.attendance === "object") {
        if (body._mergeAttendance === true) {
          for (const [date, day] of Object.entries(body.attendance)) {
            d.attendance[date] = { ...(d.attendance[date] || {}), ...(day || {}) };
          }
        } else {
          d.attendance = mergeAttendance(
            d.attendance, body.attendance,
            isObj(body.attendanceBase) ? body.attendanceBase : {}
          );
        }
      }
      if (body.publicSession && typeof body.publicSession === "object") {
        const p = body.publicSession;
        d.publicSession = {
          open: !!p.open, date: p.date || null,
          openedBy: p.openedBy || null, openedAt: p.openedAt || null,
        };
      }
      if (body.activeVote !== undefined) d.activeVote = mergeVote(d.activeVote, body.activeVote);
      if (Array.isArray(body.voteArchive)) d.voteArchive = body.voteArchive.slice(-MAX_ARCHIVE);
      if (Array.isArray(body.newLogs)) {
        for (const l of body.newLogs.slice(0, 200)) {
          d.logs.push({
            ts: typeof l.ts === "string" ? l.ts : new Date().toISOString(),
            username: user.username, // always the real logged-in user
            action: String(l.action || "").slice(0, 60),
            details: String(l.details || "").slice(0, 500),
            ip,
          });
        }
      }
      return this.fullView(user);
    }

    if (path === "/logout") {
      await this.state.storage.delete("s:" + body.token);
      this.log(user.username, "logout", "", ip);
      return { ok: true };
    }

    if (path === "/password") {
      const neu = String(body.newPassword || "");
      if (neu.length < 8) return { ok: false, error: "Parolei jābūt vismaz 8 simboliem." };
      if (!(await checkPassword(user, String(body.current || "")))) {
        return { ok: false, error: "Pašreizējā parole nav pareiza." };
      }
      Object.assign(user, await makeHash(neu));
      delete user.password;
      await this.killSessions(user.id, body.token);
      this.log(user.username, "change_password", user.username, ip);
      return { ok: true };
    }

    // everything below is admin only
    if (!user.isAdmin) return { ok: false, error: "Tikai administrators." };
    if (path === "/backup") return { ok: true, backup: this.backupData() };

    if (path === "/restore") {
      if (!isMain(user)) return { ok: false, error: "Tikai galvenais admin var atjaunot datus." };
      const b = body.backup;
      const x = b && b.data;
      if (!b || b.format !== "sp-backup-v1" || !isObj(x) || !Array.isArray(x.users) || !x.users.some(isMain)) {
        return { ok: false, error: "Nederīgs rezerves kopijas fails." };
      }
      this.data = {
        ...defaults(),
        members: Array.isArray(x.members) ? x.members : [],
        attendance: isObj(x.attendance) ? x.attendance : {},
        users: x.users,
        logs: Array.isArray(x.logs) ? x.logs : [],
        publicSession: isObj(x.publicSession) ? x.publicSession : emptySession(),
        activeVote: x.activeVote || null,
        voteArchive: Array.isArray(x.voteArchive) ? x.voteArchive : [],
        codes: isObj(x.codes) ? x.codes : {},
      };
      this.log(user.username, "restore_backup", b.createdAt || "", ip);
      return { ok: true };
    }
    if (path === "/codes") {
      this.ensureCodes();
      return {
        ok: true,
        codes: d.members
          .map((m) => ({ id: m.id, name: m.name, code: d.codes[m.id] }))
          .sort((a, b) => a.name.localeCompare(b.name, "lv")),
      };
    }

    if (path === "/codes/reset") {
      this.ensureCodes();
      const targets = body.all ? d.members : d.members.filter((m) => m.id === body.id);
      if (!targets.length) return { ok: false, error: "Persona nav atrasta." };
      for (const m of targets) delete d.codes[m.id];
      this.ensureCodes();
      this.log(user.username, "reset_codes", body.all ? "visi" : targets[0].name, ip);
      return {
        ok: true,
        codes: d.members
          .map((m) => ({ id: m.id, name: m.name, code: d.codes[m.id] }))
          .sort((a, b) => a.name.localeCompare(b.name, "lv")),
      };
    }

    if (path === "/users/add") {
      const name = String(body.username || "").trim();
      const pass = String(body.password || "");
      if (!name || pass.length < 8) return { ok: false, error: "Lietotājvārds un parole (min. 8 simboli)." };
      if (body.isAdmin && !isMain(user)) return { ok: false, error: "Tikai galvenais admin var izveidot administratorus." };
      const h = await makeHash(pass); // hash first, then check + add with no waiting
      if (d.users.some((u) => String(u.username).toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: "Šāds lietotājvārds jau eksistē." };
      }
      d.users.push({ id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                     username: name, isAdmin: !!body.isAdmin, ...h });
      this.log(user.username, "add_user", name + (body.isAdmin ? " (admin)" : ""), ip);
      return { ok: true, users: d.users.map(pubUser) };
    }

    if (path === "/users/password") {
      const pass = String(body.password || "");
      if (pass.length < 8) return { ok: false, error: "Parolei jābūt vismaz 8 simboliem." };
      const h = await makeHash(pass);
      const t = d.users.find((u) => u.id === body.id);
      if (!t) return { ok: false, error: "Lietotājs nav atrasts." };
      if (t.isAdmin && !isMain(user) && t.id !== user.id) return { ok: false, error: "Nav tiesību." };
      Object.assign(t, h);
      delete t.password;
      await this.killSessions(t.id, null);
      this.log(user.username, "admin_set_password", t.username, ip);
      return { ok: true };
    }

    if (path === "/users/delete") {
      const t = d.users.find((u) => u.id === body.id);
      if (!t) return { ok: false, error: "Lietotājs nav atrasts." };
      if (isMain(t)) return { ok: false, error: "Galveno admin kontu nevar dzēst." };
      if (t.id === user.id) return { ok: false, error: "Nevar dzēst pašreizējo kontu." };
      if (t.isAdmin && !isMain(user)) return { ok: false, error: "Nav tiesību." };
      if (t.isAdmin && d.users.filter((u) => u.isAdmin).length <= 1) {
        return { ok: false, error: "Nevar dzēst pēdējo administratoru." };
      }
      d.users = d.users.filter((u) => u.id !== t.id);
      await this.killSessions(t.id, null);
      this.log(user.username, "remove_user", t.username, ip);
      return { ok: true, users: d.users.map(pubUser) };
    }

    return { ok: false, error: "Unknown action" };
  }
}