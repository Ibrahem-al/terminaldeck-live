import type { Line } from '../Terminal'

/* ─────────────────────────────────────────────────────────────────────────
 * Shared model for the interactive hero simulation.
 *
 * Unlike the static `AppWindow` mock (still used verbatim in other sections),
 * this is a real, drivable miniature of TerminalDeck: clickable deck tabs, a
 * live binary-split pane tree, pane actions (split/close/pin/badge), and
 * terminals you can actually type into. Everything reads/writes one reducer
 * store so the chrome, the panes, the overlays, and the phone mirror stay in
 * lockstep — exactly like the desktop app.
 * ──────────────────────────────────────────────────────────────────────── */

export type PaneKind = 'terminal' | 'agent' | 'editor'

export interface Badge {
  label: string
  color: string
}

/** A committed scrollback entry in a terminal pane. */
export type Block =
  | { id: string; kind: 'cmd'; cwd: string; text: string }
  | { id: string; kind: 'out'; line: Line }
  | { id: string; kind: 'exit'; code: number; took?: string }

export interface SimPane {
  id: string
  kind: PaneKind
  /** Header label, e.g. `pwsh`, `claude`, `rateLimit.ts`. */
  title: string
  /** Working directory shown in the header + prompt. */
  cwd: string
  /** The project root this pane started in — `cd ~` and `ls` resolve against it. */
  root: string
  badge?: Badge
  pinned?: boolean
  /** Committed terminal scrollback (terminal/agent panes). */
  blocks: Block[]
  /** Current prompt input buffer. */
  input: string
  /** Command history (most recent last). */
  history: string[]
  /** -1 when not navigating history. */
  histIndex: number
  /** A simulated command is streaming. */
  busy: boolean
  /** A one-shot intro command that auto-plays once when first in view. */
  intro?: string
  /** Static body for editor panes. */
  editorLines?: Line[]
  /** The terminal has been auto-seeded with intro scrollback already. */
  seeded?: boolean
}

/** Binary split-tree node — the same layout primitive the desktop app uses. */
export type LayoutNode =
  | { id: string; type: 'leaf'; paneId: string }
  | { id: string; type: 'split'; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode }

export interface Deck {
  id: string
  name: string
  color: string
  project: { name: string; color: string }
  tree: LayoutNode
  activePaneId: string
}

export type Overlay = null | 'remote' | 'kanban' | 'settings'

export interface SimState {
  decks: Deck[]
  activeDeckId: string
  panes: Record<string, SimPane>
  overlay: Overlay
  maximized: boolean
  /** Set once the user interacts; cancels all autoplay. */
  touched: boolean
  /** Bumped to nudge the phone mirror / consumers on any pane mutation. */
  rev: number
}
