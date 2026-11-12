# Nominations Worker API

The API is served by the existing `school-api` Worker under `/nominations/*`, using the configured `nominations_db` D1 binding.

## Setup

1. Apply the schema migration to the D1 database configured in `wrangler.jsonc`:
   `npx wrangler d1 execute nominations-db --remote --file=./migrations/0002_nominations_auth_settings.sql` (run from `school-api/`).
   The existing nomination tables in `schema.sql` must also already have been applied. Do not execute the full schema as a migration if its tables already exist; it uses `IF NOT EXISTS` and is safe to apply if the database is empty or partially initialized.
2. In Microsoft Entra, register the application as a web/confidential client and add the exact redirect URI `https://school-api.wmcoeu.workers.dev/nominations/auth/callback` (or set `MS_REDIRECT_URI` to the actual registered URI). Enable the authorization-code flow and configure an app secret.
3. Set Worker secrets and vars:
   - `MS_CLIENT_ID`
   - `MS_TENANT_ID` (tenant GUID, not `common`)
   - `MS_CLIENT_SECRET` (secret value)
   - `MS_REDIRECT_URI` (exact registered callback URL)
   - `FRONTEND_ORIGIN` (for example `https://wowe-main.eu`)
   - `NOMINATIONS_ADMIN_EMAILS` (comma/semicolon/space separated organizer `@edu.riga.lv` addresses)
4. Deploy the existing Worker with `npm run deploy` from `school-api/`.

## Endpoints

All API requests use `https://school-api.wmcoeu.workers.dev/nominations` as the base URL. After login the frontend should keep the bearer token in session memory/sessionStorage and send `Authorization: Bearer <token>` on protected calls. Do not put the Microsoft client secret in frontend code.

- `GET /auth/login` — redirect to Microsoft sign-in.
- `GET /auth/callback` — validate Microsoft ID token and redirect to frontend with a short-lived `auth_code` query parameter.
- `POST /auth/exchange` `{ "code": "..." }` — one-time exchange; returns bearer token and role. Remove the auth_code from browser history immediately after exchange.
- `GET /auth/me` — current account.
- `POST /auth/logout` — revoke current session; pass bearer token.
- `GET /data` — organizer view, including nominations, classes, entries, voting state, ranked result rows.
- `POST /nominations/add` `{ "title": "...", "description": "..." }`
- `POST /nominations/delete` `{ "id": "..." }`
- `POST /rosters/import` `{ "students": [{ "email": "...@edu.riga.lv", "name": "...", "className": "10.A" }] }`
- `POST /voting/open` and `POST /voting/close`
- `POST /entries/moderate` `{ "id": "entry-id", "status": "valid|rejected|pending" }`
- `GET /student/data` — active student's class nominees, categories, and ballot/voting status.
- `POST /ballot/submit` `{ "entries": [{ "nominationId": "...", "nomineeEmail": "...@edu.riga.lv", "rank": 1, "explanation": "..." }] }`

The API enforces roster membership, own-class nominees, no self-nominations, 1–3 distinct ranked choices per category, one ballot per account, all-category completion, and voting-open state. Only moderated `valid` entries contribute to ranked results; score weights are 3/2/1 for ranks 1/2/3.

## Important

- The organizer frontend still needs wiring to these API endpoints; it currently uses local demo/localStorage state.
- Roster import requires each row to include the student's actual Microsoft sign-in email, name, and class. Do not import sample names or use guessed email addresses.
- The first callback redirects to the configured site with an `auth_code`; the organizer/student UI must exchange that code and use bearer authorization. Cookie sessions are intentionally not required because the API and website are on different sites and third-party cookies can be blocked.
- Test with a small, approved roster and organizer allowlist before inviting students. Never share Microsoft client secrets in chat or commit them to the repo.
