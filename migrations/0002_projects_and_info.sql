CREATE TABLE projects (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 url TEXT NOT NULL,
 year TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 technologies TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(technologies)),
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 position INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE site_info (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 author TEXT NOT NULL,
 email TEXT NOT NULL,
 lead TEXT NOT NULL,
 invite TEXT NOT NULL,
 link_label TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:golfisweird.com','golfisweird.com','https://golfisweird.com','Coming soon','Something weird for golf, in the works. All it takes is one good look.','[]',0);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:futurebyday.com','futurebyday.com','https://futurebyday.com','2026','An interactive savings calculator for exploring how daily contributions could grow over time, comparing risk levels, and planning toward a savings goal.','["vinext","React","StyleX"]',1);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:scriptlet.app','scriptlet.app','https://scriptlet.app','2026','A native Mac app for running, watching, and stopping package.json scripts while coding agents work.','[]',2);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:tenniswoodsmiles.com','tenniswoodsmiles.com','https://tenniswoodsmiles.com','2026','A patient-focused site for a multigenerational dental practice, built with Payload CMS and Next.js.','["Next.js","Payload CMS"]',3);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:veronightout.com','veronightout.com','https://veronightout.com','2026','A curated guide to the best bars, restaurants, and local hangouts in Vero Beach, with clear vibes for every spot.','[]',4);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:checkcheck.app','checkcheck.app','https://checkcheck.app','2026','A minimalist checklist app that lets you easily create tasks, sort, and use keyboard shortcuts.','[]',5);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:valeriechiang.com','valeriechiang.com','https://valeriechiang.com','2025','A portfolio site for a New York City photographer and filmmaker, built with Payload CMS.','["Payload CMS"]',6);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:thenewrepublic.com','thenewrepublic.com','https://thenewrepublic.com','Ongoing','Reader-facing features and custom editorial CMS tooling for the magazine, built and shipped front to back.','[]',7);
INSERT INTO projects (id,title,url,year,description,technologies,position) VALUES ('project:oib.beer','oib.beer','https://oib.beer','2025','','[]',8);
-- Preserve any edits made in the previous overrides dashboard.
UPDATE projects SET hidden=COALESCE((SELECT hidden FROM content_settings WHERE id=projects.id),hidden),
 title=COALESCE((SELECT NULLIF(title,'') FROM content_settings WHERE id=projects.id),title),
 description=COALESCE((SELECT NULLIF(description,'') FROM content_settings WHERE id=projects.id),description);
INSERT INTO site_info (id,author,email,lead,invite,link_label) VALUES (1,'Tom Fletcher','tom@rgbjoy.com','Hi, I''m Tom Fletcher. I love engineering, designing, and dreaming up amazing things for the web.','If you''d like to work together,','contact me');
INSERT OR IGNORE INTO seo_settings (path,title,description) VALUES ('/','Tom Fletcher — fullstack engineering, architecture, and design','Tom Fletcher is a fullstack engineer who architects and designs for the web — client sites, product systems, and shader experiments. Available for new work.');
INSERT OR IGNORE INTO seo_settings (path,title,description) VALUES ('/directory','rgbjoy — Tom Fletcher''s projects and experiments','Tom Fletcher is a fullstack engineer who architects and designs for the web — client sites, product systems, and shader experiments. Available for new work.');
