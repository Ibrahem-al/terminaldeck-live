# TerminalDeck — website

The interactive marketing site for **TerminalDeck**: a private, Windows-native terminal
workspace for running parallel AI coding agents, with a phone app (RemoteDeck) that mirrors and
controls your real terminals from anywhere.

The site is a live, interactive showcase. Instead of static screenshots, it rebuilds the actual
app UI as real React components and drives them with scripted, animated sessions:

- A faithful recreation of the desktop window chrome (project pill, deck tabs, panes, window controls).
- A **live terminal** that types commands and streams ANSI-colored output.
- A **streaming Agent Chat** with tool-activity cards, a composer, and a cost/permission footer.
- An interactive **workspace layout switcher** (Single → Eight panes).
- A real drag-and-drop **kanban** board.
- The **theme gallery** — hover any of the 9 original themes to preview it live across the whole
  page, click to keep it. The same engine and tokens as the app.
- A genuinely navigable **RemoteDeck phone** (tap a session to drive its terminal, tap back), a
  QR pairing wizard, and an animated lock-screen Web Push notification.

Everything recolors live because the design tokens (`src/styles/themes.ts`) are ported verbatim
from the desktop app and applied as CSS custom properties, exactly like the app does.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS v4 (token-driven, `@theme inline`)
- lucide-react · motion · react-markdown · qrcode.react
- Schibsted Grotesk (UI) + IBM Plex Mono (mono), self-hosted via `@fontsource`

## Develop

```bash
npm install
npm run dev      # http://localhost:4317
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

The build is fully static (relative asset paths), so `dist/` can be hosted on any static host.
