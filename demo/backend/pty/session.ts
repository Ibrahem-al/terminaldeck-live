/**
 * One simulated ConPTY session: the pane's output channel, a ring buffer with
 * Rust's cumulative byte `seq` (what notch mirrors replay from), size, exit,
 * and the shell bound to it at spawn.
 */
import type { ShellKind } from '@shared/types'
import type { ChannelLike, InputSource, PtyEvent, PtyFrame, PtySession, Shell, WindowLabel } from '../contracts'
import { utf8Length } from '../util/text'

/** Rust keeps about this much per session for mirrors and restore. */
export const RING_BYTES = 256 * 1024

export interface SessionInit {
  id: string
  label: WindowLabel
  paneId: string | undefined
  kind: ShellKind
  integrated: boolean
  env: Record<string, string>
  cwd: string
  cols: number
  rows: number
  claudeSessionId: string | undefined
  channel: ChannelLike<PtyFrame> | null
  publish: (e: PtyEvent) => void
  /** Called once when the session ends (exit or kill). */
  onGone: (s: PtySessionImpl) => void
}

export class PtySessionImpl implements PtySession {
  readonly id: string
  label: WindowLabel
  readonly paneId: string | undefined
  readonly kind: ShellKind
  readonly integrated: boolean
  readonly env: Readonly<Record<string, string>>
  readonly createdAt = Date.now()
  claudeSessionId: string | undefined
  /** That conversation's Claude exited in this shell (so a restart has nothing to offer back). */
  claudeEnded = false
  cols: number
  rows: number
  cwd: string
  alive = true
  exitCode: number | null = null
  seq = 0
  shell!: Shell
  /** Whether the pane is on screen (`pty_set_visible`). Informational. */
  visible = true
  /** Frames the renderer acknowledged (`pty_ack`). Informational. */
  acked = 0

  private channel: ChannelLike<PtyFrame> | null
  private ring: Array<{ data: string; bytes: number; end: number }> = []
  private ringBytes = 0
  private readonly exitCbs = new Set<(code: number) => void>()
  private readonly resizeCbs = new Set<(cols: number, rows: number) => void>()
  private readonly outputCbs = new Set<(data: string, seq: number) => void>()
  private readonly publish: (e: PtyEvent) => void
  private readonly onGone: (s: PtySessionImpl) => void
  /** Spawned for the pane's own `claude` auto-run (the renderer picked the conversation id up front). */
  readonly claudeAutoRun: boolean

  constructor(init: SessionInit) {
    this.id = init.id
    this.label = init.label
    this.paneId = init.paneId
    this.kind = init.kind
    this.integrated = init.integrated
    this.env = init.env
    this.cwd = init.cwd
    this.cols = init.cols
    this.rows = init.rows
    this.claudeSessionId = init.claudeSessionId
    this.claudeAutoRun = !!init.claudeSessionId
    this.channel = init.channel
    this.publish = init.publish
    this.onGone = init.onGone
  }

  write(data: string): void {
    if (!this.alive || data === '') return
    const bytes = utf8Length(data)
    this.seq += bytes
    this.ring.push({ data, bytes, end: this.seq })
    this.ringBytes += bytes
    while (this.ringBytes > RING_BYTES && this.ring.length > 1) {
      const dropped = this.ring.shift()
      if (dropped) this.ringBytes -= dropped.bytes
    }
    this.send(data)
    for (const cb of this.outputCbs) guard(() => cb(data, this.seq))
    this.publish({ type: 'output', session: this, data, seq: this.seq })
  }

  input(data: string, source: InputSource = 'pane'): void {
    if (!this.alive || data === '') return
    this.publish({ type: 'input', session: this, data, source })
    guard(() => this.shell.input(data))
  }

  replay(since = 0): { data: string; headSeq: number; reset: boolean } {
    const first = this.seq - this.ringBytes
    // Anything before the ring's first byte is gone: the mirror must reset.
    const reset = since < first
    const data = this.ring
      .filter((c) => c.end > since)
      .map((c) => c.data)
      .join('')
    return { data: reset ? this.ring.map((c) => c.data).join('') : data, headSeq: this.seq, reset }
  }

  /** The whole ring (scrollback persistence). */
  ringText(): string {
    return this.ring.map((c) => c.data).join('')
  }

  get ringStart(): number {
    return this.seq - this.ringBytes
  }

  resize(cols: number, rows: number): void {
    if (cols === this.cols && rows === this.rows) return
    this.cols = cols
    this.rows = rows
    guard(() => this.shell.resize(cols, rows))
    for (const cb of this.resizeCbs) guard(() => cb(cols, rows))
    this.publish({ type: 'resize', session: this, cols, rows })
  }

  /** A pane adopted this session from elsewhere: output goes to its channel now. */
  rebind(label: WindowLabel, channel: ChannelLike<PtyFrame> | null): void {
    this.label = label
    this.channel = channel
  }

  exit(code: number): void {
    if (!this.alive) return
    this.send({ exit: code })
    this.end(code)
  }

  /** `pty_kill`: the pane is going away, so no exit frame — observers still hear it end. */
  kill(): void {
    if (!this.alive) return
    this.channel = null
    this.end(1)
  }

  private end(code: number): void {
    this.alive = false
    this.exitCode = code
    this.channel = null
    guard(() => this.shell.dispose())
    this.onGone(this)
    for (const cb of this.exitCbs) guard(() => cb(code))
    this.publish({ type: 'exit', session: this, code })
  }

  private send(frame: PtyFrame): void {
    const ch = this.channel
    if (!ch) return
    try {
      ch.onmessage(frame)
    } catch (err) {
      console.error('[demo] pty channel', err)
    }
  }

  onExit(cb: (code: number) => void): () => void {
    this.exitCbs.add(cb)
    return () => this.exitCbs.delete(cb)
  }

  onResize(cb: (cols: number, rows: number) => void): () => void {
    this.resizeCbs.add(cb)
    return () => this.resizeCbs.delete(cb)
  }

  onOutput(cb: (data: string, seq: number) => void): () => void {
    this.outputCbs.add(cb)
    return () => this.outputCbs.delete(cb)
  }
}

function guard(fn: () => void): void {
  try {
    fn()
  } catch (err) {
    console.error('[demo] pty callback failed', err)
  }
}
