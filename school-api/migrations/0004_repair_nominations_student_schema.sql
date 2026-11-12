-- Safe only because students, ballots and ballot_entries were verified empty.
DROP TABLE IF EXISTS ballot_entries;
DROP TABLE IF EXISTS ballots;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  class_name TEXT NOT NULL CHECK(length(class_name) BETWEEN 1 AND 24),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX students_class_idx ON students(class_name, name);

CREATE TABLE ballots (
  id TEXT PRIMARY KEY,
  voter_email TEXT NOT NULL UNIQUE COLLATE NOCASE REFERENCES students(email),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ballot_entries (
  id TEXT PRIMARY KEY,
  ballot_id TEXT NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE CASCADE,
  nominee_email TEXT NOT NULL COLLATE NOCASE REFERENCES students(email),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  explanation TEXT NOT NULL CHECK(length(trim(explanation)) BETWEEN 1 AND 1200),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','valid','rejected')),
  moderated_by TEXT,
  moderated_at TEXT,
  UNIQUE(ballot_id, nomination_id, rank),
  UNIQUE(ballot_id, nomination_id, nominee_email)
);
CREATE INDEX ballot_entries_nomination_idx
  ON ballot_entries(nomination_id, status, rank);