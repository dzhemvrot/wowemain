const API_PREFIX = "/nominations/api";
const SESSION_COOKIE = "nominations_session";
const SESSION_SECONDS = 60 * 60 * 8;
const MAX_JSON_BYTES = 1_000_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(API_PREFIX)) return new Response("Not found", { status: 404 });

    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const path = url.pathname.slice(API_PREFIX.length) || "/";
      if (path === "/auth/login" && request.method === "GET") return await startLogin(url, env, cors);
      if (path === "/auth/callback" && request.method === "GET") return await finishLogin(url, env, cors);

      const session = await getSession(request, env);
      if (path === "/auth/logout" && request.method === "POST") {
        if (session) await env.nominations_db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(session.rawToken)).run();
        return json({ ok: true }, 200, { ...cors, "Set-Cookie": expiredCookie() });
      }
      if (path === "/me" && request.method === "GET") {
        if (!session) return json({ error: "Autentifikācija nepieciešama." }, 401, cors);
        return json({ user: { email: session.email, name: session.name, role: session.role, className: session.class_name || null } }, 200, cors);
      }

      if (path === "/student/bootstrap" && request.method === "GET") return await studentBootstrap(session, env, cors);
      if (path === "/student/ballot" && request.method === "POST") return await submitBallot(request, session, env, cors);

      if (path.startsWith("/admin/")) {
        const authError = requireOrganizer(session, cors);
        if (authError) return authError;
        if (path === "/admin/bootstrap" && request.method === "GET") return await adminBootstrap(env, cors);
        if (path === "/admin/nominations" && request.method === "POST") return await createNomination(request, session, env, cors);
        if (path.startsWith("/admin/nominations/") && request.method === "DELETE") return await deleteNomination(path.split("/").at(-1), session, env, cors);
        if (path === "/admin/roster" && request.method === "POST") return await importRoster(request, session, env, cors);
        if (path.startsWith("/admin/entries/") && request.method === "PATCH") return await moderateEntry(path.split("/").at(-1), request, session, env, cors);
        if (path === "/admin/results" && request.method === "GET") return await getResults(env, cors);
      }

      return json({ error: "Nav atrasts." }, 404, cors);
    } catch (error) {
      console.error("Nominations API error:", error);
      if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
      return json({ error: "Servera kļūda." }, 500, cors);
    }
  }
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function corsHeaders(origin, env) {
  const allowed = (env.NOMINATIONS_ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const headers = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Credentials": "true" };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", ...headers } });
}

