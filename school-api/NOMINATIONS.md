# Nominations Worker API

The API is served by the existing `school-api` Worker under `/nominations/*`, using the configured `nominations_db` D1 binding.

## Setup

1. Apply `migrations/0002_nominations_auth_settings.sql` to the configured D1 database. If the base tables in `schema.sql` have not yet been applied, apply `schema.sql` first. Run from `school-api/`:
   `npx wrangler d1 execute nominations-db --remote --file=./schema.sql`
   `npx wrangler d1 execute nominations-db --remote --file=./migrations/0002_nominations_auth_settings.sql`
2. In Microsoft Entra, register the application as a web/confidential client and add the exact redirect URI `https://school-api.wmcoeu.workers.dev/nominations/auth/callback` (or set `MS_REDIRECT_URI` to the exact registered URI). Configure an application secret and single-tenant app.
3. Set Worker secrets and vars:
   - `MS_CLIENT_ID`
   - `MS_TENANT_ID` (tenant GUID, not `common`)
   - `MS_CLIENT_SECRET` (secret value; use `npx wrangler secret put MS_CLIENT_SECRET`)
   - `MS_REDIRECT_URI` (exact registered callback URL)
   - `FRONTEND_ORIGIN` (for example `https://wowe-main.eu`)
   - `NOMINATIONS_ADMIN_EMAILS` (comma/semicolon/space separated organizer `@edu.riga.lv` addresses)
4. Deploy the existing Worker with `npm run deploy` from `school-api/`.

## Endpoints

Base URL: `https://school-api.wmcoeu.workers.dev/nominations`. After sign-in the frontend stores the opaque bearer token in sessionStorage and sends `Authorization: Bearer <token>` on API calls. Keep the token out of URLs and logs. The Microsoft client secret is Worker-only.

- `GET /auth/login` — redirect to Microsoft sign-in.
- `GET /auth/callback` — validate Microsoft ID token and redirect to the frontend with a short-lived `auth_code` query parameter.
- `POST /auth/exchange` `{ "code": "..." }` — one-time exchange; returns bearer token and role. Frontend removes the query parameter immediately.
- `GET /auth/me` — current account.
- `POST /auth/logout` — revoke current session.
- `GET /data` — organizer view: nominations, classes, submissions, voting state, ranked result rows.
- `POST /nominations/add` `{ "title": "...", "description": "..." }`
- `POST /nominations/delete` `{ "id": "..." }`
- `POST /rosters/import` `{ "students": [{ "email": "...@edu.riga.lv", "name": "...", "className": "10.A" }] }`
- `POST /voting/open` and `POST /voting/close`
- `POST /entries/moderate` `{ "id": "entry-id", "status": "valid|rejected|pending" }`
- `GET /student/data` — active student's class nominees, nominations and ballot/voting status.
- `POST /ballot/submit` `{ "entries": [{ "nominationId": "...", "nomineeEmail": "...@edu.riga.lv", "rank": 1, "explanation": "..." }] }`

The API enforces roster membership, own-class nominees, no self-nominations, 1–3 distinct ranked choices per category, one ballot per account, all-category completion, and voting-open state. Only moderated `valid` entries affect the results; ranked score weights are 3/2/1. Ranked result data contains the top three places per class/category in the organizer UI and CSV.

## Roster format

CSV/XLSX must include a header row with name, email and class columns. Latvian and English headers are supported, e.g. `Vārds;E-pasts;Klase` or `Name,Email,Class`. Emails must be the actual Microsoft `@edu.riga.lv` sign-in addresses. Existing student records with the same email are updated; rows omitted from a subsequent import are not automatically deactivated.

## Important

- Configure and apply D1 schema, Microsoft settings, and organizer allowlist before use.
- Test sign-in and import using a small approved roster before opening voting. Never put Microsoft client secrets in frontend code or commit them to the repo.
- The organizer UI uses this remote API; it no longer has demo/sample roster or ballot records.
