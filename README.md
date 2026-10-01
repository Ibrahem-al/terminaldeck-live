# TerminalDeck website

The public site for **TerminalDeck**, a free Windows terminal workspace for running several AI coding
agents side by side. Production: <https://terminaldeck-live.vercel.app/>.

It is one long page plus a user guide:

- **`/`**: the product page. The hero holds the real app, running in your browser on a simulated
  machine (the playable demo), with a "Live demo | Film" tab strip. Then the Notch, agents that
  message each other, the other features, size and speed drawn to scale, the release log, the
  download title block and questions.
- **`/docs`**: the user guide, 12 chapters rendered from Markdown in `src/docs/content/`.

The look is a chart sheet: cool paper (`#EDF2F4`), navy ink, magenta used only for annotations
(leader lines, italic callouts, ratios, focus rings), brass only for the Download action and product
pixels, and the dark product plates (`#0B0F16`) lying on the paper. There is one animated moment
(the hero's notch alert slides down, then the leader lines draw out); every other drawing is static,
and reduced motion shows the hero finished.

## Stack

- Vite 6, React 18, TypeScript, Tailwind CSS v4
- Fonts self-hosted through Fontsource: Archivo (variable, width axis) for all text, IBM Plex Mono
  for literal commands only, Schibsted Grotesk only inside the composited notch (the app's own face)
- `marked` renders the guide chapters
- Two Vite entries: `index.html` and `docs/index.html` (see `vite.config.ts`)

## Develop

```bash
npm install
npm run dev       # http://localhost:4317 (also serves /docs without the trailing slash)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve dist/ on port 4317
```

The build is static with relative asset paths.

## Where things are

| Path | What |
|---|---|
| `src/App.tsx` | Page order: Nav, Hero, Notch, Agents, Features, Numbers, ReleaseLog, Download, Faq, Footer |
| `src/components/sections/` | One file per section |
| `src/components/hero/` | The demo stage: tabs, poster, leader geometry, notch composite, theme picker, film panel |
| `src/components/ui/` | Shared parts: Section, Callout, Leader, DimensionLine, Plate, Button, Kbd |
| `src/lib/facts.ts` | **Every number on the site** (version, date, installer bytes, measurements, release notes). Change facts here, not in the sections. |
| `src/lib/links.ts` | Download, releases, repo and issues links, section ids, media paths |
| `src/lib/demo.ts` | The postMessage client for the demo iframe |
| `src/docs/` | The guide: `DocsApp.tsx`, `Toc.tsx`, `markdown.ts`, `docs.css`, `content/*.md` |
| `vercel.json` | `trailingSlash: false`, the `/docs` rewrite, long cache headers for hashed assets |

Only link the public repo `Ibrahem-al/TerminalDeck`. The code repo is private and must never be
linked.

## Releasing a new version

1. Update `src/lib/facts.ts` (version, date, installer bytes, the new `RELEASES` entry) and the
   `SOUNDING` table in `ReleaseLog.tsx` so the new version gets a place on the date line.
2. Update the JSON-LD and the size in `index.html` (version, date, file size).
3. Re-copy the guide chapters into `src/docs/content/` if the guide changed.

## The playable demo

The hero embeds `./demo/index.html?embed=1`. It is the real TerminalDeck renderer on a simulated
backend, built **separately**:

```bash
npm run build:demo     # builds demo/ into public/demo/
npm run demo:dev       # develop the demo on its own
npm run demo:typecheck
```

- Source: `demo/` (it uses the Vite and TypeScript installed in `../rust_app/node_modules`).
- Output: `public/demo/`, which the site build copies to `dist/demo/`. Rebuild it before building
  the site when the demo changed.
- The site talks to it with `postMessage` (`{ source: 'td-site', type: 'tour' | 'reset' | 'type' |
  'theme' | 'blackout' }`) and listens for `ready`, `tour-step`, `tour-done` and `theme`.
- The hero shows a still (`src/components/hero/demo-poster.webp`) first and mounts the iframe when
  the stage is near the screen and the page is idle. If `public/demo/` is missing, the still stays.
  Below 900 px the still stays and "Open the demo full screen" opens `./demo/` in a new tab.
- The leader lines are measured against the demo's opening screen (`src/components/hero/geometry.ts`).
  If that screen changes, re-measure them and recapture the poster.
- The demo's terminals keep Tab for themselves, so Shift+Esc inside the demo returns focus to the
  controls under it.

## Media

The film and social image live in `public/media/` (served at `./media/`):

| File | Used by |
|---|---|
| `terminaldeck-film.mp4`, `terminaldeck-film.webm`, `poster.jpg` | The hero's Film tab (it checks for the mp4 before showing the player) |
| `terminaldeck-film-720.mp4` | Reserved for a lighter source; not wired up yet |
| `teaser.mp4`, `teaser.webm` | Reserved for a short loop |
| `og-image.png` (1200 × 630) | `og:image` and `twitter:image` in `index.html` |

Every consumer degrades: until the film exists, the Film tab says it isn't published yet.

## Deploy

Vercel builds and deploys **production on every push to `main`**. There is no staging step, so
don't push casually: run `npm run build`, check the page with `npm run preview`, then push.
