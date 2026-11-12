const SESSION_SECONDS = 12 * 60 * 60;
const MAX_BODY_BYTES = 1_000_000;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
});
const fail = (message, status = 400) => json({ ok: false, error: message }, status);
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const uid = () => crypto.randomUUID();
const encoder = new TextEncoder();

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
  const allowed = env.FRONTEND_ORIGIN || "https://wowe-main.eu";
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
  if (origin === allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
function sessionCookie(value, maxAge = SESSION_SECONDS) {
  return `nominations_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  return text ? JSON.parse(text) : {};
}
function allowedOrigins(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origin === (env.FRONTEND_ORIGIN || "https://wowe-main.eu");
}
function normalizeEmail(value) {
  return clean(value, 254).toLowerCase();
}
function isSchoolEmail(email) {
  return /^[^\s@]+@edu\.riga\.lv$/i.test(email);
}
function organizerEmails(env) {
  return new Set(String(env.NOMINATIONS_ADMIN_EMAILS || "").split(/[;,\s]+/).map(normalizeEmail).filter(Boolean));
}

async function getSession(request, env) {
  const token = parseCookies(request).nominations_session;
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.nominations_db.prepare(
    "SELECT email, role, expires_at FROM nominations_sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(hash, Math.floor(Date.now() / 1000)).first();
  return row ? { email: row.email, role: row.role } : null;
}
function requireOrganizer(user) {
  return user?.role === "organizer";
}
async function audit(db, user, action, target = null) {
  await db.prepare("INSERT INTO audit_log (id, actor_email, action, target_id) VALUES (?, ?, ?, ?)")
    .bind(uid(), user.email, action, target).run();
}

async function microsoftLogin(request, env) {
  if (!env.MS_CLIENT_ID || !env.MS_TENANT_ID) return fail("Microsoft sign-in is not configured.", 503);
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

async function microsoftCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("Microsoft sign-in was not completed.", 400);
  const authState = await env.nominations_db.prepare(
    "SELECT nonce, verifier FROM auth_states WHERE state_hash = ? AND expires_at > ?"
  ).bind(await sha256(state), Date.now()).first();
  if (!authState) return fail("Sign-in session expired. Please try again.", 400);
  await env.nominations_db.prepare("DELETE FROM auth_states WHERE state_hash = ?").bind(await sha256(state)).run();

  const redirectUri = env.MS_REDIRECT_URI || `${url.origin}/nominations/auth/callback`;
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET || "",
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
  const token = randomToken();
  await env.nominations_db.prepare(
    "INSERT INTO nominations_sessions (token_hash, email, role, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256(token), email, role, Math.floor(Date.now() / 1000) + SESSION_SECONDS).run();
  const response = Response.redirect(env.FRONTEND_ORIGIN || "https://wowe-main.eu", 302);
  response.headers.append("Set-Cookie", sessionCookie(token));
  return response;
}

const jwksCache = new Map();
async function getMicrosoftKey(tenant, kid) {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/discovery/v2.0/keys`;
  let keys = jwksCache.get(url);
  if (!keys || keys.expires < Date.now()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not retrieve Microsoft signing keys.");
    keys = { data: await response.json(), expires: Date.now() + 60 * 60 * 1000 };
    jwksCache.set(url, keys);
  }
  const jwk = keys.data.keys?.find((key) => key.kid === kid && key.use === "sig");
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
  const key = await getMicrosoftKey(tenant, header.kid);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || claims.aud !== env.MS_CLIENT_ID || claims.iss !== `https://login.microsoftonline.com/${tenant}/v2.0` || claims.exp <= now || claims.nbf > now) {
    throw new Error("Microsoft identity token validation failed.");
  }
  return claims;
}

async function dataView(db) {
  const [nominations, classes, entries] = await Promise.all([
    db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
    db.prepare("SELECT class_name, COUNT(*) AS student_count FROM students WHERE active = 1 GROUP BY class_name ORDER BY class_name").all(),
    db.prepare(`SELECT be.id, be.nomination_id AS nominationId, n.title AS nominationTitle,
      nominee.name AS nominee, nominee.email AS nomineeEmail, nominee.class_name AS className,
      voter.name AS voter, be.rank, be.explanation AS reason, be.status
      FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id
      JOIN students nominee ON nominee.email = be.nominee_email
      JOIN ballots b ON b.id = be.ballot_id JOIN students voter ON voter.email = b.voter_email
      ORDER BY nominee.class_name, n.title, b.submitted_at DESC`).all(),
  ]);
  return { ok: true, nominations: nominations.results, classes: classes.results, submissions: entries.results };
}