function requireOrganizer(session, headers) {
  if (!session) return json({ error: "Autentifikācija nepieciešama." }, 401, headers);
  if (session.role !== "organizer") return json({ error: "Nepietiekamas tiesības." }, 403, headers);
  return null;
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_JSON_BYTES) throw new HttpError(413, "Pieprasījums ir pārāk liels.");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "Pieprasījums ir pārāk liels.");
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Nederīgs JSON."); }
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function sessionCookie(value, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/nominations; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function expiredCookie() { return sessionCookie("", 0); }

async function getSession(request, env) {
  const rawToken = cookieValue(request, SESSION_COOKIE);
  if (!rawToken) return null;
  const tokenHash = await sha256(rawToken);
  const row = await env.nominations_db.prepare(`
    SELECT s.email, s.role, s.expires_at, st.name, st.class_name
    FROM sessions s LEFT JOIN students st ON st.email = s.email
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, Math.floor(Date.now() / 1000)).first();
  return row ? { ...row, rawToken } : null;
}

async function startLogin(url, env, headers) {
  const tenant = required(env.MICROSOFT_TENANT_ID, "MICROSOFT_TENANT_ID");
  const clientId = required(env.MICROSOFT_CLIENT_ID, "MICROSOFT_CLIENT_ID");
  const redirectUri = required(env.MICROSOFT_REDIRECT_URI, "MICROSOFT_REDIRECT_URI");
  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const stateHash = await sha256(state);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), env);
  await env.nominations_db.prepare("INSERT INTO auth_states (state_hash, nonce, verifier, expires_at, return_to) VALUES (?, ?, ?, ?, ?)")
    .bind(stateHash, nonce, verifier, Math.floor(Date.now() / 1000) + 600, returnTo).run();
  const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  authorize.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: "openid profile email", state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return redirect(authorize.toString(), headers);
}

async function finishLogin(url, env, headers) {
  const error = url.searchParams.get("error");
  if (error) return redirect(`${safeReturnTo(null, env)}?login=failed`, headers);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new HttpError(400, "Trūkst OAuth parametru.");
  const stateHash = await sha256(state);
  const authState = await env.nominations_db.prepare("SELECT nonce, verifier, expires_at, return_to FROM auth_states WHERE state_hash = ?").bind(stateHash).first();
  await env.nominations_db.prepare("DELETE FROM auth_states WHERE state_hash = ?").bind(stateHash).run();
  if (!authState || authState.expires_at < Math.floor(Date.now() / 1000)) throw new HttpError(400, "Autentifikācijas sesija ir nederīga vai beigusies.");

  const tenant = required(env.MICROSOFT_TENANT_ID, "MICROSOFT_TENANT_ID");
  const clientId = required(env.MICROSOFT_CLIENT_ID, "MICROSOFT_CLIENT_ID");
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: required(env.MICROSOFT_CLIENT_SECRET, "MICROSOFT_CLIENT_SECRET"), grant_type: "authorization_code", code, redirect_uri: required(env.MICROSOFT_REDIRECT_URI, "MICROSOFT_REDIRECT_URI"), code_verifier: authState.verifier })
  });
  if (!tokenResponse.ok) throw new HttpError(401, "Microsoft pierakstīšanās neizdevās.");
  const tokenData = await tokenResponse.json();
  const claims = await verifyMicrosoftIdToken(tokenData.id_token, clientId, tenant, authState.nonce);
  const email = String(claims.preferred_username || claims.email || claims.upn || "").trim().toLowerCase();
  if (!email.endsWith("@edu.riga.lv")) throw new HttpError(403, "Atļauts tikai @edu.riga.lv skolas konts.");

  const organizers = new Set((env.NOMINATIONS_ORGANIZERS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const role = organizers.has(email) ? "organizer" : "student";
  let student = await env.nominations_db.prepare("SELECT email, name, class_name, active FROM students WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (role === "student" && (!student || !student.active)) throw new HttpError(403, "Šis konts nav atrodams aktīvajā skolēnu sarakstā.");

  const rawToken = randomToken(32);
  await env.nominations_db.prepare("INSERT INTO sessions (token_hash, email, role, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(rawToken), email, role, Math.floor(Date.now() / 1000) + SESSION_SECONDS).run();
  const destination = new URL(authState.return_to || safeReturnTo(null, env));
  destination.searchParams.delete("login");
  return redirect(destination.toString(), { ...headers, "Set-Cookie": sessionCookie(rawToken) });
}

async function verifyMicrosoftIdToken(token, clientId, tenantId, expectedNonce) {
  if (!token || typeof token !== "string") throw new HttpError(401, "Microsoft neatgrieza ID token.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Nederīgs ID token.");
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new HttpError(401, "Neatbalstīts ID token paraksts.");
  const jwksResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`);
  if (!jwksResponse.ok) throw new HttpError(503, "Nevar pārbaudīt Microsoft parakstu.");
  const jwks = await jwksResponse.json();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new HttpError(401, "Nezināma Microsoft paraksta atslēga.");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (!validSignature || claims.aud !== clientId || claims.tid !== tenantId || claims.iss !== issuer || claims.nonce !== expectedNonce || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) {
    throw new HttpError(401, "Microsoft ID token validācija neizdevās.");
  }
  return claims;
}

function safeReturnTo(value, env) {
  const fallback = required(env.NOMINATIONS_FRONTEND_URL, "NOMINATIONS_FRONTEND_URL");
  if (!value) return fallback;
  try {
    const candidate = new URL(value, fallback);
    const base = new URL(fallback);
    return candidate.origin === base.origin && candidate.pathname.startsWith("/nominations/") ? candidate.toString() : fallback;
  } catch { return fallback; }
}

async function studentBootstrap(session, env, headers) {
  if (!session) return json({ error: "Autentifikācija nepieciešama." }, 401, headers);
  if (session.role !== "student") return json({ error: "Skolēna konts nepieciešams." }, 403, headers);
  const nominations = await env.nominations_db.prepare("SELECT id, title, description FROM nominations ORDER BY created_at, title").all();
  const students = await env.nominations_db.prepare("SELECT email, name FROM students WHERE class_name = ? AND active = 1 ORDER BY name COLLATE NOCASE").bind(session.class_name).all();
  const ballot = await env.nominations_db.prepare("SELECT submitted_at FROM ballots WHERE voter_email = ? COLLATE NOCASE").bind(session.email).first();
  return json({ student: { email: session.email, name: session.name, className: session.class_name }, nominations: nominations.results, classmates: students.results, submitted: !!ballot, submittedAt: ballot?.submitted_at || null }, 200, headers);
}

async function submitBallot(request, session, env, headers) {
  if (!session) return json({ error: "Autentifikācija nepieciešama." }, 401, headers);
  if (session.role !== "student") return json({ error: "Skolēna konts nepieciešams." }, 403, headers);
  const body = await readJson(request);
  if (!Array.isArray(body.entries) || body.entries.length > 300) throw new HttpError(400, "Nederīgs balsojums.");
  const existing = await env.nominations_db.prepare("SELECT id FROM ballots WHERE voter_email = ? COLLATE NOCASE").bind(session.email).first();
  if (existing) throw new HttpError(409, "Balsojums no šī konta jau ir iesniegts.");
  const [nominations, classmates] = await Promise.all([
    env.nominations_db.prepare("SELECT id FROM nominations").all(),
    env.nominations_db.prepare("SELECT email FROM students WHERE class_name = ? AND active = 1").bind(session.class_name).all()
  ]);
  const nominationIds = new Set(nominations.results.map((n) => n.id));
  const classmateEmails = new Set(classmates.results.map((s) => s.email.toLowerCase()));
  const byNomination = new Map();
  for (const entry of body.entries) {
    const nominationId = String(entry.nominationId || "");
    const nomineeEmail = String(entry.nomineeEmail || "").trim().toLowerCase();
    const rank = Number(entry.rank);
    const explanation = String(entry.explanation || "").trim();
    if (!nominationIds.has(nominationId) || !classmateEmails.has(nomineeEmail) || !Number.isInteger(rank) || rank < 1 || rank > 3 || explanation.length < 1 || explanation.length > 1200) throw new HttpError(400, "Pārbaudiet izvēlētos skolēnus, vietas un paskaidrojumus.");
    if (!byNomination.has(nominationId)) byNomination.set(nominationId, []);
    byNomination.get(nominationId).push({ nominationId, nomineeEmail, rank, explanation });
  }
  if (nominationIds.size === 0 || byNomination.size !== nominationIds.size) throw new HttpError(400, "Jāaizpilda izvēles katrai nominācijai.");
  for (const entries of byNomination.values()) {
    if (entries.length > 3 || new Set(entries.map((x) => x.rank)).size !== entries.length || new Set(entries.map((x) => x.nomineeEmail)).size !== entries.length) throw new HttpError(400, "Katrā nominācijā izvēlieties ne vairāk kā 3 dažādus skolēnus, katram citu vietu.");
  }

  const ballotId = crypto.randomUUID();
  const statements = [env.nominations_db.prepare("INSERT INTO ballots (id, voter_email) VALUES (?, ?)").bind(ballotId, session.email)];
  for (const entry of body.entries) {
    statements.push(env.nominations_db.prepare("INSERT INTO ballot_entries (id, ballot_id, nomination_id, nominee_email, rank, explanation, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')")
      .bind(crypto.randomUUID(), ballotId, entry.nominationId, entry.nomineeEmail.trim().toLowerCase(), Number(entry.rank), String(entry.explanation).trim()));
  }
  try { await env.nominations_db.batch(statements); }
  catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) throw new HttpError(409, "Balsojums jau iesniegts vai satur dublētus ierakstus.");
    throw error;
  }
  return json({ ok: true, submitted: true }, 201, headers);
}

