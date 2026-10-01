/**
 * The seams of the simulated TerminalDeck backend.
 *
 * The web demo runs the REAL renderer (rust_app/src) unmodified inside iframes;
 * everything the Rust side does is answered from here, in the host document,
 * by one `Backend` instance. This file is the contract every backend module is
 * written against. Stage-2 builders implement one module each without talking
 * to each other, so:
 *
 *  - Talk to another module ONLY through the interfaces below (`backend.vfs`,
 *    `backend.pty`, `backend.notch`, …), never by importing its file.
 *  - A module factory runs while the backend is still being constructed: it
 *    must not touch another service until `start()` or until a command/call
 *    arrives. Services are wired lazily through the `Backend` it is handed.
 *  - Payloads crossing into an iframe are plain JSON-like data. PTY output is
 *    always a `string` (never a host-realm ArrayBuffer — see mock-events.md §4d).
 *  - Nothing here may import from rust_app/src at runtime except through the
 *    renderer's own stores, which are reached via `HostBridge.app(label)`.
 *
 * Who owns what (the file that implements each seam):
 *
 *  | Seam              | File                         |
 *  |-------------------|------------------------------|
 *  | Backend, router   | backend/index.ts             |
 *  | EventBus          | backend/events.ts            |
 *  | Clock, Storage    | backend/runtime.ts           |
 *  | StateService, BlackoutService | backend/state.ts |
 *  | WindowService     | backend/windows.ts           |
 *  | Vfs, GitRepo      | backend/vfs/index.ts         |
 *  | PtyManager        | backend/pty/index.ts         |
 *  | ShellFactory      | backend/shell/index.ts       |
 *  | ProgramRegistry   | backend/programs/index.ts    |
 *  | NotchController   | backend/notch.ts             |
 *  | DeckTools         | backend/decktools.ts         |
 *  | PhoneService      | backend/phone.ts             |
 *  | MiscService       | backend/misc.ts              |
 *  | HostBridge        | host/bridge.ts               |
 *  | TourRunner        | host/tour.ts                 |
 */
import type {
  AppSettings,
  DeckAgent,
  DeckContextMode,
  DeckContextResult,
  DeckMessage,
  DeckMessageReason,
  DeckMessageStatus,
  DeckOpenRequest,
  DeckOpenResult,
  DeckPaneInfo,
  FsEntry,
  NotchAgentSignal,
  NotchJumpTarget,
  NotchStatePayload,
  PaneSessionInfo,
  Project,
  PtySpawnOptions,
  ShellInfo,
  ShellKind,
  TaskCompletePayload
} from '@shared/types'

/* ═══════════════════════════ frames & IPC ═══════════════════════════ */

/**
 * A Tauri window label. `main` is the primary app window, `win-2`, `win-3`…
 * are extra app windows (role `secondary`), `notch` is the notch overlay.
 */
export type WindowLabel = string

export type FrameRole = 'primary' | 'secondary' | 'notch'

/** The label of the primary app window and of the notch overlay. */
export const MAIN_LABEL = 'main'
export const NOTCH_LABEL = 'notch'

/**
 * Storage key of a Claude Code conversation's transcript — the demo's
 * `~/.claude/projects/…/<id>.jsonl`. Written by the Claude TUI after each
 * turn; its presence is what makes a restored pane offer "Resume conversation".
 */
export const claudeConversationKey = (claudeSessionId: string): string => `claude:conv:${claudeSessionId}`

/**
 * What `pty_create` hands us as `args.output`: the iframe-realm Tauri
 * `Channel`. Deliver a frame by calling `channel.onmessage(frame)` (always
 * through the property — the bridge assigns it after construction).
 */
export interface ChannelLike<T> {
  onmessage: (message: T) => void
}

/**
 * One PTY output frame, exactly what Rust puts on the channel: text as a
 * string, or `{ exit }` as the last frame. (Rust can also send raw bytes; the
 * demo never does — strings are realm-safe.)
 */
export type PtyFrame = string | { exit: number }

/** Where an invoke came from. */
export interface InvokeContext {
  /** Label of the frame that invoked (`main`, `win-2`, `notch`). */
  label: WindowLabel
  backend: Backend
}

/**
 * One Tauri command. `args` is the renderer's live argument object, exactly as
 * the bridge built it (camelCase keys; e.g. `{ sessionId, data }`). Never
 * mutate it and copy anything you keep. Return plain data (the router clones
 * it, like IPC would) or a Promise of it. Throw (or reject) with a string or an
 * Error to make the invoke reject — the router rejects with a string, the way a
 * Rust `Err(String)` arrives.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandHandler<A = any, R = unknown> = (args: A, ctx: InvokeContext) => R | Promise<R>

/** `{ commandName: handler }`. The router merges every module's map. */
export type CommandModule = Record<string, CommandHandler>

/**
 * What every module factory returns. `service` is published on the backend
 * (e.g. `backend.vfs`); `commands` are merged into the router.
 */
export interface ModuleInstance<S> {
  service: S
  commands: CommandModule
  /** Called once after every module is constructed — cross-module wiring goes here. */
  start?(): void
  /** A frame (re)attached — e.g. the app iframe loaded or reloaded. */
  frameAttached?(label: WindowLabel): void
  /**
   * A frame went away (closed window, reload, navigation). Drop everything
   * tied to it: its PTY sessions' channels, its reports, its listeners.
   */
  frameDetached?(label: WindowLabel): void
}

/** The signature of every module's factory, e.g. `createVfs(backend)`. */
export type ModuleFactory<S> = (backend: Backend) => ModuleInstance<S>

/* ═══════════════════════════════ Backend ═══════════════════════════════ */