async function importRoster(db, body, user) {
  if (!Array.isArray(body.students) || body.students.length > 10000) return fail("Provide up to 10,000 roster rows.");
  let imported = 0;
  const errors = [];
  for (let i = 0; i < body.students.length; i++) {
    const row = body.students[i];
    const email = normalizeEmail(row?.email);
    const name = clean(row?.name, 160);
    const className = clean(row?.className, 24);
    if (!isSchoolEmail(email) || !name || !className) {
      errors.push({ row: i + 1, error: "A valid @edu.riga.lv email, student name, and class are required." });
      continue;
    }
    await db.prepare(`INSERT INTO students (email, name, class_name, active) VALUES (?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, active = 1`)
      .bind(email, name, className).run();
    imported++;
  }
  await audit(db, user, "roster_import", String(imported));
  return json({ ok: true, imported, errors: errors.slice(0, 100) });
}

async function submitBallot(db, user, body) {
  if (user.role !== "student") return fail("Only student accounts can submit a ballot.", 403);
  const student = await db.prepare("SELECT email, name, class_name FROM students WHERE email = ? AND active = 1").bind(user.email).first();
  if (!student) return fail("Student is not on an active roster.", 403);
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 300) return fail("Ballot entries are required.");
  const nominations = await db.prepare("SELECT id FROM nominations").all();
  const nominationIds = new Set(nominations.results.map((n) => n.id));
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
  for (const entries of groups.values()) {
    if (entries.length > 3 || new Set(entries.map((x) => x.rank)).size !== entries.length || new Set(entries.map((x) => x.nomineeEmail)).size !== entries.length) return fail("Each nomination allows up to three distinct, ranked students.");
  }
  const batch = [];
  for (const entries of groups.values()) {
    for (const entry of entries) {
      const nominee = await db.prepare("SELECT email FROM students WHERE email = ? AND class_name = ? AND active = 1")
        .bind(entry.nomineeEmail, student.class_name).first();
      if (!nominee || nominee.email.toLowerCase() === student.email.toLowerCase()) return fail("Nominees must be other students in your own class.");
    }
  }
  const ballotId = uid();
  batch.push(db.prepare("INSERT INTO ballots (id, voter_email) VALUES (?, ?)").bind(ballotId, student.email));
  for (const entries of groups.values()) for (const entry of entries) {
    batch.push(db.prepare(`INSERT INTO ballot_entries (id, ballot_id, nomination_id, nominee_email, rank, explanation)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(uid(), ballotId, entry.nominationId, entry.nomineeEmail, entry.rank, entry.explanation));
  }
  try {
    await db.batch(batch);
  } catch (error) {
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
  if (!allowedOrigins(request, env)) return fail("Origin not allowed.", 403);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/nominations/, "").replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  if (request.method === "GET" && path === "/auth/login") return microsoftLogin(request, env);
  if (request.method === "GET" && path === "/auth/callback") return microsoftCallback(request, env);

  const user = await getSession(request, env);
  if (request.method === "GET" && path === "/auth/me") {
    if (!user) return json({ ok: true, user: null });
    const student = await env.nominations_db.prepare("SELECT name, class_name AS className FROM students WHERE email = ?").bind(user.email).first();
    return json({ ok: true, user: { email: user.email, role: user.role, ...(student || {}) } });
  }
  if (request.method === "POST" && path === "/auth/logout") {
    const token = parseCookies(request).nominations_session;
    if (token) await env.nominations_db.prepare("DELETE FROM nominations_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (!user) return fail("Please sign in with your school account.", 401);
  let body = {};
  if (request.method === "POST") body = await readJson(request);

  if (request.method === "GET" && path === "/data") {
    if (!requireOrganizer(user)) return fail("Organizer access required.", 403);
    return dataView(env.nominations_db);
  }
  if (request.method === "GET" && path === "/student/data") {
    const student = await env.nominations_db.prepare("SELECT name, class_name AS className FROM students WHERE email = ? AND active = 1").bind(user.email).first();
    if (!student) return fail("Student is not on an active roster.", 403);
    const [nominations, classmates, ballot] = await Promise.all([
      env.nominations_db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all(),
      env.nominations_db.prepare("SELECT email, name FROM students WHERE class_name = ? AND active = 1 AND email != ? ORDER BY name").bind(student.className, user.email).all(),
      env.nominations_db.prepare("SELECT id FROM ballots WHERE voter_email = ?").bind(user.email).first(),
    ]);
    return json({ ok: true, student, nominations: nominations.results, classmates: classmates.results, submitted: !!ballot });
  }
  if (request.method !== "POST") return fail("Method not allowed.", 405);
  if (path === "/ballot/submit") return submitBallot(env.nominations_db, user, body);
  if (!requireOrganizer(user)) return fail("Organizer access required.", 403);
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
    await env.nominations_db.prepare("INSERT INTO app_settings (key, value) VALUES ('voting_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(path.endsWith("open") ? "true" : "false").run();
    await audit(env.nominations_db, user, path.endsWith("open") ? "open_voting" : "close_voting");
    return json({ ok: true, open: path.endsWith("open") });
  }
  return fail("Not found.", 404);
}

export async function handleNominations(request, env) {
  try {
    const response = await nominationsRequest(request, env);
    return withCors(response, request, env);
  } catch (error) {
    console.error("Nominations API error", error);
    return withCors(fail("Internal server error.", 500), request, env);
  }
}
