# rgbjoy.com

Personal site for Tom Fletcher — an index of client work, shader and 3D
experiments, and links, over a live fluid-simulation background.

[Next.js 16](https://nextjs.org) (App Router, React 19, React Compiler),
TypeScript, [Bun](https://bun.sh), deployed on Vercel.

## Content is static

There is no CMS and no database. Every piece of content is a typed array in
`src/app/data/`:

| File             | Holds                                          |
| ---------------- | ---------------------------------------------- |
| `projects.ts`    | Client work (7)                                |
| `experiments.ts` | Experiments (19) and the groups they sort into |
| `links.ts`       | Social / external links (4)                    |
| `site.ts`        | Name, email, SEO copy, masthead text           |

Adding an entry means editing one array. The index page, its counts, and the
Cmd+F search palette all derive from these — nothing needs registering twice.

> **On Payload CMS.** This site previously ran on Payload with a Postgres
> database and S3 media storage. That was dropped in favour of static data, and
> may come back. Until then most of `.env.example` is dormant: the only
> variables anything reads are `CONTACT_FROM` and the three SES credentials.
> Dormant entries are marked as such in the file rather than deleted, so
> restoring Payload does not mean rediscovering what it needed.

## Running it

```bash
bun install
bun dev
```

| Script             | Does                |
| ------------------ | ------------------- |
| `bun dev`          | Dev server on :3000 |
| `bun run build`    | Production build    |
| `bun start`        | Serve the build     |
| `bun run lint`     | ESLint              |
| `bun run ts:check` | `tsc --noEmit`      |

## Environment

Copy `.env.example` to `.env`. Only the contact form needs anything to work
locally; the rest of the site runs with an empty `.env`.

| Variable                                                                   | Used by                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION`                  | Amazon SES, via `/api/contact`                                      |
| `CONTACT_FROM`                                                             | The `From` header on contact mail — must be an SES-verified address |
| `SERVER_URL`, `PAYLOAD_SECRET`, `DATABASE_URL`, `S3_BUCKET`, `INSTAGRAM_*` | Nothing, currently. Payload-era leftovers                           |

The `S3_` prefix on the SES credentials is history, not scope: one IAM user
carries both `s3:*` and `ses:SendEmail`, and the contact route reuses that key
rather than holding a second one. A leak costs both, so split them if that ever
stops being an acceptable trade.

Production needs these set in the Vercel project settings too — without them the
deployed contact form returns "Contact is not configured right now."

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
- **GLSL files** are loaded through `raw-loader` + `glslify-loader`, configured
  for Turbopack in `next.config.ts`.

Agent-facing notes on the physics engine live in `AGENTS.md`.