/**
 * The simulated Rust process. One instance lives in the host document as
 * `window.__tdBackend`; every iframe forwards its invokes here (boot/frame.ts).
 */
export interface Backend {
  /** The simulated app version, `'0.3.9'`. */
  readonly version: string
  readonly events: EventBus
  readonly storage: DemoStorage
  readonly clock: Clock
  readonly scenario: Scenario
  /**
   * The host page (window manager, notch placement, blackout cover…). A no-op
   * bridge until host/main.ts installs the real one right after construction
   * (and for good when standalone) — so read `backend.host` at call time,
   * never cache it in a factory.
   */
  readonly host: HostBridge

  readonly state: StateService
  readonly blackout: BlackoutService
  readonly windows: WindowService
  readonly vfs: Vfs
  readonly pty: PtyManager
  readonly shells: ShellFactory
  readonly programs: ProgramRegistry
  readonly notch: NotchController
  readonly deck: DeckTools
  readonly phone: PhoneService
  readonly misc: MiscService
  /** QA hooks modules publish for the console (`__tdBackend.dev.notch`, `.deck`). */
  dev?: Record<string, unknown>

  /** Register a frame's window (boot/frame.ts calls this before the renderer loads). */
  attach(label: WindowLabel, win: Window): void
  /** Forget a frame. With `win`, only if that exact window is still the attached one. */
  detach(label: WindowLabel, win?: Window): void
  /** The attached window for a label (for `runCallback`, realm-correct constructors). */
  frame(label: WindowLabel): Window | undefined
  /** Labels of every attached frame, in attach order. */
  frames(): WindowLabel[]

  /**
   * Route one invoke. Unknown commands warn once (`[demo] unhandled command`)
   * and resolve `null`. Resolves on a later microtask, like real IPC.
   */
  invoke(label: WindowLabel, cmd: string, args: unknown): Promise<unknown>
  /** Merge a module's commands into the router (later registrations win). */
  register(moduleName: string, commands: CommandModule): void
  /** Observe every routed invoke (QA, the host's "ready" detection). */
  onInvoke(cb: (label: WindowLabel, cmd: string, args: unknown) => void): () => void
  /** Install the host bridge (host/main.ts does this right after construction). */
  setHost(host: HostBridge): void
}

/* ═══════════════════════════════ events ═══════════════════════════════ */

/**
 * Tauri's listener target. The bridge's `on()` registers `{ kind: 'Any' }`,
 * `onThisWindow()` registers `{ kind: 'AnyLabel', label }`.
 */
export type TauriEventTarget = { kind: 'Any' } | { kind: 'AnyLabel'; label: string } | { kind: string; label?: string }

/** `plugin:event|listen` args as the event module sends them. */
export interface ListenArgs {
  event: string
  target?: TauriEventTarget
  /** Callback id from `transformCallback` in that frame. */
  handler: number
}

/** `plugin:event|unlisten` args. */
export interface UnlistenArgs {
  event: string
  eventId: number
}

/**
 * Tauri's event system, honouring target semantics (mock-events.md §4c):
 * `emit` reaches every listener in every frame; `emitTo(label)` reaches that
 * label's `AnyLabel` listeners AND every frame's `Any` listeners (Tauri's
 * `match_any_or_filter` short-circuit). Delivery runs the frame's
 * `__TAURI_INTERNALS__.runCallback(id, { event, id, payload })` on a
 * microtask, in emit order; the payload is structured-cloned per delivery.
 */
export interface EventBus {
  listen(label: WindowLabel, args: ListenArgs): number
  unlisten(label: WindowLabel, args: UnlistenArgs): void
  /** `app.emit(event, payload)` — every window. */
  emit(event: string, payload?: unknown): void
  /** `app.emit_to(label, event, payload)`. */
  emitTo(label: WindowLabel, event: string, payload?: unknown): void
  /** Whether `label` has at least one live listener for `event` (e.g. is the gate listener up yet?). */
  hasListener(label: WindowLabel, event: string): boolean
  /** Drop every listener of a frame (it reloaded or closed). */
  resetFrame(label: WindowLabel): void
  /** Observe every emit (QA / tour). `to` is null for a broadcast. */
  tap(cb: (event: string, payload: unknown, to: WindowLabel | null) => void): () => void
}

/* ═══════════════════════════ runtime services ═══════════════════════════ */

/**
 * Tab-session persistence (sessionStorage, keys prefixed `td-demo:`), so a
 * reload of the demo keeps what the visitor did; "Reset demo" wipes it.
 * Values are JSON. Never throws (quota / disabled storage just stop saving).
 */
export interface DemoStorage {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  remove(key: string): void
  /** Remove every demo key. */
  clear(): void
  /**
   * Remove every demo key and ignore every later write until the page
   * reloads. Reset uses this: the renderer saves its session while unloading,
   * which would otherwise write the old workspace straight back.
   */
  wipe(): void
}

/**
 * A group of timers that PAUSE while the demo tab is hidden (`document.hidden`
 * of the host) and resume with their remaining time — nothing simulated may run
 * while nobody is looking. `dispose()` clears everything in the group; after
 * that `sleep()` never resolves, so an async program simply stops.
 */
export interface Timers {
  setTimeout(fn: () => void, ms: number): number
  setInterval(fn: () => void, ms: number): number
  clear(id: number): void
  /** Resolves after `ms` of visible time; never resolves once the group is disposed. */
  sleep(ms: number): Promise<void>
  dispose(): void
  readonly disposed: boolean
}

export interface Clock {
  /** A fresh timer group (one per program run / session / flow). */
  group(): Timers
  /** True while the host tab is hidden. */
  readonly paused: boolean
  onPauseChange(cb: (paused: boolean) => void): () => void
  now(): number
}

