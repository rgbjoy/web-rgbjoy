-- One site-wide SEO record. Preserve the previous directory entry for rollback,
-- but the application reads and edits only the '/' row from now on.
CREATE TABLE site_media (
 kind TEXT PRIMARY KEY CHECK(kind IN ('icon','social')),
 version TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
