-- Ballots are keyed by the school email only (1 email = 1 vote).
-- Run once: npx wrangler d1 execute nominations-db --remote --file=./migrations/0006_ballots_by_email.sql
-- Safe to run when ballots are empty; existing ballots keep their email and class.

CREATE TABLE ballots_new (
  id TEXT PRIMARY KEY,
  voter_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  class_name TEXT NOT NULL COLLATE NOCASE CHECK(length(class_name) BETWEEN 1 AND 24),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO ballots_new (id, voter_email, class_name, submitted_at)
  SELECT b.id, b.voter_email, s.class_name, b.submitted_at
  FROM ballots b JOIN students s ON s.id = b.voter_student_id;
DROP TABLE ballots;
ALTER TABLE ballots_new RENAME TO ballots;