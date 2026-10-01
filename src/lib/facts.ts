/**
 * The single source for every fact and number on the site.
 * Source: the product brief (scratchpad/brief/product-brief.md, changelog.md §c).
 * Rules: use these values verbatim; show a ratio only where `ratio` is given here;
 * never claim "X% less RAM than Electron" (no side-by-side measurement exists).
 */

export const PRODUCT = 'TerminalDeck'
export const INTERNAL_NAME = 'quarterdeck'

export const VERSION = '0.3.9'
export const RELEASE_DATE_ISO = '2026-09-27'
export const RELEASE_DATE_LABEL = '27 Sep 2026'
export const RELEASE_TITLE = 'Faster terminals, agent messaging, file drops fixed'

export const INSTALLER = {
  file: 'TerminalDeck-Setup.exe',
  bytes: 6_522_382,
  bytesLabel: '6,522,382 bytes',
  sizeLabel: '6.5 MB',
  arch: 'x64',
  scope: 'For your user account only'
} as const

export const REQUIREMENTS = {
  os: 'Windows 10 or 11',
  osShort: 'Windows 10 and 11',
  runtime: 'WebView2, which Windows 11 already has',
  signing:
    "The installer isn’t Authenticode-signed, so Windows SmartScreen may warn you the first time. Choose More info, then Run anyway.",
  updates: 'In the app, signed with minisign and checked with SHA-512',
  account: 'None. No cloud, no telemetry.'
} as const

export const STACK = {
  label: 'Rust and Tauri 2',
  since: '0.3.2',
  sinceDateLabel: '5 Aug 2026'
} as const

/** Counts. */
export const COUNTS = {
  panesPerDeckMin: 1,
  panesPerDeckMax: 16,
  themes: 9,
  agentTools: 6,
  settingsSections: 14
} as const

export const SHELLS = ['PowerShell', 'PowerShell 7', 'Command Prompt', 'Git Bash'] as const

export const AGENT_CLIS = ['Claude Code', 'Codex', 'Gemini CLI'] as const

/** The Notch, measured on screen. */
export const NOTCH = {
  pillPx: 13,
  alertPx: 34,
  pulldownPx: 720
} as const

/**
 * Measured before/after pairs. Draw each to its own scale: after/before is the length ratio.
 * `ratio` is present only where the brief states it; never compute and display a new one.
 */
export interface Measure {
  id: string
  label: string
  context: string
  before: { value: number; label: string; note?: string }
  after: { value: number; label: string; note?: string }
  ratio?: string
}

export const MEASURES: Measure[] = [
  {
    id: 'installer',
    label: 'Installer download',
    context: 'Electron v0.3.1, then Rust v0.3.9',
    before: { value: 126, label: '126 MB', note: 'Electron v0.3.1' },
    after: { value: 6.5, label: '6.5 MB', note: 'v0.3.9' },
    ratio: 'about 19× smaller'
  },
  {
    id: 'js',
    label: 'JavaScript parsed before the first terminal paints',
    context: 'v0.3.3',
    before: { value: 4300, label: '4.3 MB' },
    after: { value: 554, label: '554 KB' }
  },
  {
    id: 'echo',
    label: 'Main-thread time for 50 keystroke echoes',
    context: 'v0.3.9',
    before: { value: 46.3, label: '46.3 ms' },
    after: { value: 13.7, label: '13.7 ms' },
    ratio: '3.4× faster'
  },
  {
    id: 'spin',
    label: 'Six spinning panes, per 60 frames',
    context: 'Main-thread time, v0.3.9',
    before: { value: 300, label: '300 ms' },
    after: { value: 42, label: '42 ms' },
    ratio: '7.1× faster'
  },
  {
    id: 'tree',
    label: 'File tree holding 10,000 files',
    context: 'Retained heap, v0.3.6. It mounts 43 rows instead of 10,000.',
    before: { value: 55, label: '55 MB' },
    after: { value: 2, label: '2 MB' }
  }
]

/**
 * Behaviour details the brief doesn't spell out, each verified in the understand reports
 * (scratchpad/understand/features-*.md), which cite the app's source.
 */
export const MESSAGING = {
  /** The claude/codex wrappers that hand over the tools, and message delivery, exist only in these shells
   *  (features-agents.md §1 and §4: integration.ps1 / integration.bash; cmd has no shell integration). */
  shells: 'PowerShell or Git Bash',
  /** Loop guard (features-agents.md §4 "Governor", delivery.rs:673-713). */
  loopPair: { messages: 8, minutes: 2 },
  loopAll: { messages: 60, minutes: 10 },
  /** A queued message expires after 10 minutes (features-agents.md §4, TTL 10 min; drawer "expired — not delivered in 10 minutes"). */
  queueMinutes: 10
} as const

