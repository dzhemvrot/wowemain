const SESSION_SECONDS = 12 * 60 * 60;
const AUTH_CODE_SECONDS = 90;
const MAX_BODY_BYTES = 1_000_000;
const encoder = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
});
const fail = (message, status = 400) => json({ ok: false, error: message }, status);
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const cleanName = (value, max = 160) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const uid = () => crypto.randomUUID();
const normalizeEmail = (value) => clean(value, 254).toLowerCase();
const isSchoolEmail = (email) => /^[^\s@]+@edu\.riga\.lv$/i.test(email);
const organizerEmails = (env) => new Set(String(env.NOMINATIONS_ADMIN_EMAILS || "").split(/[; ,\s]+/).map(normalizeEmail).filter(Boolean));
const byClass = (a, b) => String(a).localeCompare(String(b), "lv", { numeric: true });

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
function randomToken(size = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}
function parseCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.FRONTEND_ORIGIN || "https://wowe-main.eu";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin === allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origin === (env.FRONTEND_ORIGIN || "https://wowe-main.eu");
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error("Request body must be valid JSON."); }
}
function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return parseCookies(request).nominations_session || "";
}
async function getSession(request, db) {
  const token = bearerToken(request);
  if (!token || token.length > 200) return null;
  const row = await db.prepare(
    "SELECT email, role FROM nominations_sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(await sha256(token), Math.floor(Date.now() / 1000)).first();
  return row ? { email: row.email, role: row.role } : null;
}
function requireOrganizer(user) { return user?.role === "organizer"; }

function auditStmt(db, actorEmail, action, target = null, details = null) {
  return db.prepare("INSERT INTO audit_log (id, actor_email, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(uid(), actorEmail, action, target, details);
}
async function audit(db, user, action, target = null, details = null) {
  await auditStmt(db, user.email, action, target, details).run();
}

async function microsoftLogin(request, env) {
  if (!env.MS_CLIENT_ID || !env.MS_TENANT_ID || !env.MS_CLIENT_SECRET) return fail("Microsoft sign-in is not configured.", 503);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  await env.nominations_db.prepare(
    "INSERT INTO auth_states (state_hash, nonce, verifier, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256(state), nonce, verifier, Date.now() + 10 * 60 * 1000).run();
  const redirectUri = env.MS_REDIRECT_URI || `${new URL(request.url).origin}/nominations/auth/callback`;
  const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/authorize`);
  authorize.search = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return Response.redirect(authorize.toString(), 302);
}

const jwksCache = new Map();
async function microsoftSigningKey(tenant, kid) {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/discovery/v2.0/keys`;
  let cached = jwksCache.get(url);
  if (!cached || cached.expires < Date.now()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not retrieve Microsoft signing keys.");
    cached = { keys: await response.json(), expires: Date.now() + 60 * 60 * 1000 };
    jwksCache.set(url, cached);
  }
  let jwk = cached.keys.keys?.find((key) => key.kid === kid && key.use === "sig");
  if (!jwk) {
    jwksCache.delete(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not retrieve Microsoft signing keys.");
    cached = { keys: await response.json(), expires: Date.now() + 60 * 60 * 1000 };
    jwksCache.set(url, cached);
    jwk = cached.keys.keys?.find((key) => key.kid === kid && key.use === "sig");
  }
  if (!jwk) throw new Error("Unknown Microsoft signing key.");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}
async function verifyMicrosoftIdToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Microsoft identity token.");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1])));
  const tenant = env.MS_TENANT_ID;
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Microsoft token signature.");
  const key = await microsoftSigningKey(tenant, header.kid);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  if (!valid || claims.aud !== env.MS_CLIENT_ID || claims.iss !== issuer || claims.tid !== tenant || claims.exp <= now || claims.nbf > now) {
    throw new Error("Microsoft identity token validation failed.");
  }
  return claims;
}
async function microsoftCallback(request, env) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) return fail("Microsoft sign-in was cancelled or failed.", 401);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("Microsoft sign-in was not completed.", 400);
  const stateHash = await sha256(state);
  const authState = await env.nominations_db.prepare(
    "SELECT nonce, verifier FROM auth_states WHERE state_hash = ? AND expires_at > ?"
  ).bind(stateHash, Date.now()).first();
  if (!authState) return fail("Sign-in session expired. Please try again.", 400);
  await env.nominations_db.prepare("DELETE FROM auth_states WHERE state_hash = ?").bind(stateHash).run();

  const redirectUri = env.MS_REDIRECT_URI || `${url.origin}/nominations/auth/callback`;
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: authState.verifier,
      scope: "openid profile email",
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.id_token) return fail("Microsoft sign-in failed.", 401);
  const claims = await verifyMicrosoftIdToken(tokens.id_token, env);
  if (claims.nonce !== authState.nonce) return fail("Invalid sign-in nonce.", 401);
  const email = normalizeEmail(claims.preferred_username || claims.email || claims.upn);
  if (!isSchoolEmail(email)) return fail("Use your @edu.riga.lv school account.", 403);

  const role = organizerEmails(env).has(email) ? "organizer" : "student";
  const authCode = randomToken();
  await env.nominations_db.prepare("INSERT INTO nominations_auth_codes (code_hash, email, role, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(authCode), email, role, Math.floor(Date.now() / 1000) + AUTH_CODE_SECONDS).run();
  const frontend = new URL(env.FRONTEND_ORIGIN || "https://wowe-main.eu");
  frontend.pathname = `${frontend.pathname.replace(/\/$/, "")}/nominations/`;
  frontend.searchParams.set("auth_code", authCode);
  return Response.redirect(frontend.toString(), 302);
}
async function exchangeAuthCode(db, body) {
  const code = clean(body.code, 200);
  if (!code) return fail("Authentication code is required.");
  const hash = await sha256(code);
  const row = await db.prepare("SELECT email, role FROM nominations_auth_codes WHERE code_hash = ? AND expires_at > ?")
    .bind(hash, Math.floor(Date.now() / 1000)).first();
  if (!row) return fail("Sign-in code expired or was already used.", 401);
  await db.prepare("DELETE FROM nominations_auth_codes WHERE code_hash = ?").bind(hash).run();
  const token = randomToken();
  await db.prepare("INSERT INTO nominations_sessions (token_hash, email, role, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), row.email, row.role, Math.floor(Date.now() / 1000) + SESSION_SECONDS).run();
  return json({ ok: true, token, expiresIn: SESSION_SECONDS, user: { email: row.email, role: row.role } });
}

async function getVotingOpen(db) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = 'voting_open'").first();
  return row?.value === "true";
}
async function resultsView(db) {
  const result = await db.prepare(`SELECT n.id AS nominationId, n.title AS nominationTitle,
    nominee.class_name AS className, nominee.id AS nomineeId, nominee.name AS nominee,
    SUM(CASE be.rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END) AS points,
    SUM(CASE WHEN be.rank = 1 THEN 1 ELSE 0 END) AS first,
    SUM(CASE WHEN be.rank = 2 THEN 1 ELSE 0 END) AS second,
    SUM(CASE WHEN be.rank = 3 THEN 1 ELSE 0 END) AS third
    FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id
    JOIN students nominee ON nominee.id = be.nominee_student_id
    WHERE be.status = 'valid'
    GROUP BY n.id, nominee.id`).all();
  const rows = result.results.sort((a, b) =>
    byClass(a.className, b.className) || a.nominationTitle.localeCompare(b.nominationTitle, "lv") ||
    b.points - a.points || b.first - a.first || b.second - a.second || a.nominee.localeCompare(b.nominee, "lv"));
  let lastKey = "";
  let place = 0;
  for (const row of rows) {
    const key = `${row.className}\u0000${row.nominationId}`;
    if (key !== lastKey) { place = 0; lastKey = key; }
    row.place = ++place;
  }
  return rows;
}
async function dataView(db) {
  const [nominations, classes, entries, ballots, log, votingOpen, results] = await Promise.all([
    db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
    db.prepare(`SELECT s.class_name, COUNT(*) AS student_count,
      (SELECT COUNT(*) FROM ballots b JOIN students v ON v.id = b.voter_student_id WHERE v.class_name = s.class_name) AS voted_count
      FROM students s GROUP BY s.class_name`).all(),
    db.prepare(`SELECT be.id, be.nomination_id AS nominationId, n.title AS nominationTitle,
      nominee.name AS nominee, nominee.id AS nomineeId, nominee.class_name AS className,
      voter.name AS voter, b.voter_email AS voterEmail, be.rank, be.explanation AS reason, be.status
      FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id
      JOIN students nominee ON nominee.id = be.nominee_student_id
      JOIN ballots b ON b.id = be.ballot_id JOIN students voter ON voter.id = b.voter_student_id
      ORDER BY nominee.class_name, n.title, b.submitted_at DESC, be.rank`).all(),
    db.prepare(`SELECT b.id, b.submitted_at AS submittedAt, b.voter_email AS voterEmail,
      v.name AS voter, v.class_name AS className,
      (SELECT COUNT(*) FROM ballot_entries e WHERE e.ballot_id = b.id) AS entryCount
      FROM ballots b JOIN students v ON v.id = b.voter_student_id ORDER BY b.submitted_at DESC`).all(),
    db.prepare("SELECT created_at AS ts, actor_email AS actor, action, details FROM audit_log ORDER BY created_at DESC LIMIT 1000").all(),
    getVotingOpen(db), resultsView(db),
  ]);
  const classRows = classes.results.sort((a, b) => byClass(a.class_name, b.class_name));
  entries.results.sort((a, b) => byClass(a.className, b.className));
  return json({ ok: true, nominations: nominations.results, classes: classRows,
    submissions: entries.results, ballots: ballots.results, log: log.results, votingOpen, results });
}

async function importRoster(db, body, user) {
  if (!Array.isArray(body.students) || body.students.length === 0 || body.students.length > 10000) return fail("Provide between 1 and 10,000 roster rows.");
  const errors = [];
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < body.students.length; i++) {
    const name = cleanName(body.students[i]?.name);
    const className = cleanName(body.students[i]?.className, 24);
    if (!name || !className) { errors.push({ row: i + 1, error: "Name and class are required." }); continue; }
    const key = `${className.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) { errors.push({ row: i + 1, error: "Duplicate in this import; first row kept." }); continue; }
    seen.add(key);
    rows.push({ name, className });
  }
  if (!rows.length) return json({ ok: true, imported: 0, existing: 0, errors: errors.slice(0, 100) });
  const stmts = rows.map((r) => db.prepare("INSERT INTO students (id, name, class_name) VALUES (?, ?, ?) ON CONFLICT(class_name, name) DO NOTHING")
    .bind(uid(), r.name, r.className));
  let added = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    const results = await db.batch(stmts.slice(i, i + 100));
    for (const r of results) added += r.meta?.changes || 0;
  }
  await audit(db, user, "roster_import", null, `${added} jauni, ${rows.length - added} jau bija`);
  return json({ ok: true, imported: added, existing: rows.length - added, errors: errors.slice(0, 100) });
}
async function deleteClass(db, user, body) {
  const className = cleanName(body.className, 24);
  if (!className) return fail("Class is required.");
  const result = await db.prepare("DELETE FROM students WHERE class_name = ?").bind(className).run();
  if (!result.meta.changes) return fail("Class not found.", 404);
  await audit(db, user, "class_delete", null, `${className} (${result.meta.changes} skolēni; saistītie balsojumi dzēsti)`);
  return json({ ok: true, deleted: result.meta.changes });
}
async function deleteBallot(db, user, body) {
  const id = clean(body.id, 80);
  const ballot = await db.prepare(`SELECT b.voter_email, v.name, v.class_name FROM ballots b
    JOIN students v ON v.id = b.voter_student_id WHERE b.id = ?`).bind(id).first();
  if (!ballot) return fail("Ballot not found.", 404);
  await db.batch([
    db.prepare("DELETE FROM ballots WHERE id = ?").bind(id),
    auditStmt(db, user.email, "ballot_delete", id, `${ballot.class_name} · ${ballot.name} · ${ballot.voter_email}`),
  ]);
  return json({ ok: true });
}
async function moderateEntry(db, user, body) {
  const id = clean(body.id, 80);
  const status = body.status;
  if (!id || !["valid", "rejected", "pending"].includes(status)) return fail("Invalid moderation update.");
  const result = await db.prepare("UPDATE ballot_entries SET status = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .bind(status, user.email, id).run();
  if (!result.meta.changes) return fail("Submission not found.", 404);
  await audit(db, user, "moderate_entry", id, status);
  return json({ ok: true });
}

async function studentData(db, user) {
  const [nominations, classes, ballot, votingOpen] = await Promise.all([
    db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
    db.prepare("SELECT DISTINCT class_name FROM students").all(),
    db.prepare("SELECT id FROM ballots WHERE voter_email = ?").bind(user.email).first(),
    getVotingOpen(db),
  ]);
  return json({
    ok: true, email: user.email, nominations: nominations.results,
    classes: classes.results.map((c) => c.class_name).sort(byClass),
    submitted: !!ballot, votingOpen,
  });
}
async function classList(db, className) {
  const rows = await db.prepare("SELECT id, name FROM students WHERE class_name = ?").bind(cleanName(className, 24)).all();
  return json({ ok: true, students: rows.results.sort((a, b) => a.name.localeCompare(b.name, "lv")) });
}

async function submitBallot(db, user, body) {
  if (!(await getVotingOpen(db))) return fail("Balsošana pašlaik ir slēgta.", 403);

  const candidateStudent = body.studentId ? await db.prepare("SELECT id, name, class_name FROM students WHERE id = ?").bind(clean(body.studentId, 80)).first() : null;
  const chosenName = cleanName(body.studentName, 160);
  const chosenClass = cleanName(body.className, 24);
  let voter = candidateStudent;

  if (!voter && chosenName && chosenClass) {
    voter = await db.prepare("SELECT id, name, class_name FROM students WHERE name = ? AND class_name = ?").bind(chosenName, chosenClass).first();
  }

  if (!voter && chosenName && chosenClass) {
    const id = uid();
    await db.prepare("INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)").bind(id, chosenName, chosenClass).run();
    voter = { id, name: chosenName, class_name: chosenClass };
  }

  if (!voter) return fail("Izvēlies savu klasi un vārdu sarakstā.");

  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 300) return fail("Balsojums ir tukšs.");

  const existing = await db.prepare("SELECT id FROM ballots WHERE voter_email = ? OR voter_student_id = ?").bind(user.email, voter.id).first();
  if (existing) return fail("No šī konta vai šim vārdam balsojums jau ir iesniegts.", 409);

  const [nominations, classmates] = await Promise.all([
    db.prepare("SELECT id, title FROM nominations ORDER BY created_at").all(),
    db.prepare("SELECT id, name FROM students WHERE class_name = ?").bind(voter.class_name).all(),
  ]);
  const titles = new Map(nominations.results.map((n) => [n.id, n.title]));
  if (!titles.size) return fail("Nav nomināciju, par kurām balsot.", 403);
  const names = new Map(classmates.results.map((s) => [s.id, s.name]));

  const groups = new Map();
  for (const entry of body.entries) {
    const nominationId = clean(entry?.nominationId, 80);
    const nomineeId = clean(entry?.nomineeId, 80);
    const explanation = clean(entry?.explanation, 1200);
    const rank = Number(entry?.rank);
    if (!titles.has(nominationId) || !names.has(nomineeId) || nomineeId === voter.id || ![1, 2, 3].includes(rank) || !explanation) {
      return fail("Kāds balsojuma ieraksts nav derīgs: izvēlies klasesbiedrus (ne sevi) un uzraksti pamatojumu katram.");
    }
    if (!groups.has(nominationId)) groups.set(nominationId, []);
    groups.get(nominationId).push({ nominationId, nomineeId, explanation, rank });
  }

  if (groups.size !== titles.size) return fail("Izvēlies vismaz vienu cilvēku katrā nominācijā.");
  for (const entries of groups.values()) {
    const ranks = entries.map((x) => x.rank).sort((a, b) => a - b);
    const contiguous = ranks.every((r, i) => r === i + 1);
    if (entries.length > 3 || !contiguous || new Set(entries.map((x) => x.nomineeId)).size !== entries.length) {
      return fail("Katrā nominācijā izvēlies līdz 3 dažādiem cilvēkiem pēc kārtas (1., 2., 3. izvēle).");
    }
  }

  const ballotId = uid();
  const batch = [db.prepare("INSERT INTO ballots (id, voter_email, voter_student_id) VALUES (?, ?, ?)").bind(ballotId, user.email, voter.id)];
  for (const entries of groups.values()) for (const e of entries.sort((a, b) => a.rank - b.rank)) {
    batch.push(db.prepare(`INSERT INTO ballot_entries (id, ballot_id, nomination_id, nominee_student_id, rank, explanation)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(uid(), ballotId, e.nominationId, e.nomineeId, e.rank, e.explanation));
    batch.push(auditStmt(db, user.email, "vote_entry", ballotId,
      `${voter.class_name} · ${voter.name} → ${names.get(e.nomineeId)} · ${titles.get(e.nominationId)} · ${e.rank}. izvēle`));
  }
  batch.push(auditStmt(db, user.email, "ballot_submit", ballotId, `${voter.class_name} · ${voter.name}`));
  try { await db.batch(batch); }
  catch (error) {
    if (String(error.message).includes("UNIQUE")) return fail("No šī konta vai šim vārdam balsojums jau ir iesniegts.", 409);
    throw error;
  }
  return json({ ok: true, submitted: true });
}

