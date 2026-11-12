-- Roster without emails + voter identity on ballots + detailed audit log.
-- WARNING: drops the old roster, ballots and ballot entries (they were keyed by email).
-- Nominations, sessions, settings and the existing audit_log rows are kept.
-- Run ONCE:  npx wrangler d1 execute nominations-db --remote --file=./migrations/0003_roster_without_email.sql

DROP TABLE IF EXISTS ballot_entries;
DROP TABLE IF EXISTS ballots;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(name) BETWEEN 1 AND 160),
  class_name TEXT NOT NULL COLLATE NOCASE CHECK(length(class_name) BETWEEN 1 AND 24),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(class_name, name)
);
CREATE INDEX students_class_idx ON students(class_name, name);

CREATE TABLE ballots (
  id TEXT PRIMARY KEY,
  voter_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  voter_student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ballot_entries (
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
CREATE INDEX ballot_entries_nomination_idx ON ballot_entries(nomination_id, status, rank);

ALTER TABLE audit_log ADD COLUMN details TEXT;