/* ═══════════════════════════════ scenario ═══════════════════════════════ */

/** The simulated Windows machine. */
export interface Machine {
  user: string
  /** COMPUTERNAME, also the Git Bash prompt host (`dev@HARBOR MINGW64 …`). */
  hostname: string
  home: string
  projectsDir: string
  windowsBuild: number
  osName: string
  shells: ShellInfo[]
  /** Base environment of every new shell (project env vars are layered on top by the renderer). */
  env: Record<string, string>
  /** `node -v`, `git --version`, … — shells and programs print these. */
  versions: Record<string, string>
}

/** One file in the seed file system. `content` omitted = the vfs builder generates it. */
export interface SeedFile {
  /** Windows path relative to `root` (backslashes). */
  path: string
  content?: string
  /** Epoch ms; default: the scenario's clock. */
  mtime?: number
}

export interface SeedRepo {
  /** Absolute repo root. */
  root: string
  branch: string
  remote?: { name: string; url: string; ahead: number; behind: number }
  /** Oldest first. The last commit is HEAD. */
  commits: Array<{ message: string; author: string; email: string; daysAgo: number; files: string[] }>
  /** Paths (repo-relative, forward slashes) whose working copy differs from HEAD at boot. */
  dirty?: string[]
  /** repo-relative path → its text at HEAD, for each `dirty` path. */
  headTexts?: Record<string, string>
  /** Paths untracked at boot. */
  untracked?: string[]
  /** Other local branches, pointing at HEAD~behind of the seed history. */
  otherBranches?: Array<{ name: string; behind: number }>
}

export interface SeedTree {
  /** Absolute directory the `files` are relative to. */
  root: string
  files: SeedFile[]
  /** Empty directories to create. */
  dirs?: string[]
}

export interface Scenario {
  machine: Machine
  projects: Project[]
  /** The renderer's `SessionState` (src/session.ts) restored on first load. */
  session: SeedSessionState
  /** Settings layered over DEFAULT_SETTINGS on first load (per section). */
  settings: { [K in keyof AppSettings]?: Partial<AppSettings[K]> }
  trees: SeedTree[]
  repos: SeedRepo[]
  /**
   * Canned "Smart" pane names by pane id (misc.ts answers pane_names_summarize
   * with these). Each applies only once its `when` shows up in the pane's
   * output — a name describes work that happened on screen, never the plan.
   */
  smartNames: Record<string, Array<{ name: string; when: RegExp }>>
}

/** Mirror of `SessionState` in rust_app/src/session.ts (not exported there). */
export interface SeedSessionState {
  v: 1
  tabs: Array<{
    id: string
    name: string
    color: string
    layout: LayoutNode
    activePaneId: string
    projectId?: string
    hidden?: string[]
    zoomedPaneId?: string
  }>
  panes: Record<
    string,
    {
      id: string
      kind: 'terminal' | 'editor'
      name: string
      shell?: ShellKind
      cwd?: string
      autoRun?: string
      badge?: { label: string; color: string }
      pinned?: boolean
      nameLocked?: boolean
    }
  >
  activeTabId: string
  spawnDefaults: { cwd?: string; shell?: ShellKind }
  activeProjectId: string | null
  explorerRoot: string | null
  editorFiles: Record<string, string[]>
  editorActive: Record<string, string | null>
}

/** Mirror of `LayoutNode` in rust_app/src/components/workspace/layout.ts. */
export type LayoutNode =
  | { type: 'pane'; paneId: string }
  | { type: 'split'; id: string; direction: 'row' | 'column'; ratio: number; a: LayoutNode; b: LayoutNode }

/* ═════════════════════════════ app state ═════════════════════════════ */

/** settings / projects / session / updater / notify / power (backend/state.ts). */
export interface StateService {
  /** The current settings (full shape — DEFAULT_SETTINGS merged with the scenario and saves). */
  settings(): AppSettings
  /** Fires after every `settings_save` (and on reset) with the new and previous settings. */
  onSettings(cb: (next: AppSettings, prev: AppSettings) => void): () => void
  projects(): Project[]
  project(id: string): Project | undefined
  /** The saved renderer session (what `session_load` returns). */
  session(): unknown
}

/** Screen blackout (backend/state.ts). The host draws the cover. */
export interface BlackoutService {
  readonly active: boolean
  /** Black out now (`blackout_now`, idle timer, tour). Emits `blackout:state` true. */
  start(reason?: 'manual' | 'idle'): void
  /** Lift it (host input after the grace, a question wake…). Emits `blackout:state` false. */
  lift(): void
  onChange(cb: (active: boolean) => void): () => void
}

/** window_* and plugin:window|* (backend/windows.ts); the host does the drawing. */
export interface WindowService {
  /** App window labels currently open (never `notch`). */
  labels(): WindowLabel[]
  isMaximized(label: WindowLabel): boolean
  /** Tell a window its maximized state changed (emits `window:maximized`). */
  notifyMaximized(label: WindowLabel, maximized: boolean): void
  /** Start the close handshake: emits `window:close-request` to that window. */
  requestClose(label: WindowLabel): void
}

/* ═══════════════════════════════ files ═══════════════════════════════ */

export type VfsErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY' | 'EINVAL' | 'EACCES'

/** What every failing Vfs call throws: an `Error` with a code and the offending path. */
export interface VfsError extends Error {
  code: VfsErrorCode
  path: string
}

export function isVfsError(e: unknown): e is VfsError {
  return e instanceof Error && typeof (e as Partial<VfsError>).code === 'string' && 'path' in e
}

