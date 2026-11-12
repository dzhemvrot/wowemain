-- Final schema. For a FRESH database run this file once.
-- For the EXISTING database run migrations/0003_roster_without_email.sql instead.

CREATE TABLE IF NOT EXISTS nominations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Roster: just a name and a class. No email.
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(name) BETWEEN 1 AND 160),
  class_name TEXT NOT NULL COLLATE NOCASE CHECK(length(class_name) BETWEEN 1 AND 24),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(class_name, name)
);
CREATE INDEX IF NOT EXISTS students_class_idx ON students(class_name, name);

-- One ballot per Microsoft account AND one per roster name.
CREATE TABLE IF NOT EXISTS ballots (
  id TEXT PRIMARY KEY,
  voter_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  voter_student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ballot_entries (
  id TEXT PRIMARY KEY,
  ballot_id TEXT NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE CASCADE,
  nominee_student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  explanation TEXT NOT NULL CHECK(length(trim(explanation)) BETWEEN 1 AND 1200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','valid','rejected')),
  moderated_by TEXT,
  moderated_at TEXT,
  UNIQUE(ballot_id, nomination_id, rank),
  UNIQUE(ballot_id, nomination_id, nominee_student_id)
);
CREATE INDEX IF NOT EXISTS ballot_entries_nomination_idx ON ballot_entries(nomination_id, status, rank);

CREATE TABLE IF NOT EXISTS auth_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

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

-- Every submitted choice gets its own row here (action = 'vote_entry').
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
