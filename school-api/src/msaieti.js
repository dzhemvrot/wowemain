const MAX_LOGS = 2000;
const SESSION_MS = 12 * 60 * 60 * 1000;

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

const emptyCarousel = () => ({ startTime: "11:45", endTime: "13:25", transitionMin: 2, stations: [] });
const defaultSettings = () => ({ phase: "numbers", numberScheme: "prefix" });
const defaults = () => ({
  users: [], people: [], teams: [], logs: [],
  settings: defaultSettings(), carousel: emptyCarousel(), codes: {}, rev: 0,
});

// fallback so you can never be locked out (same as the old public data.js; change the password after login)
const SEED_ADMIN = {
  id: "u_admin", username: "admin", salt: "msaieti-seed-admin-v1",
  passwordHash: "6bf9d37e6b8a0675cf5127b74cc40620747f034631e72df112cbd370a0e3cd1c",
  isAdmin: true, name: "Administrators", role: "organizer",
};

const pubUser = (u) => ({
  id: u.id, username: u.username, name: u.name || "",
  role: u.role || "organizer", isAdmin: !!u.isAdmin,
});
const isMain = (u) => String(u.username).toLowerCase() === "admin";

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
  if (user.passwordHash && user.salt) return same(await sha256(user.salt + password), user.passwordHash);
  if (user.password) return user.password === password;
  return false;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_ALPHABET[x % 32]).join("");
}

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const IP_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

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

export class Msaieti {
  constructor(state, env) {
    this.state = state;
    this.data = defaults();
    this.saved = null;
    this.fails = new Map();
    this.codeFails = new Map();
    state.blockConcurrencyWhile(async () => {
      let raw = await state.storage.get("data");
      if (!raw) {
        raw = await env.DB.get("data:msaieti"); // first start: copy from the old KV store
        if (raw) await state.storage.put("data", raw);
      }
      if (raw) {
        this.data = { ...defaults(), ...JSON.parse(raw) };
        this.saved = raw;
      }
      if (!this.data.users.length) this.data.users.push({ ...SEED_ADMIN });
    });
  }

  ensureCodes() {
    const d = this.data;
    if (!d.codes) d.codes = {};
    const ids = new Set(d.teams.map((t) => t.id));
    for (const id of Object.keys(d.codes)) if (!ids.has(id)) delete d.codes[id];
    const used = new Set(Object.values(d.codes));
    for (const t of d.teams) {
      if (!d.codes[t.id]) {
        let c;
        do { c = newCode(); } while (used.has(c));
        used.add(c);
        d.codes[t.id] = c;
      }
    }
  }

  async persist() {
    this.ensureCodes();
    const d = this.data;
    d.logs = d.logs.slice(-MAX_LOGS);
    scrubOldIps(d.logs, "detail");
    const s = JSON.stringify({
      users: d.users, people: d.people, teams: d.teams, logs: d.logs,
      settings: d.settings, carousel: d.carousel, codes: d.codes, rev: d.rev,
    });
    if (s !== this.saved) {
      await this.state.storage.put("data", s);
      this.saved = s;
    }
  }

  backupData() {
    const d = this.data;
    return {
      format: "msaieti-backup-v1",
      createdAt: new Date().toISOString(),
      data: {
        users: d.users, people: d.people, teams: d.teams, logs: d.logs,
        settings: d.settings, carousel: d.carousel, codes: d.codes, rev: d.rev,
      },
    };
  }