export interface VfsStat {
  /** Absolute path in its stored case. */
  path: string
  name: string
  isDir: boolean
  /** Bytes (UTF-8) for files, 0 for directories. */
  size: number
  mtime: number
  /** Dot-files and `node_modules`-style entries the tree hides unless "show hidden". */
  hidden: boolean
}

export interface VfsChange {
  kind: 'create' | 'write' | 'delete' | 'rename'
  path: string
  /** For renames. */
  oldPath?: string
  isDir: boolean
}

/**
 * The virtual Windows file system (backend/vfs). Synchronous and in memory;
 * persisted to DemoStorage as a diff against the seed. Paths are Windows paths
 * (`C:\Users\dev\projects\harbor\api\src\server.ts`): case-insensitive,
 * case-preserving, `\` or `/` accepted on input, `\` on output.
 *
 * Every mutation notifies `onChange` subscribers AND, through the fs_* watch
 * registry this module owns, emits `fs:changed` (parent dirs) / `fs:file-changed`
 * (watched files) to the windows that asked — so an agent's edit shows up live
 * in the sidebar and in an open editor tab.
 */
export interface Vfs {
  // ── path helpers (pure string ops, no I/O) ──
  /** `c:/Users/dev/./a/../b/` → `C:\Users\dev\b`. */
  normalize(path: string): string
  join(...parts: string[]): string
  dirname(path: string): string
  basename(path: string): string
  /** `.ts` (with the dot), '' when none. */
  extname(path: string): string
  isAbsolute(path: string): boolean
  /**
   * Resolve what a user typed against a cwd: relative paths, `.`/`..`, `~`
   * (home), drive-absolute (`C:\x`, `c:/x`), root-relative (`\x`), and MSYS
   * paths (`/c/Users/dev`, `~/projects`) from Git Bash.
   */
  resolve(cwd: string, input: string): string
  /** `relative('C:\a', 'C:\a\b\c')` → `b\c`. */
  relative(from: string, to: string): string
  /** `C:\Users\dev` → `/c/Users/dev` (Git Bash display). */
  toPosix(path: string): string
  /** Comparison key: lower-case, `\` separators, no trailing separator (except a drive root). */
  key(path: string): string

  // ── queries ──
  exists(path: string): boolean
  stat(path: string): VfsStat | null
  /** The app's `FsEntry[]` shape, in fs_read_dir's order. Throws ENOENT / ENOTDIR. */
  readDir(dir: string, opts?: { showHidden?: boolean }): FsEntry[]
  /** Throws ENOENT / EISDIR. */
  readFile(path: string): string

  // ── mutations (each notifies watchers) ──
  /** Creates or overwrites. `createDirs` makes missing parents. */
  writeFile(path: string, content: string, opts?: { createDirs?: boolean }): void
  mkdir(path: string, opts?: { recursive?: boolean }): void
  /** Directories need `recursive` unless empty. */
  remove(path: string, opts?: { recursive?: boolean }): void
  rename(from: string, to: string): void
  /** Copy a file or a directory tree to the exact destination path. */
  copy(src: string, dest: string): void

  // ── search ──
  /** File-name search under `root`, as fs_search / Quick Open want it (absolute paths, best first). */
  search(root: string, query: string, opts?: { showHidden?: boolean; limit?: number }): string[]
  /** Content search for agents, `Select-String`, `grep`. Lines are 1-based. */
  grep(
    root: string,
    pattern: string | RegExp,
    opts?: { glob?: string; limit?: number; ignoreCase?: boolean }
  ): Array<{ path: string; line: number; text: string }>

  onChange(cb: (changes: VfsChange[]) => void): () => void

  /** The git repository containing `path`, if any (scenario repos only). */
  git(path: string): GitRepo | null
}

export interface GitCommit {
  hash: string
  short: string
  author: string
  email: string
  /** Epoch ms. */
  date: number
  message: string
  /** Repo-relative paths (forward slashes) touched by the commit. */
  files: string[]
}

/** Porcelain-style status of one path (repo-relative, forward slashes). */
export interface GitFileStatus {
  path: string
  /** X: the index column. ' ' unchanged, 'M', 'A', 'D', 'R', '?' untracked. */
  index: ' ' | 'M' | 'A' | 'D' | 'R' | '?'
  /** Y: the work-tree column. */
  worktree: ' ' | 'M' | 'D' | '?'
}

/** One file's change, as texts — format it with backend/util/diff.ts. */
export interface GitFileDiff {
  path: string
  /** null = the file did not exist on that side. */
  oldText: string | null
  newText: string | null
}

/**
 * A scenario repository, consistent with the Vfs: HEAD is a snapshot of file
 * texts; `status()`/`diff()` compare HEAD, the index and the working copy, so
 * an agent's edit shows up in `git status` and a commit clears it.
 */
export interface GitRepo {
  readonly root: string
  currentBranch(): string
  branches(): string[]
  /** `git checkout [-b] name`. Throws on an unknown branch without `create`. */
  checkout(branch: string, create?: boolean): void
  status(): GitFileStatus[]
  diff(opts?: { staged?: boolean; paths?: string[] }): GitFileDiff[]
  /** Newest first. */
  log(limit?: number): GitCommit[]
  /** `git add`; `['.']` or `['-A']` = everything. */
  add(paths: string[]): void
  /** Commits the index. Throws `nothing to commit` when the index is clean (unless `allowEmpty`). */
  commit(message: string, opts?: { allowEmpty?: boolean }): GitCommit
  /**
   * The upstream (for `git status` / `git push`); `name` is the tracking ref
   * (`origin/main`), `url` the remote's URL. null = the branch was never pushed.
   */
  upstream(): { name: string; url: string; ahead: number; behind: number } | null
  /** Pretend push: ahead → 0. Returns how many commits went up. */
  push(): number
  /** Paths in HEAD or the index (repo-relative) — lets status collapse a wholly untracked folder to `dir/`. */
  tracked?(): string[]
  /** `git push origin <new-branch>` without `-u`: the remote has it, but nothing tracks it. */
  forgetUpstream?(): void
}