async function adminBootstrap(env, headers) {
  const [nominations, students, entries] = await Promise.all([
    env.nominations_db.prepare("SELECT id, title, description, created_at FROM nominations ORDER BY created_at, title").all(),
    env.nominations_db.prepare("SELECT class_name, COUNT(*) AS count FROM students WHERE active = 1 GROUP BY class_name ORDER BY class_name").all(),
    env.nominations_db.prepare(`SELECT be.id, be.nomination_id AS nominationId, n.title AS nominationTitle, be.nominee_email AS nomineeEmail, nominee.name AS nominee, voter.name AS voter, voter.class_name AS className, be.rank, be.explanation AS reason, be.status, be.moderated_by AS moderatedBy, be.moderated_at AS moderatedAt, b.submitted_at AS submittedAt FROM ballot_entries be JOIN nominations n ON n.id = be.nomination_id JOIN ballots b ON b.id = be.ballot_id JOIN students nominee ON nominee.email = be.nominee_email JOIN students voter ON voter.email = b.voter_email ORDER BY b.submitted_at DESC`).all()
  ]);
  return json({ nominations: nominations.results, classes: students.results, entries: entries.results }, 200, headers);
}

async function createNomination(request, session, env, headers) {
  const body = await readJson(request);
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (!title || title.length > 160 || description.length > 1000) throw new HttpError(400, "Nominācijas nosaukums vai apraksts nav derīgs.");
  const id = crypto.randomUUID();
  await env.nominations_db.prepare("INSERT INTO nominations (id, title, description) VALUES (?, ?, ?)").bind(id, title, description).run();
  await audit(env, session.email, "nomination_create", id);
  return json({ ok: true, nomination: { id, title, description } }, 201, headers);
}