async function nominationsRequest(request, env) {
  if (!env.nominations_db) return fail("Nominations D1 database binding is missing.", 503);
  if (!allowedOrigin(request, env)) return fail("Origin not allowed.", 403);
  const db = env.nominations_db;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/nominations/, "").replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "GET" && path === "/auth/login") return microsoftLogin(request, env);
  if (request.method === "GET" && path === "/auth/callback") return microsoftCallback(request, env);

  let body = {};
  if (request.method === "POST") body = await readJson(request);
  if (request.method === "POST" && path === "/auth/exchange") return exchangeAuthCode(db, body);
  if (request.method === "POST" && path === "/auth/logout") {
    const token = bearerToken(request) || clean(body.token, 200);
    if (token) await db.prepare("DELETE FROM nominations_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true });
  }

  const user = await getSession(request, db);
  if (request.method === "GET" && path === "/auth/me") {
    return json({ ok: true, user: user ? { email: user.email, role: user.role } : null });
  }
  if (!user) return fail("Lūdzu, pieraksties ar skolas kontu.", 401);

  if (request.method === "GET" && path === "/student/data") return studentData(db, user);
  if (request.method === "GET" && path === "/student/class") return classList(db, url.searchParams.get("name"));
  if (request.method === "POST" && path === "/ballot/submit") return submitBallot(db, user, body);

  if (!requireOrganizer(user)) return fail("Organizer access required.", 403);
  if (request.method === "GET" && (path === "/data")) return dataView(db);
  if (request.method === "GET") return fail("Not found.", 404);
  if (request.method !== "POST") return fail("Method not allowed.", 405);

  if (path === "/data/refresh") return dataView(db);
  if (path === "/rosters/import") return importRoster(db, body, user);
  if (path === "/rosters/delete-class") return deleteClass(db, user, body);
  if (path === "/ballots/delete") return deleteBallot(db, user, body);
  if (path === "/entries/moderate") return moderateEntry(db, user, body);
  if (path === "/nominations/add") {
    const title = clean(body.title, 160);
    const description = clean(body.description, 1000);
    if (!title) return fail("Nomination title is required.");
    const id = uid();
    await db.prepare("INSERT INTO nominations (id, title, description) VALUES (?, ?, ?)").bind(id, title, description).run();
    await audit(db, user, "add_nomination", id, title);
    return json({ ok: true, id });
  }
  if (path === "/nominations/delete") {
    const id = clean(body.id, 80);
    const nomination = await db.prepare("SELECT title FROM nominations WHERE id = ?").bind(id).first();
    const result = await db.prepare("DELETE FROM nominations WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return fail("Nomination not found.", 404);
    await audit(db, user, "delete_nomination", id, nomination?.title || null);
    return json({ ok: true });
  }
  if (path === "/voting/open" || path === "/voting/close") {
    const open = path.endsWith("open");
    if (open) {
      const count = await db.prepare("SELECT COUNT(*) AS count FROM nominations").first();
      const rosterCount = await db.prepare("SELECT COUNT(*) AS count FROM students").first();
      if (!count?.count || !rosterCount?.count) return fail("Add nominations and class lists before opening voting.");
    }
    await db.prepare("INSERT INTO app_settings (key, value) VALUES ('voting_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(open ? "true" : "false").run();
    await audit(db, user, open ? "open_voting" : "close_voting");
    return json({ ok: true, open });
  }
  return fail("Not found.", 404);
}

export async function handleNominations(request, env) {
  try {
    return withCors(await nominationsRequest(request, env), request, env);
  } catch (error) {
    console.error("Nominations API error", error);
    return withCors(fail("Internal server error.", 500), request, env);
  }
}