/* ═════════════════════════════════ PTY ═════════════════════════════════ */

/** Who typed: the pane itself, the notch mini terminal, deck tools, the tour, a program. */
export type InputSource = 'pane' | 'notch' | 'deck' | 'tour' | 'program'

/**
 * One live terminal session — the simulated ConPTY + its shell. Created by
 * `pty_create` (backend/pty). Output goes to the owning pane's channel, to the
 * ring buffer mirrors replay from, and to `onOutput` subscribers (the notch).
 */
export interface PtySession {
  /** The id the renderer knows (`PtySession.sessionId` in shared/types). */
  readonly id: string
  /** Owning window. */
  readonly label: WindowLabel
  /** The pane (`restoreKey`), when the pane passed one. */
  readonly paneId?: string
  readonly kind: ShellKind
  /** OSC 133 integration: true for powershell/pwsh/gitbash, false for cmd. */
  readonly integrated: boolean
  readonly env: Readonly<Record<string, string>>
  readonly createdAt: number
  /** `claudeSessionId` from the spawn options, if the pane chose one. */
  readonly claudeSessionId?: string
  /** Current size (last `pty_resize`). */
  readonly cols: number
  readonly rows: number
  /** Current working directory; the shell keeps it up to date. */
  cwd: string
  readonly alive: boolean
  readonly exitCode: number | null
  /** Cumulative UTF-8 bytes output so far — Rust's `seq`. */
  readonly seq: number
  /** The interpreter bound to this session at spawn. */
  readonly shell: Shell

  /**
   * OUTPUT: text the child printed (ANSI allowed). Sent as a string frame to
   * the pane, appended to the ring, `seq` advanced by its UTF-8 length, then
   * `onOutput` fires. Ignored after exit. Emit at TTY-like pace: many small
   * writes per frame are fine, megabytes in a loop are not.
   */
  write(data: string): void
  /**
   * INPUT: keystrokes/paste as the terminal would send them (`\r` for Enter,
   * `\x03` Ctrl+C, `\x1b[A` up, bracketed paste `\x1b[200~…\x1b[201~`).
   * Routed to the shell, which forwards to its foreground program.
   */
  input(data: string, source?: InputSource): void
  /**
   * Output since `since` (a seq) for a mirror to replay. `reset` is true when
   * `since` fell out of the ring (then `data` is the whole ring).
   */
  replay(since?: number): { data: string; headSeq: number; reset: boolean }
  /** End the session: `{ exit: code }` is the last frame; onExit fires. Idempotent. */
  exit(code: number): void
  onExit(cb: (code: number) => void): () => void
  onResize(cb: (cols: number, rows: number) => void): () => void
  onOutput(cb: (data: string, seq: number) => void): () => void
}

/** Lifecycle events every interested module can observe without owning sessions. */
export type PtyEvent =
  | { type: 'created'; session: PtySession }
  | { type: 'input'; session: PtySession; data: string; source: InputSource }
  | { type: 'output'; session: PtySession; data: string; seq: number }
  | { type: 'resize'; session: PtySession; cols: number; rows: number }
  | { type: 'exit'; session: PtySession; code: number }

/**
 * Owns every PtySession and the pty_* commands (pty_create, pty_write,
 * pty_resize, pty_kill, pty_ack, pty_set_visible, pty_scrollback,
 * pty_prune_scrollback, pty_set_launched_claude, pty_adopt, pty_shells).
 */
export interface PtyManager {
  get(sessionId: string): PtySession | undefined
  /** The live session of a pane id (the pane's `restoreKey`). */
  byPane(paneId: string): PtySession | undefined
  /** Every live session, optionally only one window's. */
  list(label?: WindowLabel): PtySession[]
  /** `pty_write` equivalent — also what deck tools and the tour use. */
  write(sessionId: string, data: string, source?: InputSource): void
  kill(sessionId: string): void
  subscribe(cb: (event: PtyEvent) => void): () => void
  /**
   * The Claude Code conversation running in a session, as its SessionStart
   * hook reports it to Rust (null once it exits) — what a restart offers back.
   */
  noteClaude(sessionId: string, claudeSessionId: string | null): void
}

/* ═════════════════════════════════ shell ═════════════════════════════════ */

/** What the PtyManager hands the ShellFactory when a session spawns. */
export interface ShellSpawn {
  session: PtySession
  kind: ShellKind
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  /**
   * Started by typing `cmd` / `powershell` / `bash` in another shell: no
   * TerminalDeck shell integration (it's injected only into the shell the app
   * spawns), and `exit` returns to the outer shell instead of ending the pane.
   */
  nested?: boolean
}

/** backend/shell: makes the interpreter for each new session. */
/** Options for a headless run. */
export interface ExecOptions {
  /** Directory to run in (default: the shell's cwd, or the machine's home). */
  cwd?: string
  /** Shell dialect for the factory-level `exec` (default powershell). */
  kind?: ShellKind
  /** Width used for column layouts (default 100). */
  cols?: number
  /** Live output as it's produced (ANSI included). */
  onData?: (chunk: string) => void
  /** Stop a long runner (`npm run dev`) — resolves with the interrupt code. */
  signal?: AbortSignal
  env?: Record<string, string>
}