export const THEME_DETAILS = {
  /** Each theme carries a full 16-colour ANSI palette (features-workspace.md §12, themes.ts:1-5). */
  ansiColours: 16,
  /** Hovering a theme card in Settings previews it across the whole app (features-workspace.md §12, store/theme.ts:27-94). */
  livePreview: 'Hover one in Settings and the whole app changes live.'
} as const

/** Single measured facts (no pair to draw). */
export const SINGLE_FACTS = {
  backendMemory: '7–15 MB',
  wrongGlyphsNow: '0 px',
  wrongGlyphsBefore: '12k–76k px',
  idleWakeups: '20 times a second',
  treeRowsMounted: 43,
  treeFiles: 10_000,
  phoneServerMb: '~40 MB',
  installerBeforeOnDemandPhoneServer: '34 MB'
} as const

export interface Release {
  version: string
  dateIso: string
  dateLabel: string
  title?: string
  notes: string[]
}

/** User-facing changelog, newest first. `open_pane` is unreleased: never list it as shipped. */
export const RELEASES: Release[] = [
  {
    version: '0.3.9',
    dateIso: '2026-09-27',
    dateLabel: '27 Sep 2026',
    title: 'Faster terminals, agent messaging, file drops fixed',
    notes: [
      'Agents can message each other with `send_message` and `list_messages`. A message is typed only into an agent that is idle with an empty input box. Every message is logged in the Messages drawer (Ctrl+Shift+X) and flies between panes as it goes.',
      'Updates are signed.',
      'The phone server downloads when you first need it, so the installer went from 34 MB to 6.5 MB.',
      'Run `claude` in a terminal pane; the Notch, deck tools, smart names and keep-awake all work there.',
      'Terminals redraw far less per frame.',
      'Dragging files from Explorer into a terminal pastes their paths again.',
      "Codex gets TerminalDeck’s tools automatically."
    ]
  },
  {
    version: '0.3.8',
    dateIso: '2026-09-23',
    dateLabel: '23 Sep 2026',
    notes: [
      'Phone access rebuilt on the T3 Code app.',
      'Restored panes start as a fresh shell. For Claude, a bar offers Resume conversation or New conversation; it never resumes on its own, because resuming counts toward your usage.',
      'History from before a restart is opt-in.',
      'Fixed a stray `[C` typed on click.'
    ]
  },
  {
    version: '0.3.7',
    dateIso: '2026-09-15',
    dateLabel: '15 Sep 2026',
    notes: ["Ctrl+click opens terminal hyperlinks, including Codex’s labelled links."]
  },
  {
    version: '0.3.6',
    dateIso: '2026-09-08',
    dateLabel: '8 Sep 2026',
    notes: [
      'Settings opens as its own deck.',
      "What you type before the shell’s first prompt is kept and sent once it’s ready; Ctrl+C works immediately.",
      'The file tree only renders the rows you can see.'
    ]
  },
  {
    version: '0.3.5',
    dateIso: '2026-09-05',
    dateLabel: '5 Sep 2026',
    notes: [
      "Second performance pass: each pane’s output travels on its own channel.",
      'Panes name themselves, and deck tools ship: agents can list, read and type into other panes.'
    ]
  },
  {
    version: '0.3.4',
    dateIso: '2026-08-07',
    dateLabel: '7 Aug 2026',
    notes: ['Blackout: the screen goes black when you walk away and wakes on the first key.']
  },
  {
    version: '0.3.3',
    dateIso: '2026-08-06',
    dateLabel: '6 Aug 2026',
    notes: ['Opens about 4× lighter.', 'File work moved off the UI thread, and terminals stop blocking each other.']
  },
  {
    version: '0.3.2',
    dateIso: '2026-08-05',
    dateLabel: '5 Aug 2026',
    notes: [
      'Rebuilt on Rust and Tauri. It replaces the Electron app in place, with the same data and the same shortcuts.',
      'Asks before closing a deck or a pane.'
    ]
  }
]

/** One-line product description (meta, footer, JSON-LD). */
export const TAGLINE =
  'A Windows terminal workspace for people who run several AI coding agents at once. Local only: no account, no cloud, no telemetry.'
