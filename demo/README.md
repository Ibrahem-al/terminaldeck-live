# TerminalDeck web demo

A playable copy of the TerminalDeck app for the website. It runs the **real renderer**
(`rust_app/src`: React + Zustand + xterm.js + lazy Monaco), unmodified, inside iframes. A
simulated Rust backend written in TypeScript answers every Tauri `invoke` and emits every
event. Because the UI is the real renderer, the demo looks and behaves like the app. The
work in this folder is the backend: a virtual Windows machine, its PTYs and shells, the
agent TUIs, the notch controller, deck tools, and a "desktop" host page.

No rust_app source is copied here. The build reads it from `../../rust_app`, which must sit
next to `website/` (it does in `C:\dev\projects\terminaldeck_fable`).

## Commands (run from `website/`)

| What | Command |
|---|---|
| Dev server, http://127.0.0.1:5301/ | `npm run demo:dev` |
| Dev server on another port | `npm run demo:dev -- --port 5302` |
| Production build → `public/demo/` | `npm run build:demo` |
| Serve the build (open http://127.0.0.1:5301/demo/) | `npm run demo:preview` |
| Type-check the demo | `npm run demo:typecheck` |

Every script runs **rust_app's** Vite 7 and TypeScript (`node ../rust_app/node_modules/...`),
so nothing is installed in rust_app and the website's own toolchain (Vite 6) is never used for
the demo. The site's `tsc -b && vite build` does not see `demo/` (its tsconfig includes only
`src/`). `public/demo/` is committed, because Vercel builds only the website repo and serves
it at `/demo/`.

## Layout

```
index.html        host "desktop" (host/main.ts): the backend, the app + notch iframes, taskbar, blackout
app.html          one app window (boot/app.ts → rust_app/src/main.tsx); ?label=win-2 = secondary
notch.html        the notch overlay (boot/notch.ts → rust_app/src/notch/main.tsx)
boot/frame.ts     per-iframe boot: __QD_BOOT, mockWindows(label), mockIPC → parent.__tdBackend
backend/          the simulated Rust process; backend/contracts.ts is the map of who owns what
host/             desktop UI in plain TS/CSS: window manager, notch placement, blackout, tour host, postMessage API
scenario/         the seed: machine, projects, session (decks/panes), files manifest, smart names
```

Boot order: `host/main.ts` creates the one backend (`window.__tdBackend`) *before* any iframe
loads. Each frame's boot sets `window.__QD_BOOT = { platform: 'win32', windowsBuild: 26200, role }`,
calls `mockWindows(label)`, then installs `mockIPC`. The four `plugin:event|*` commands go to
the backend's EventBus, which honours Tauri's `emit` / `emit_to` target rules. We don't use
the mocks' `shouldMockEvents`, which ignores targets and leaks listeners. Everything else is
forwarded to `backend.invoke(label, cmd, args)`. Only then does the frame `import()` the real
entry. When `app.html` is opened on its own with no parent backend, it creates its own backend
and still works.

Unknown commands log `[demo] unhandled command <name>` once and resolve `null`.

## Build configuration notes (vite.config.ts)

- **Tailwind source scanning.** `global.css` says `@import 'tailwindcss'` with automatic
  source detection, and `@tailwindcss/vite` scans from the Vite root (`demo/`). A small
  pre-transform rewrites that one import to `@import 'tailwindcss' source('<rust_app>')`, so
  the classes come from the renderer's own files. If the import ever changes, the build fails
  loudly. Proof: `.playwright-mcp/demo/core-01-boot.png` matches
  `.playwright-mcp/understand/01-workspace-quad.png`.
- **One React.** plugin-react adds react, react-dom and the JSX runtimes to the optimizer's
  `include`, and those resolve from the Vite root. That root would find the *website's* React,
  giving two Reacts and an "Invalid hook call" blank screen. The react family is aliased to
  rust_app's files.
- **Bare imports in demo/** (`@tauri-apps/api/mocks`, …) resolve as if the renderer imported
  them, so the demo and the app share one copy of each package.
- Don't add a catch-all alias for bare ids. Vite's `@vite/env` / `@vite/client` aliases come
  after user aliases, and the Monaco `?worker` imports get registered as broken optimized deps.
- `base: './'` makes the build work at `/demo/` and from any static server. Fonts are
  preloaded with relative hrefs.

## Automation hooks (QA, tour, website)

- `window.__tdBackend` (host): the Backend. Examples: `__tdBackend.pty.byPane('p4').replay().data`,
  `__tdBackend.blackout.start()`, `__tdBackend.onInvoke(...)`, `__tdBackend.events.tap(...)`.
- `window.__tdHost` (host): the HostBridge. `__tdHost.app()` returns the main window's renderer
  stores. It also has `windows.minimize('main')` and `reset()`.
- `window.__td` / `window.__tdReady` (inside each app frame) hold the renderer's own store
  modules: workspace, settings, projects, explorer, editor, theme, toasts, paneMessages,
  ptySessions, paneCwd, blackout, layout, inputBus. These are the same instances the app uses.
- postMessage (same origin only). The site sends `{ source: 'td-site', type: 'tour' | 'reset' |
  'type' | 'theme' | 'blackout' | 'focus', … }`. The demo answers with `{ source: 'td-demo',
  type: 'ready' | 'tour-step' | 'tour-done' | 'theme' }`. `?embed=1` hides host chrome that
  doesn't belong inside the website frame.

State persists in `sessionStorage` (keys `td-demo:*`) for the tab. **Reset demo** (taskbar,
closed-window card, or `{type:'reset'}`) wipes it, blocks the renderer's unload-time save from
writing it back, and reloads with the seed.

## Module ownership

`backend/contracts.ts` defines every seam, and each module owns one file or folder:
`backend/vfs/`, `backend/pty/`, `backend/shell/`, `backend/programs/`, `backend/notch.ts`,
`backend/decktools.ts`, `backend/phone.ts`, `backend/misc.ts`, `host/tour.ts`. A module talks to
another only through `backend.<service>`, never by importing its file. QA hooks for the console
live on `__tdBackend.dev` (`.notch.raise(…)`, `.deck.send(…)`) and `__tdHost.tour.start()`.