export interface ExecResult {
  code: number
  /** Everything printed, ANSI included (use stripAnsi for plain text). */
  output: string
}

export interface ShellFactory {
  create(spawn: ShellSpawn): Shell
  /** Shells the machine "has" (pty_shells). */
  available(): ShellInfo[]
  /**
   * Run a command line with no terminal (an agent's Bash tool) through the
   * demo's own interpreter. `code` is the exit code, `output` what it printed.
   */
  exec(commandLine: string, opts?: ExecOptions): Promise<ExecResult>
}

/**
 * A simulated PowerShell / PowerShell 7 / cmd / Git Bash bound to one session:
 * line discipline (PSReadLine-like editing, history, completion), prompts with
 * byte-exact OSC 133 A/B, `\r\n` + 133;C on submit, 133;D;<code> after, OSC
 * 9;9 cwd reports (see terminal-signals.md), builtins, and foreground programs
 * from the ProgramRegistry.
 */
export interface Shell {
  readonly kind: ShellKind
  readonly session: PtySession
  /** Current directory (also mirrored to `session.cwd`). */
  readonly cwd: string
  /** Shell environment (spawn env + what `$env:X = …` / `export` set). */
  readonly env: Readonly<Record<string, string>>
  /** Called by the PtyManager once the spawn has resolved: print the first prompt. */
  start(): void
  /** Raw terminal input. Forwarded to the foreground program when there is one. */
  input(data: string): void
  /**
   * Run a command line as if typed and submitted: echo it (unless `echo:false`),
   * 133;C, execute, 133;D;code, new prompt. Resolves with the exit code when
   * the command finishes — for a long runner (`npm run dev`) only when it ends.
   * If a program is in the foreground, the text is typed into it instead and
   * the promise resolves at once with 0.
   */
  run(commandLine: string, opts?: { echo?: boolean }): Promise<number>
  /** Type text into the current line editor (echoed, not submitted). */
  type(text: string): void
  /** The program holding the foreground, if any. */
  readonly foreground: Program | null
  /** At a prompt, no foreground program, empty input line. */
  readonly idle: boolean
  /** At a prompt with nothing running (the input line may hold text). */
  readonly atPrompt: boolean
  /** The current (unsubmitted) input line. */
  readonly line: string
  readonly history: readonly string[]
  /** Ctrl+C: interrupt the foreground program or clear the line. */
  interrupt(): void
  resize(cols: number, rows: number): void
  /** The session is going away: kill the foreground program, clear every timer. */
  dispose(): void
}

/* ═══════════════════════════════ programs ═══════════════════════════════ */

/**
 * A foreground process (an agent TUI, `npm run dev`, `node x.js`…). The shell
 * gives it the terminal until it calls `io.exit()`.
 */
export interface Program {
  /** Take the foreground. Draw the first frame here (or from a timer). */
  start(io: ProgramIO): void
  /** Raw terminal input while this program owns the foreground (incl. `\x03`). */
  input(data: string): void
  /** The pane resized; redraw if the program is a full-screen TUI. */
  resize?(cols: number, rows: number): void
  /** An agent TUI mid-turn (spinner up). */
  readonly working?: boolean
  /** An agent TUI showing a permission or choice dialog that waits for the user. */
  readonly awaitingAnswer?: boolean
  /**
   * Hard stop (session killed, pane closed, shell disposed). Stop output and
   * timers (io.timers is disposed for you right after); do NOT call io.exit.
   */
  kill(): void
}

/** The program's view of its terminal and the world. */
export interface ProgramIO {
  /** Arguments after the program name (`claude -p "hi"` → `['-p', 'hi']`). */
  readonly argv: string[]
  /** The whole command line as typed. */
  readonly commandLine: string
  readonly cols: number
  readonly rows: number
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly session: PtySession
  readonly shell: Shell
  readonly backend: Backend
  /** Paused while the tab is hidden; disposed when the program exits or is killed. */
  readonly timers: Timers
  /** Print (ANSI allowed). No-op after exit. */
  write(data: string): void
  /** OSC 0 window title (what the renderer's auto pane names read). */
  setTitle(title: string): void
  /**
   * Leave the foreground: the shell writes 133;D;code and a fresh prompt.
   * Idempotent; timers are disposed.
   */
  exit(code?: number): void
  readonly exited: boolean
}

export interface ProgramLaunch {
  /** Resolved program name (after `npx` / `.exe` stripping). */
  name: string
  argv: string[]
  commandLine: string
  session: PtySession
  shell: Shell
  backend: Backend
}

/** How a program is found by name (`claude`, `codex`, `npx @openai/codex`…). */
export interface ProgramSpec {
  /** Canonical command name, lower-case. */
  name: string
  /**
   * Other names that launch it, lower-case — including npx package names
   * (`@anthropic-ai/claude-code`), which the shell resolves for `npx <pkg>`.
   */
  aliases?: string[]
  /** One line for the demo's `help` listing. */
  summary: string
  /** 'agent' programs are listed under "Coding agents" in `help`. */
  kind: 'agent' | 'tool'
  create(launch: ProgramLaunch): Program
}

/**
 * name → factory, so the shell can launch programs it doesn't know about.
 * backend/programs registers the agents; the shell may register its own
 * long runners (e.g. `npm run dev`) here too.
 */
export interface ProgramRegistry {
  /** Returns an unregister function. Re-registering a name replaces it. */
  register(spec: ProgramSpec): () => void
  /** Case-insensitive; strips `.exe`/`.cmd`/`.ps1`/`.bat`; checks aliases. */
  get(name: string): ProgramSpec | undefined
  list(): ProgramSpec[]
}