async function deleteNomination(id, session, env, headers) {
  if (!id) throw new HttpError(400, "Trūkst nominācijas ID.");
  const result = await env.nominations_db.prepare("DELETE FROM nominations WHERE id = ?").bind(id).run();
  if (!result.meta.changes) throw new HttpError(404, "Nominācija nav atrasta.");
  await audit(env, session.email, "nomination_delete", id);
  return json({ ok: true }, 200, headers);
}

async function importRoster(request, session, env, headers) {
  const body = await readJson(request);
  if (!Array.isArray(body.students) || body.students.length > 10000) throw new HttpError(400, "Sarakstam jābūt students masīvam (maksimāli 10 000 ierakstu).");
  const valid = [];
  for (const item of body.students) {
    const email = String(item.email || "").trim().toLowerCase();
    const name = String(item.name || "").trim();
    const className = String(item.className || "").trim();
    if (!/^[^\s@]+@edu\.riga\.lv$/.test(email) || !name || name.length > 160 || !className || className.length > 24) throw new HttpError(400, "Katram skolēnam vajadzīgs derīgs @edu.riga.lv e-pasts, vārds un klase.");
    valid.push({ email, name, className });
  }
  if (!valid.length) throw new HttpError(400, "Saraksts ir tukšs.");
  const seen = new Set();
  const statements = [];
  for (const student of valid) {
    if (seen.has(student.email)) throw new HttpError(400, `Sarakstā ir dublēts e-pasts: ${student.email}`);
    seen.add(student.email);
    statements.push(env.nominations_db.prepare("INSERT INTO students (email, name, class_name, active) VALUES (?, ?, ?, 1) ON CONFLICT(email) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, active = 1")
      .bind(student.email, student.name, student.className));
  }
  for (let i = 0; i < statements.length; i += 100) await env.nominations_db.batch(statements.slice(i, i + 100));
  await audit(env, session.email, "roster_import", `${valid.length} students`);
  return json({ ok: true, imported: valid.length }, 200, headers);
}

async function moderateEntry(id, request, session, env, headers) {
  const body = await readJson(request);
  const status = String(body.status || "");
  if (!new Set(["valid", "rejected", "pending"]).has(status)) throw new HttpError(400, "Nederīgs moderācijas statuss.");
  const result = await env.nominations_db.prepare("UPDATE ballot_entries SET status = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .bind(status, session.email, id).run();
  if (!result.meta.changes) throw new HttpError(404, "Ieraksts nav atrasts.");
  await audit(env, session.email, `entry_${status}`, id);
  return json({ ok: true }, 200, headers);
}

async function getResults(env, headers) {
  const result = await env.nominations_db.prepare(`
    SELECT s.class_name AS className, n.id AS nominationId, n.title AS nominationTitle,
      be.nominee_email AS nomineeEmail, s2.name AS nominee,
      SUM(CASE be.rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END) AS points,
      SUM(CASE WHEN be.rank = 1 THEN 1 ELSE 0 END) AS first,
      SUM(CASE WHEN be.rank = 2 THEN 1 ELSE 0 END) AS second,
      SUM(CASE WHEN be.rank = 3 THEN 1 ELSE 0 END) AS third
    FROM ballot_entries be
    JOIN ballots b ON b.id = be.ballot_id
    JOIN students s ON s.email = b.voter_email
    JOIN students s2 ON s2.email = be.nominee_email
    JOIN nominations n ON n.id = be.nomination_id
    WHERE be.status = 'valid'
    GROUP BY s.class_name, n.id, n.title, be.nominee_email, s2.name
    ORDER BY s.class_name, n.title, points DESC, first DESC, second DESC, nominee COLLATE NOCASE
  `).all();
  return json({ results: result.results }, 200, headers);
}

async function audit(env, actor, action, targetId) {
  await env.nominations_db.prepare("INSERT INTO audit_log (id, actor_email, action, target_id) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), actor, action, targetId).run();
}

function required(value, name) {
  if (!value) throw new HttpError(500, `Trūkst Worker iestatījuma: ${name}`);
  return value;
}
function randomToken(bytes) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}
function base64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(digest);
}