  log(username, action, detail, ip) {
    this.data.logs.push({
      ts: new Date().toISOString(), username, action, detail: detail || "", ip: ip || null,
    });
  }

  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const path = new URL(request.url).pathname.replace(/^\/msaieti/, "").replace(/\/+$/, "") || "/";
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      if (request.method === "GET") {
        if (path === "/__cron") return json(this.backupData());
        if (path === "/captain") return json(this.captainTeams());
        return json({ ok: false, error: "not found" }, 404);
      }
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);

      const text = await request.text();
      const body = text ? JSON.parse(text) : {};
      let res;
      if (path === "/login") res = await this.login(body, ip);
      else if (path === "/captain/open") res = this.captainOpen(body, ip);
      else if (path === "/captain/toggle") res = this.captainToggle(body, ip);
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

    if (user.algo !== "pbkdf2") {
      Object.assign(user, await makeHash(password));
      delete user.password;
    }

    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await this.state.storage.put("s:" + token, { userId: user.id, exp: now + SESSION_MS });
    const all = await this.state.storage.list({ prefix: "s:" });
    for (const [k, v] of all) if (v.exp < now) await this.state.storage.delete(k);

    this.log(user.username, "login", "", ip);
    return { ok: true, token, user: pubUser(user) };
  }

  // ---------- captain (public, protected by team code) ----------
  captainTeams() {
    const d = this.data;
    if (d.settings.phase !== "names") return { ok: true, phase: "numbers", teams: [] };
    const teams = [...d.teams]
      .sort((a, b) => (a.number || 0) - (b.number || 0))
      .map((t) => ({
        id: t.id, number: t.number, name: t.name || "",
        captains: (t.captainIds || [])
          .map((id) => d.people.find((p) => p.id === id))
          .filter(Boolean)
          .map((c) => c.name),
      }));
    return { ok: true, phase: "names", teams };
  }

  checkCode(teamId, code, ip) {
    const now = Date.now();
    const km = "t:" + teamId, ki = "i:" + ip;
    const fm = this.codeFails.get(km) || { n: 0, until: 0 };
    const fi = this.codeFails.get(ki) || { n: 0, until: 0 };
    if (fm.until > now || fi.until > now) return "Pārāk daudz nepareizu kodu. Mēģini pēc 10 minūtēm.";
    const real = (this.data.codes || {})[teamId];
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

  captainCheck(body, ip) {
    const d = this.data;
    if (d.settings.phase !== "names") return { error: "2. posms vēl nav atvērts." };
    const team = d.teams.find((t) => t.id === body.teamId);
    if (!team) return { error: "Komanda nav atrasta." };
    const err = this.checkCode(team.id, body.code, ip);
    if (err) return { error: err };
    return { team };
  }

  kidsView() {
    return this.data.people
      .filter((p) => p.type === "participant")
      .map((p) => ({
        id: p.id, name: p.name, grade: p.grade, letter: p.letter,
        teamId: p.teamId || null, isDestructor: !!p.isDestructor,
      }));
  }

  captainOpen(body, ip) {
    const c = this.captainCheck(body, ip);
    if (c.error) return { ok: false, error: c.error };
    return { ok: true, kids: this.kidsView() };
  }

  captainToggle(body, ip) {
    const d = this.data;
    const c = this.captainCheck(body, ip);
    if (c.error) return { ok: false, error: c.error };
    const team = c.team;
    const p = d.people.find((x) => x.id === body.personId);
    if (!p || p.type !== "participant") return { ok: false, error: "Bērns nav atrasts." };

    if (body.checked) {
      if (p.teamId && p.teamId !== team.id) {
        const prev = d.teams.find((t) => t.id === p.teamId);
        if (prev) prev.participantIds = (prev.participantIds || []).filter((id) => id !== p.id);
      }
      p.teamId = team.id;
      if (!team.participantIds) team.participantIds = [];
      if (!team.participantIds.includes(p.id)) team.participantIds.push(p.id);
    } else if (p.teamId === team.id) {
      p.teamId = null;
      team.participantIds = (team.participantIds || []).filter((id) => id !== p.id);
    } else {
      return { ok: true, kids: this.kidsView() };
    }
    d.rev++;
    this.log("kapitāns", "captain_assign",
      p.name + " · " + (body.checked ? "+" : "−") + " · komanda " + team.number, ip);
    return { ok: true, kids: this.kidsView() };
  }

  // ---------- organizer endpoints ----------
  fullView(user) {
    const d = this.data;
    const admin = !!user.isAdmin;
    return {
      ok: true,
      rev: d.rev,
      users: d.users.map(pubUser),
      people: d.people,
      teams: d.teams,
      settings: d.settings,
      carousel: d.carousel,
      // IPs are appended ONLY for admins; everyone else gets no logs
      logs: admin
        ? d.logs.map((l) => ({
            ts: l.ts, username: l.username, action: l.action,
            detail: (l.detail || "") + (l.ip ? " · IP: " + l.ip : ""),
          }))
        : [],
    };
  }

  codesView() {
    const d = this.data;
    return [...d.teams]
      .sort((a, b) => (a.number || 0) - (b.number || 0))
      .map((t) => ({ id: t.id, number: t.number, code: d.codes[t.id] }));
  }

  async authed(path, user, body, ip) {
    const d = this.data;

    if (path === "/data") return this.fullView(user);

    if (path === "/save") {
      if (body.baseRev !== d.rev) {
        return { ok: false, conflict: true, error: "Dati ir mainīti citur." };
      }
      if (Array.isArray(body.people)) d.people = body.people.filter((p) => isObj(p) && p.id);
      if (Array.isArray(body.teams)) d.teams = body.teams.filter((t) => isObj(t) && t.id);
      if (isObj(body.settings)) {
        d.settings = {
          phase: body.settings.phase === "names" ? "names" : "numbers",
          numberScheme: body.settings.numberScheme === "legacy" ? "legacy" : "prefix",
        };
      }
      if (isObj(body.carousel)) {
        const c = body.carousel;
        d.carousel = {
          startTime: c.startTime || "11:45",
          endTime: c.endTime || "13:25",
          transitionMin: typeof c.transitionMin === "number" ? c.transitionMin : parseInt(c.transitionMin, 10) || 2,
          stations: Array.isArray(c.stations) ? c.stations : [],
        };
      }
      if (Array.isArray(body.newLogs)) {
        for (const l of body.newLogs.slice(0, 200)) {
          d.logs.push({
            ts: typeof l.ts === "string" ? l.ts : new Date().toISOString(),
            username: user.username, // always the real logged-in user
            action: String(l.action || "").slice(0, 60),
            detail: String(l.detail || "").slice(0, 500),
            ip,
          });
        }
      }
      d.rev++;
      return { ok: true, rev: d.rev };
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
        return { ok: false, error: "Pašreizējā parole ir nepareiza." };
      }
      Object.assign(user, await makeHash(neu));
      delete user.password;
      await this.killSessions(user.id, body.token);
      this.log(user.username, "change_password", "", ip);
      return { ok: true };
    }

    if (path === "/codes") return { ok: true, codes: this.codesView() };

    if (path === "/codes/reset") {
      const targets = body.all ? d.teams : d.teams.filter((t) => t.id === body.id);
      if (!targets.length) return { ok: false, error: "Komanda nav atrasta." };
      for (const t of targets) delete d.codes[t.id];
      this.ensureCodes();
      this.log(user.username, "reset_codes", body.all ? "visas komandas" : "komanda " + targets[0].number, ip);
      return { ok: true, codes: this.codesView() };
    }

    // everything below is admin only
    if (!user.isAdmin) return { ok: false, error: "Tikai administrators." };
    if (path === "/backup") return { ok: true, backup: this.backupData() };

    if (path === "/restore") {
      if (!isMain(user)) return { ok: false, error: "Tikai galvenais admin var atjaunot datus." };
      const b = body.backup;
      const x = b && b.data;
      if (!b || b.format !== "msaieti-backup-v1" || !isObj(x) || !Array.isArray(x.users) || !x.users.some(isMain)) {
        return { ok: false, error: "Nederīgs rezerves kopijas fails." };
      }
      this.data = {
        ...defaults(),
        users: x.users,
        people: Array.isArray(x.people) ? x.people : [],
        teams: Array.isArray(x.teams) ? x.teams : [],
        logs: Array.isArray(x.logs) ? x.logs : [],
        settings: isObj(x.settings) ? x.settings : defaultSettings(),
        carousel: isObj(x.carousel) ? x.carousel : emptyCarousel(),
        codes: isObj(x.codes) ? x.codes : {},
        rev: (d.rev || 0) + 1, // makes every open page refresh
      };
      this.log(user.username, "restore_backup", b.createdAt || "", ip);
      return { ok: true };
    }

    if (path === "/users/add") {
      const name = String(body.username || "").trim();
      const pass = String(body.password || "");
      if (!name || pass.length < 8) return { ok: false, error: "Lietotājvārds un parole (min. 8 simboli)." };
      if (body.isAdmin && !isMain(user)) return { ok: false, error: "Tikai galvenais admin var izveidot administratorus." };
      const h = await makeHash(pass);
      if (d.users.some((u) => String(u.username).toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: "Šāds lietotājvārds jau eksistē." };
      }
      d.users.push({
        id: "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
        username: name, name: String(body.name || "").trim(),
        role: body.role === "helper" ? "helper" : "organizer",
        isAdmin: !!body.isAdmin, ...h,
      });
      this.log(user.username, "add_user", name, ip);
      return { ok: true, users: d.users.map(pubUser) };
    }

    if (path === "/users/edit") {
      const t = d.users.find((u) => u.id === body.id);
      if (!t) return { ok: false, error: "Lietotājs nav atrasts." };
      if (t.isAdmin && !isMain(user) && t.id !== user.id) return { ok: false, error: "Nav tiesību." };
      let isAdmin = !!body.isAdmin;
      if (isMain(t)) isAdmin = true;
      else if (!isMain(user)) isAdmin = !!t.isAdmin;
      let uname = t.username;
      if (!isMain(t)) {
        uname = String(body.username || "").trim();
        if (!uname) return { ok: false, error: "Ievadiet lietotājvārdu." };
        if (d.users.some((u) => u.id !== t.id && String(u.username).toLowerCase() === uname.toLowerCase())) {
          return { ok: false, error: "Šāds lietotājvārds jau eksistē." };
        }
      }
      t.username = uname;
      t.name = String(body.name || "").trim();
      t.role = body.role === "helper" ? "helper" : "organizer";
      t.isAdmin = isAdmin;
      this.log(user.username, "edit_user", uname, ip);
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
      d.users = d.users.filter((u) => u.id !== t.id);
      for (const team of d.teams) if (team.mentorId === t.id) team.mentorId = null;
      await this.killSessions(t.id, null);
      this.log(user.username, "remove_user", t.username, ip);
      return { ok: true, users: d.users.map(pubUser) };
    }

    return { ok: false, error: "Unknown action" };
  }
}