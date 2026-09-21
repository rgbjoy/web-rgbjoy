-- Updated in the same transaction as every content write. Cache keys use this
-- revision, so an old cache fill cannot replace content after a later save.
CREATE TABLE content_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO content_revision (id, revision) VALUES (1, 1);

CREATE TRIGGER projects_cache_insert AFTER INSERT ON projects
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER projects_cache_update AFTER UPDATE ON projects
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER projects_cache_delete AFTER DELETE ON projects
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_info_cache_insert AFTER INSERT ON site_info
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_info_cache_update AFTER UPDATE ON site_info
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_info_cache_delete AFTER DELETE ON site_info
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER seo_settings_cache_insert AFTER INSERT ON seo_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER seo_settings_cache_update AFTER UPDATE ON seo_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER seo_settings_cache_delete AFTER DELETE ON seo_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_media_cache_insert AFTER INSERT ON site_media
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_media_cache_update AFTER UPDATE ON site_media
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER site_media_cache_delete AFTER DELETE ON site_media
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER content_settings_cache_insert AFTER INSERT ON content_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER content_settings_cache_update AFTER UPDATE ON content_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER content_settings_cache_delete AFTER DELETE ON content_settings
BEGIN
  UPDATE content_revision SET revision = revision + 1 WHERE id = 1;
END;

