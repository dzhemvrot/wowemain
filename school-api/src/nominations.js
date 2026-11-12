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
const uid = () => crypto.randomUUID();
const normalizeEmail = (value) => clean(value, 254).toLowerCase();
const isSchoolEmail = (email) => /^[^\s@]+@edu\.riga\.lv$/i.test(email);
const organizerEmails = (env) => new Set(String(env.NOMINATIONS_ADMIN_EMAILS || "").split(/[;,\s]+/).map(normalizeEmail).filter(Boolean));

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
async function audit(db, user, action, target = null) {
  await db.prepare("INSERT INTO audit_log (id, actor_email, action, target_id) VALUES (?, ?, ?, ?)")
    .bind(uid(), user.email, action, target).run();
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

  const student = await env.nominations_db.prepare("SELECT email FROM students WHERE email = ? AND active = 1").bind(email).first();
  const role = organizerEmails(env).has(email) ? "organizer" : student ? "student" : null;
  if (!role) return fail("This school account is not on the active student roster or organizer allowlist.", 403);

  // A short-lived, single-use code is exchanged by the frontend for a bearer session.
  // This avoids relying on third-party cookies between the website and workers.dev.
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
    nominee.class_name AS className, nominee.email AS nomineeEmail, nominee.name AS nominee,
    SUM(CASE be.rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END) AS points,
    SUM(CASE WHEN be.rank = 1 THEN 1 ELSE 0 END) AS first,
    SUM(CASE WHEN be.rank = 2 THEN 1 ELSE 0 END) AS second,
    SUM(CASE WHEN be.rank = 3 THEN 1 ELSE 0 END) AS third
    FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id
    JOIN students nominee ON nominee.email = be.nominee_email
    WHERE be.status = 'valid'
    GROUP BY n.id, nominee.class_name, nominee.email, nominee.name`).all();
  const rows = result.results.sort((a, b) =>
    a.className.localeCompare(b.className, "lv") || a.nominationTitle.localeCompare(b.nominationTitle, "lv") ||
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
  const [nominations, classes, entries, votingOpen, results] = await Promise.all([
    db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
    db.prepare("SELECT class_name, COUNT(*) AS student_count FROM students WHERE active = 1 GROUP BY class_name ORDER BY class_name").all(),
    db.prepare(`SELECT be.id, be.nomination_id AS nominationId, n.title AS nominationTitle,
      nominee.name AS nominee, nominee.email AS nomineeEmail, nominee.class_name AS className,
      voter.name AS voter, voter.email AS voterEmail, be.rank, be.explanation AS reason, be.status
      FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id
      JOIN students nominee ON nominee.email = be.nominee_email
      JOIN ballots b ON b.id = be.ballot_id JOIN students voter ON voter.email = b.voter_email
      ORDER BY nominee.class_name, n.title, b.submitted_at DESC`).all(),
    getVotingOpen(db), resultsView(db),
  ]);
  return json({ ok: true, nominations: nominations.results, classes: classes.results,
    submissions: entries.results, votingOpen, results });
}
async function importRoster(db, body, user) {
  if (!Array.isArray(body.students) || body.students.length === 0 || body.students.length > 10000) return fail("Provide between 1 and 10,000 roster rows.");
  const batch = [];
  const errors = [];
  const seen = new Set();
  for (let i = 0; i < body.students.length; i++) {
    const row = body.students[i];
    const email = normalizeEmail(row?.email);
    const name = clean(row?.name, 160);
    const className = clean(row?.className, 24);
    if (!isSchoolEmail(email) || !name || !className) {
      errors.push({ row: i + 1, error: "A valid @edu.riga.lv email, student name, and class are required." });
      continue;
    }
    if (seen.has(email)) {
      errors.push({ row: i + 1, error: "Duplicate email in this import; first row kept." });
      continue;
    }
    seen.add(email);
    batch.push(db.prepare(`INSERT INTO students (email, name, class_name, active) VALUES (?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, active = 1`)
      .bind(email, name, className));
  }
  if (!batch.length) return json({ ok: true, imported: 0, errors: errors.slice(0, 100) });
  await db.batch(batch);
  await audit(db, user, "roster_import", String(batch.length));
  return json({ ok: true, imported: batch.length, errors: errors.slice(0, 100) });
}
async function submitBallot(db, user, body) {
  if (user.role !== "student") return fail("Only student accounts can submit a ballot.", 403);
  if (!(await getVotingOpen(db))) return fail("Voting is closed.", 403);
  const student = await db.prepare("SELECT email, name, class_name FROM students WHERE email = ? AND active = 1").bind(user.email).first();
  if (!student) return fail("Student is not on an active roster.", 403);
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 300) return fail("Ballot entries are required.");
  const nominations = await db.prepare("SELECT id FROM nominations ORDER BY created_at").all();
  const nominationIds = new Set(nominations.results.map((n) => n.id));
  if (!nominationIds.size) return fail("There are no nominations open for voting.", 403);
  const groups = new Map();
  for (const entry of body.entries) {
    const nominationId = clean(entry?.nominationId, 80);
    const nomineeEmail = normalizeEmail(entry?.nomineeEmail);
    const explanation = clean(entry?.explanation, 1200);
    const rank = Number(entry?.rank);
    if (!nominationIds.has(nominationId) || !isSchoolEmail(nomineeEmail) || ![1, 2, 3].includes(rank) || explanation.length < 1) return fail("One or more ballot entries are invalid.");
    if (!groups.has(nominationId)) groups.set(nominationId, []);
    groups.get(nominationId).push({ nominationId, nomineeEmail, explanation, rank });
  }
  // A ballot is complete only if the voter submits one to three choices for every nomination.
  if (groups.size !== nominationIds.size || [...nominationIds].some((id) => !groups.has(id))) return fail("Choose at least one nominee for every nomination before submitting.");
  for (const entries of groups.values()) {
    if (entries.length > 3 || new Set(entries.map((x) => x.rank)).size !== entries.length || new Set(entries.map((x) => x.nomineeEmail)).size !== entries.length) return fail("Each nomination allows up to three distinct, ranked students.");
  }
  for (const entries of groups.values()) {
    for (const entry of entries) {
      const nominee = await db.prepare("SELECT email FROM students WHERE email = ? AND class_name = ? AND active = 1")
        .bind(entry.nomineeEmail, student.class_name).first();
      if (!nominee || nominee.email.toLowerCase() === student.email.toLowerCase()) return fail("Nominees must be other students in your own class.");
    }
  }
  const ballotId = uid();
  const batch = [db.prepare("INSERT INTO ballots (id, voter_email) VALUES (?, ?)").bind(ballotId, student.email)];
  for (const entries of groups.values()) for (const entry of entries) {
    batch.push(db.prepare(`INSERT INTO ballot_entries (id, ballot_id, nomination_id, nominee_email, rank, explanation)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(uid(), ballotId, entry.nominationId, entry.nomineeEmail, entry.rank, entry.explanation));
  }
  try { await db.batch(batch); }
  catch (error) {
    if (String(error.message).includes("UNIQUE")) return fail("A ballot has already been submitted for this account.", 409);
    throw error;
  }
  return json({ ok: true, submitted: true });
}
async function moderateEntry(db, user, body) {
  const id = clean(body.id, 80);
  const status = body.status;
  if (!id || !["valid", "rejected", "pending"].includes(status)) return fail("Invalid moderation update.");
  const result = await db.prepare("UPDATE ballot_entries SET status = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .bind(status, user.email, id).run();
  if (!result.meta.changes) return fail("Submission not found.", 404);
  await audit(db, user, "moderate_entry", `${id}:${status}`);
  return json({ ok: true });
}

async function nominationsRequest(request, env) {
  if (!env.nominations_db) return fail("Nominations D1 database binding is missing.", 503);
  if (!allowedOrigin(request, env)) return fail("Origin not allowed.", 403);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/nominations/, "").replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "GET" && path === "/auth/login") return microsoftLogin(request, env);
  if (request.method === "GET" && path === "/auth/callback") return microsoftCallback(request, env);

  let body = {};
  if (request.method === "POST") body = await readJson(request);
  if (request.method === "POST" && path === "/auth/exchange") return exchangeAuthCode(env.nominations_db, body);
  if (request.method === "POST" && path === "/auth/logout") {
    const token = bearerToken(request) || clean(body.token, 200);
    if (token) await env.nominations_db.prepare("DELETE FROM nominations_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true });
  }

  const user = await getSession(request, env.nominations_db);
  if (request.method === "GET" && path === "/auth/me") {
    if (!user) return json({ ok: true, user: null });
    const student = await env.nominations_db.prepare("SELECT name, class_name AS className FROM students WHERE email = ? AND active = 1").bind(user.email).first();
    return json({ ok: true, user: { email: user.email, role: user.role, ...(student || {}) } });
  }
  if (!user) return fail("Please sign in with your school account.", 401);

  if (request.method === "GET" && path === "/data") {
    if (!requireOrganizer(user)) return fail("Organizer access required.", 403);
    return dataView(env.nominations_db);
  }
  if (request.method === "GET" && path === "/student/data") {
    if (user.role !== "student") return fail("Student access required.", 403);
    const student = await env.nominations_db.prepare("SELECT name, class_name AS className FROM students WHERE email = ? AND active = 1").bind(user.email).first();
    if (!student) return fail("Student is not on an active roster.", 403);
    const [nominations, classmates, ballot, votingOpen] = await Promise.all([
      env.nominations_db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
      env.nominations_db.prepare("SELECT email, name FROM students WHERE class_name = ? AND active = 1 AND email != ? ORDER BY name").bind(student.className, user.email).all(),
      env.nominations_db.prepare("SELECT id FROM ballots WHERE voter_email = ?").bind(user.email).first(),
      getVotingOpen(env.nominations_db),
    ]);
    return json({ ok: true, student, nominations: nominations.results, classmates: classmates.results, submitted: !!ballot, votingOpen });
  }
  if (request.method === "GET") return fail("Not found.", 404);
  if (request.method !== "POST") return fail("Method not allowed.", 405);
  if (path === "/ballot/submit") return submitBallot(env.nominations_db, user, body);
  if (!requireOrganizer(user)) return fail("Organizer access required.", 403);
  if (path === "/data/refresh") return dataView(env.nominations_db);
  if (path === "/rosters/import") return importRoster(env.nominations_db, body, user);
  if (path === "/entries/moderate") return moderateEntry(env.nominations_db, user, body);
  if (path === "/nominations/add") {
    const title = clean(body.title, 160);
    const description = clean(body.description, 1000);
    if (!title) return fail("Nomination title is required.");
    const id = uid();
    await env.nominations_db.prepare("INSERT INTO nominations (id, title, description) VALUES (?, ?, ?)").bind(id, title, description).run();
    await audit(env.nominations_db, user, "add_nomination", id);
    return json({ ok: true, id });
  }
  if (path === "/nominations/delete") {
    const id = clean(body.id, 80);
    const result = await env.nominations_db.prepare("DELETE FROM nominations WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return fail("Nomination not found.", 404);
    await audit(env.nominations_db, user, "delete_nomination", id);
    return json({ ok: true });
  }
  if (path === "/voting/open" || path === "/voting/close") {
    if (path.endsWith("open")) {
      const count = await env.nominations_db.prepare("SELECT COUNT(*) AS count FROM nominations").first();
      const rosterCount = await env.nominations_db.prepare("SELECT COUNT(*) AS count FROM students WHERE active = 1").first();
      if (!count?.count || !rosterCount?.count) return fail("Add nominations and an active student roster before opening voting.");
    }
    const open = path.endsWith("open");
    await env.nominations_db.prepare("INSERT INTO app_settings (key, value) VALUES ('voting_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(open ? "true" : "false").run();
    await audit(env.nominations_db, user, open ? "open_voting" : "close_voting");
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
