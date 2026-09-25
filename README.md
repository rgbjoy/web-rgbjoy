# rgbjoy.com

Personal site for Tom Fletcher — an index of client work, shader and 3D
experiments, and links, over a live fluid-simulation background.

[vinext](https://github.com/cloudflare/vinext) (Next.js App Router APIs on Vite),
React 19, TypeScript, and Bun. Deployment uses Cloudflare Workers and Wrangler.

## Content and dashboard

The dashboard has three sections:

- **Info:** one Lexical rich-text bio with paragraphs, bold, italic, and links, plus a toggle for the floating “Available for new work” contact button. Visitors can dismiss that button for the current browser session. Use a contact link to open the contact form. Existing copy is imported when opening the editor; the stored owner name and delivery email are preserved.
- **Projects:** add, edit, hide, and delete full project records, including their
  URL, year/status, description, and technology list.
- **SEO:** one title and description used across the entire site, plus a site
  icon and social-card image.

D1 is the source of truth for project records, Info, shared SEO, and current
media versions. Migration
`0002_projects_and_info.sql` imports the original nine projects and profile,
preserving previous project overrides. New deployments never re-seed or restore
deleted projects. The original `projects.ts` array remains as a historical seed
fixture for regression tests; it is not a runtime project data source.

Experiment implementations and their authored listings remain in code. Hidden
projects disappear from the homepage, search, directory, and AI endpoints.
Changes appear on the next page load without a deployment. The resume builder
is not implemented yet.

The dashboard uses a generated password and an eight-hour signed session in a
Secure, HttpOnly, SameSite=Strict cookie. Login attempts are rate limited to five
per minute per IP at each Cloudflare location. State-changing requests require
a matching Origin. Cloudflare Access is not required.

`DASHBOARD_PASSWORD_HASH` holds the SHA-256 digest of the generated high-entropy
password; `DASHBOARD_SESSION_SECRET` signs sessions. Both are Worker secrets.
Do not use a human-chosen password with this scheme. To rotate access, generate
a fresh random password (at least 24 random bytes), update its hash and rotate
the session secret to invalidate existing sessions. Sign out clears the browser
cookie. The initial password is saved in the ignored `.dashboard-password.txt`
file; save it in a password manager and remove that local file when finished.

The Worker is deployed at https://web-rgbjoy.tom-a2d.workers.dev. SES secret
transfer and the rgbjoy.com DNS cutover remain pending.

## Running it

```bash
bun install
bun run db:migrate:local
bun run dev
```

Use **Scriptlet** to run the long-running `dev` or `start` scripts.

| Script | Purpose |
| --- | --- |
| `dev` | Vite + local Workers/D1 development on :3000 |
| `build` | Build the Worker and browser assets |
| `start` | Preview the built Worker with the same local D1 storage |
| `lint` / `ts:check` | ESLint / TypeScript |
| `test:discovery` | Catalog, project CRUD, Info, and dashboard access regression checks |
| `cf:types` | Regenerate Worker bindings and runtime types |
| `db:migrate:local` | Apply migrations to local D1 |
| `db:migrate:remote` | Apply migrations to the configured production D1 |
| `deploy` | Build and deploy the Worker with Wrangler |

Local and remote D1 are separate. Apply and test migrations locally before
running `db:migrate:remote`. Migrations preserve existing settings.
The Cloudflare Vite plugin writes the deployment configuration into `dist/server`;
Wrangler follows `.wrangler/deploy/config.json` when deploying from the project root.

## Environment and deployment

For local email, put the following in an ignored `.dev.vars` file (or existing
`.env`). For production, set them with `wrangler secret put NAME` or secret bulk.
Never commit credentials or the generated `dist/server/.dev.vars` file.

| Secret | Purpose |
| --- | --- |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` | Existing Amazon SES credentials |
| `CONTACT_FROM` | SES-verified sender address |

Contact mail continues through AWS SES using the fetch HTTP transport. D1 does
not store contact messages. The historical `S3_` credential names are retained.
The old Payload and Instagram environment entries are unused.

`wrangler.jsonc` binds the `web-rgbjoy` D1 database as `DB` and enables logs and
traces. No custom domain is attached yet: verify the workers.dev deployment,
verify dashboard login, and then attach the production hostnames before removing the
Vercel deployment. The migration uses vinext beta; validate shader experiments
and navigation after dependency updates.

## Layout

```
src/app/
  data/                 Static content (above)
  api/contact/          Contact form → Amazon SES
  experiments/          One directory per experiment, self-contained
  utilities/
    FluidVelocityBackground/  GPU fluid sim behind the index
    SearchPalette/            Cmd+F search over every kind of entry
    settings/                 Theme + reduced-motion store and menu
    contact/                  Contact dialog
    SmoothScroll.tsx          Lenis, index only
    RolloverChroma.tsx        Cycles rollovers through red/green/blue
    useIndexState.ts          Open sections + sort, per session
  page.tsx              The index
  globals.css           Design tokens
```

Experiments are deliberately self-contained — each owns its page, styles,
shaders and components — so one can be deleted by removing its directory and its
entry in `experiments.ts`.

## Things worth knowing before editing

- **Reduced motion is a real setting**, not just a media query. It follows the OS
  until the settings menu overrides it, unmounts the fluid background, disables
  smooth scrolling, and snaps the intro to its finished state.
- **Dark is the default and light is opt-in.** The system colour preference is
  deliberately ignored; `prefers-color-scheme` does not flip the theme.
- **Hover states belong in `@media (hover: hover)`.** So do `:active` states —
  on touch, `:active` latches at touch-down and holds through a drag, lighting
  up everything a scrolling finger passes.
- **Scrollable overlays need `data-lenis-prevent`**, or Lenis takes their wheel
  events and scrolls the page behind them instead.
- **GLSL files** are compiled with `glslify` and exported as strings
  by the GLSL plugin in `vite.config.ts`.

Agent-facing notes on the physics engine live in `AGENTS.md`.

## Public discovery and API

All discovery content comes from the same authored arrays as the homepage:

- `/directory` is a server-rendered, readable directory of every project and
  experiment, with descriptions, technologies, status labels, and source links.
- `/api/catalog` returns the public profile and all entries as JSON. Optional
  `q` matches all whitespace-separated terms case-insensitively; `kind=project`
  or `kind=experiment` limits the entry type. For example:
  `/api/catalog?q=shader&kind=experiment`. Invalid kinds return 400; no matches
  return an empty entries array. Public GET requests allow cross-origin reads.
- `/openapi.json` documents the read-only API for tools and integrations.
- `/prompt.md` hosts the conversation guide and full catalog. The homepage's
  copy button provides a short fetch-and-follow prompt pointing here; edits to
  this guide apply on the next fetch without changing what visitors copy.
- `/llms.txt` provides the full catalog as plain text for readers that support
  this convention. It is a convenience, not a guarantee of AI discovery.
- `/robots.txt` permits public crawling and advertises `/sitemap.xml`. The
  sitemap includes local pages only. Person, WebSite, and directory JSON-LD
  describe the identity and portfolio for crawlers.

There is no authentication, database, external-site scraping, or model API
dependency. Unpublished details stay unknown. Edit `src/app/data/` and deploy
to update the directory and API together. Run `test:discovery` in Scriptlet
for the discovery contract checks; use `dev` to preview locally.

This is a public HTTP API, not an MCP server. MCP clients need an explicitly
configured MCP connection; ordinary ChatGPT search discovery relies on public
web content. If adding MCP later, reuse `data/catalog.ts` for its search/fetch
tools. Production search visibility also depends on the host allowing crawler
requests and search engines indexing the deployed pages.

## Site images

In Dashboard → SEO, upload a square PNG/JPEG/WebP (512×512 recommended) for
the site icon, and a social image (1200×630 recommended). Preview the crop before
saving. The browser creates 512px and 32px icons, a 180px Apple-touch icon, and a
1200×630 social PNG. The Worker validates dimensions and PNG integrity and
re-encodes the pixels with `fast-png` to strip metadata before writing to R2.
Uploads require a dashboard session and same-origin requests; request size is
bounded. Only the known image variants can be served publicly.

This uses browser Canvas and a portable Worker codec, not Sharp's native Node
module, and needs no Cloudflare Images subscription. Existing experiment assets
are unchanged. Originals are not retained. R2 stores versioned processed files;
D1 switches the live version after all variants succeed. Old versions remain
available for cached previews. `MEDIA_PUBLIC_URL` is the public origin used by
social image metadata and currently points to the workers.dev deployment.

### Content caching

Content snapshots use a named Cloudflare Cache API cache with a one-hour TTL.
Each request reads one small revision row from the D1 primary; a cache hit skips
loading the five content tables. Migration `0005_content_cache.sql` adds triggers
that advance this revision atomically for project, Info, SEO, media, and legacy
content-setting writes. Old snapshots become unreachable immediately after a
successful write, including across locations; expiry only cleans up old entries.
Cache errors fall back to D1. This reduces database work, but still requires a
primary-database round trip to guarantee freshness.

HTML/RSC stay dynamic, discovery responses are not HTTP-cached, and dashboard
saves refresh the current layout. Already-open visitor tabs update on their next
server request or reload, not via live push. Versioned image URLs remain immutable.
Deploy through the connected GitHub build, with `bun run db:migrate:remote &&
bunx wrangler deploy` as the deploy command so schema changes land before code.