/* ═══════════════════════════════ notch ═══════════════════════════════ */

/** Claude Code hook events the (simulated) hook server receives. */
export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionEnd'

/**
 * The attention controller (port of src-tauri/src/notch/mod.rs) plus the
 * notch_* commands, sessions_report (the session registry), notify_task_complete
 * and notch_agent_signal. Watches PtyEvents itself (input `\r` clears, output
 * volume clears, exit clears, mirrors stream `notch:stream`) and follows
 * `backend.state.onSettings` for settings.notch (scale, visibility, enabled).
 */
export interface NotchController {
  /**
   * The merged sessions_report registry (window order, deduped by session id)
   * — what the notch dashboard lists and what jump-to-pane resolves against.
   */
  sessions(): PaneSessionInfo[]
  /** The window that reported `sessionId`. */
  windowOfSession(sessionId: string): WindowLabel | undefined
  /**
   * What Claude Code's hooks would POST for `sessionId` — raised exactly as the
   * real hook server does (e.g. `Notification` with
   * `{ message: 'Claude needs your permission to use Bash' }` → a question with
   * `expandHint`; `Stop` → turn-done; `SessionEnd` clears).
   */
  hook(sessionId: string, event: HookEventName, info?: { message?: string }): void
  /** Same as `notch_agent_signal` from a pane (heuristics: bell, osc9, maybe-waiting, command-state). */
  signal(sessionId: string, signal: NotchAgentSignal): void
  /** Same as `notify_task_complete`. */
  taskComplete(payload: TaskCompletePayload): void
  state(): NotchStatePayload
  onState(cb: (state: NotchStatePayload) => void): () => void
  dismiss(attentionId: string): void
  /** notch "Open ↗": resolve the pane, `pane:focus` its window, focus the frame. */
  jump(target: NotchJumpTarget): void
  /** Whether hooks have reported for this session (hook coverage suppresses heuristics). */
  hasHookCoverage(sessionId: string): boolean
}

/* ═════════════════════════════ deck tools ═════════════════════════════ */

export interface SendMessageResult {
  ok: boolean
  /** The message record id, when one was created. */
  id?: number
  status?: DeckMessageStatus
  reason?: DeckMessageReason
  /** A human sentence, as the MCP tool would return it to the agent. */
  error?: string
}

/** A `[TerminalDeck msg #N …] <<msg nonce>> … <<end nonce>>` frame, parsed. */
export interface FramedMessage {
  id: number
  replyTo?: number
  /** 'Claude Code' | 'Codex' (as written in the frame). */
  fromAgent: string
  fromPaneId: string
  fromName: string
  nonce: string
  /** Body with ` ⏎ ` turned back into newlines. */
  body: string
}

export interface IncomingMessage {
  message: DeckMessage
  /** The receiving session and pane. */
  sessionId: string
  paneId: string
}

/**
 * The deck tools MCP server's brain (backend/decktools): the pane inventory
 * (deck_panes_report — the session registry is the notch's), the message log with the REAL
 * three-phase delivery gate, the loop guard, and every deck_* command. This is
 * the agent-facing API the simulated `claude`/`codex` call as their tools.
 */
export interface DeckTools {
  /** list_panes: the latest report from every window, window order. */
  panes(): DeckPaneInfo[]
  pane(paneId: string): DeckPaneInfo | undefined
  paneOfSession(sessionId: string): DeckPaneInfo | undefined
  /** The window that owns a pane (from the reports). */
  windowOfPane(paneId: string): WindowLabel | undefined
  /**
   * send_message from the agent in `fromPaneId` — queued → gate → typed → delivered.
   * Resolves at once on a refusal; otherwise when the message is delivered, or
   * after about 5 s with its status still `queued`/`delivering` (it keeps going).
   */
  sendMessage(fromPaneId: string, toPaneId: string, text: string, opts?: { replyTo?: number }): Promise<SendMessageResult>
  /** send_to_pane: type into an idle shell (via `deck:send-to-pane` → the renderer). */
  sendToPane(
    fromPaneId: string | null,
    toPaneId: string,
    text: string,
    opts?: { submit?: boolean }
  ): Promise<{ ok: boolean; error?: string; reason?: DeckMessageReason }>
  /** get_pane_context (via `deck:context-request` → the renderer reads its xterm). */
  getPaneContext(paneId: string, opts?: { maxChars?: number; source?: DeckContextMode }): Promise<DeckContextResult>
  /** open_pane: split a new pane beside the caller and start a command in it (via the renderer). */
  openPane(req: Partial<DeckOpenRequest>, label?: WindowLabel): Promise<DeckOpenResult>
  /** list_messages: the log, oldest first. */
  messages(): DeckMessage[]
  parseFramed(text: string): FramedMessage | null
  /** A message was delivered (submitted into the target) — the receiving program may react. */
  onIncoming(cb: (e: IncomingMessage) => void): () => void
}

/* ═════════════════════════════ phone, misc ═════════════════════════════ */

/** phone_* (backend/phone). */
export interface PhoneService {
  status(): import('@shared/types').PhoneStatus
}

/** pane_names_summarize, shell_open_external, shell_start_drag, clipboard/drag stubs (backend/misc). */
export interface MiscService {
  /** Open an http(s) URL for the visitor (new tab). Refuses anything else. */
  openExternal(url: string): void
}

/* ═══════════════════════════════ host ═══════════════════════════════ */

export type WindowState = 'maximized' | 'normal' | 'minimized' | 'closed'

