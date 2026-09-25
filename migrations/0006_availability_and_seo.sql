-- Existing sites show the availability link until it is disabled in Info.
ALTER TABLE site_info ADD COLUMN available_for_work INTEGER NOT NULL DEFAULT 1 CHECK (available_for_work IN (0, 1));

-- Refresh the original SEO copy while preserving edits made in the dashboard.
UPDATE seo_settings
SET title = 'Tom Fletcher is a full-stack engineer and creative developer who designs and builds for the web, from client sites and product systems to shader experiments. Available for new work.',
    updated_at = datetime('now')
WHERE path = '/' AND title = 'Tom Fletcher — fullstack engineering, architecture, and design';

UPDATE seo_settings
SET description = 'Tom Fletcher is a full-stack engineer and creative developer who designs and builds for the web, from client sites and product systems to shader experiments. Available for new work.',
    updated_at = datetime('now')
WHERE path = '/' AND description = 'Tom Fletcher is a fullstack engineer who architects and designs for the web — client sites, product systems, and shader experiments. Available for new work.';
