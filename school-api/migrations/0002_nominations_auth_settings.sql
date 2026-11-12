-- Nominations system auth and voting state. Existing nominations tables are defined in schema.sql.
CREATE TABLE IF NOT EXISTS nominations_auth_codes (
  code_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','organizer')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nominations_auth_codes_expiry_idx ON nominations_auth_codes(expires_at);

CREATE TABLE IF NOT EXISTS nominations_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','organizer')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nominations_sessions_expiry_idx ON nominations_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('voting_open', 'false');