/** The host's window manager (host/windows.ts). */
export interface HostWindows {
  state(label: WindowLabel): WindowState
  minimize(label: WindowLabel): void
  /** Maximized ↔ inset window with a shadow. */
  toggleMaximize(label: WindowLabel): void
  /** Un-minimize (or reopen a closed window). */
  restore(label: WindowLabel): void
  /** Actually close (after the renderer confirmed): shows "TerminalDeck is closed — Reopen". */
  close(label: WindowLabel): void
  /** A second app window (`win-N`, secondary), or null when not supported — the caller says so. */
  open(): WindowLabel | null
  /** `plugin:window|start_dragging`: move an inset window with the pointer until release. */
  startDrag(label: WindowLabel): void
  /** Bring a window to front and give its iframe keyboard focus. */
  focus(label: WindowLabel): void
  frameElement(label: WindowLabel): HTMLIFrameElement | null
}

/** The notch iframe's placement and click-through (host/notch.ts). */
export interface NotchSurface {
  /** Last `notch_ui_rect` (iframe-relative CSS px), used for hover hit-testing (+14 px halo). */
  setUiRect(rect: { x: number; y: number; w: number; h: number } | null): void
  /** `notch_set_ignore_mouse`: true = click-through (pointer-events none). */
  setIgnoreMouse(ignore: boolean): void
  /** Show/hide the overlay (disabled, auto-hidden, blackout). */
  setVisible(visible: boolean): void
  readonly visible: boolean
  /** settings.notch.scale — the iframe is 760×500 × scale. */
  setScale(scale: number): void
  /** Keyboard focus into the notch (autoFocusQuestions). */
  focus(): void
  /** The pointer rested ~240 ms on the 3 px strip at the top-centre while hidden ("Hidden until needed" peek). */
  onEdgeDwell(cb: () => void): () => void
}

/** The blackout cover (host/blackout.ts). Lifting on input calls `backend.blackout.lift()`. */
export interface HostBlackout {
  show(): void
  hide(): void
}

/** Messages the host posts to the parent website. */
export type DemoEvent =
  | { type: 'ready' }
  | { type: 'tour-step'; index: number; total: number; title: string }
  | { type: 'tour-done'; completed: boolean }
  | { type: 'theme'; theme: string }

/** Messages the parent website posts to the host (origin-checked, `source: 'td-site'`). */
export type SiteCommand =
  | { type: 'tour'; action?: 'start' | 'stop' }
  | { type: 'reset' }
  | { type: 'type'; text: string; paneId?: string; submit?: boolean }
  | { type: 'theme'; theme: string }
  | { type: 'blackout'; on?: boolean }
  | { type: 'focus'; paneId?: string }

/** What the guided tour needs from the world. */
export interface TourContext {
  backend: Backend
  /** The main window's renderer stores (null until it booted). */
  app(): TdStores | null
  /** Aborted the instant the visitor presses a key or clicks inside the app. */
  signal: AbortSignal
  /** Visible-time sleep that rejects with an AbortError once `signal` aborts. */
  sleep(ms: number): Promise<void>
  /** Announce a step (posts `tour-step` to the website). */
  step(title: string): void
}

/** host/tour.ts implements this; the host registers it and drives start/stop. */
export interface TourRunner {
  readonly total: number
  run(ctx: TourContext): Promise<void>
}

export interface TourHost {
  register(runner: TourRunner): void
  start(): void
  stop(): void
  readonly running: boolean
}

/**
 * The host page as the backend sees it. Every method is safe to call when
 * standalone (app.html opened directly) — the null bridge ignores them.
 */
export interface HostBridge {
  /** `?embed=1`: running inside the website's frame. */
  readonly embedded: boolean
  readonly windows: HostWindows
  readonly notch: NotchSurface
  readonly blackout: HostBlackout
  readonly tour: TourHost
  /** The renderer stores of an app window (`window.__td` in that frame), or null. */
  app(label?: WindowLabel): TdStores | null
  /** A toast inside the app window, through the renderer's own toast store. */
  appToast(kind: 'info' | 'success' | 'error', title: string, detail?: string): void
  /** Post an event to the parent website (no-op when not framed). */
  post(event: DemoEvent): void
  /** Trusted keyboard/pointer input anywhere in the demo (the tour stops on it). */
  onUserInput(cb: (e: { kind: 'key' | 'pointer'; label: WindowLabel | 'host' }) => void): () => void
  /** Wipe persisted demo state and reload with the seed. */
  reset(): void
  /** The folder dialog `fs_pick_root` opens; null when cancelled (or there's no desktop to show it on). */
  pickFolder(start: string | null, title?: string): Promise<string | null>
}

/* ══════════════════════ the renderer's stores (window.__td) ══════════════════════ */

/**
 * The real renderer's modules, exposed by boot/app.ts on `window.__td` of each
 * app frame — the SAME module instances the app uses (dynamic imports of the
 * same paths). For the tour, QA and host features that must act "as the user".
 */
export interface TdStores {
  workspace: typeof import('@renderer/store/workspace')
  settings: typeof import('@renderer/store/settings')
  projects: typeof import('@renderer/store/projects')
  explorer: typeof import('@renderer/store/explorer')
  editor: typeof import('@renderer/store/editor')
  theme: typeof import('@renderer/store/theme')
  toasts: typeof import('@renderer/store/toasts')
  paneMessages: typeof import('@renderer/store/paneMessages')
  ptySessions: typeof import('@renderer/store/ptySessions')
  paneCwd: typeof import('@renderer/store/paneCwd')
  blackout: typeof import('@renderer/store/blackout')
  layout: typeof import('@renderer/components/workspace/layout')
  inputBus: typeof import('@renderer/components/terminal/inputBus')
}

/** Handy re-exports so modules import shared types from one place. */
export type { DeckAgent, PtySpawnOptions }
