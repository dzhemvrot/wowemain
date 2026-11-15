-- Ballots are keyed by the school email only (1 email = 1 vote). The voter picks a class, never a name.
-- DESTROYS ballots and ballot_entries. Only run while there are no real votes yet.
-- Requires the students table to be in its final shape (id, name, class_name) - run 0005 first if unsure.
-- Run once: npx wrangler d1 execute nominations-db --remote --file=./migrations/0006_ballots_by_email.sql

DROP TABLE IF EXISTS ballot_entries;
DROP TABLE IF EXISTS ballots;

CREATE TABLE ballots (
  id TEXT PRIMARY KEY,
  voter_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  class_name TEXT NOT NULL COLLATE NOCASE CHECK(length(class_name) BETWEEN 1 AND 24),
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
