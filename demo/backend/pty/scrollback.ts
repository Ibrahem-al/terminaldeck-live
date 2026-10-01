/**
 * Saved pane output across reloads, keyed by pane id — the demo's version of
 * Rust's scrollback store. Saved when a window goes away (iframe reload, tab
 * close); read back by `pty_scrollback`, which the renderer only shows when
 * settings.terminal.showRestoredHistory is on.
 */
import type { PtyScrollback } from '@shared/types'
import type { DemoStorage } from '../contracts'
import { stripAnsi } from '../util/ansi'
import { utf8ToBase64 } from '../util/text'
import type { PtySessionImpl } from './session'

const KEY = 'pty:scrollback'
/** Per pane; sessionStorage is small and six panes share it. */
const KEEP_CHARS = 48 * 1024

interface Saved {
  data: string
  truncated: boolean
  cwd: string
  /** The Claude conversation this pane was in, if any. */
  claudeSessionId?: string
  /** That conversation was the pane's own auto-run. */
  autoRun?: boolean
}

export class ScrollbackStore {
  constructor(
    private readonly storage: DemoStorage,
    /** Whether a Claude conversation has a transcript to resume (one with at least one turn). */
    private readonly hasConversation: (claudeSessionId: string) => boolean
  ) {}

  private all(): Record<string, Saved> {
    return this.storage.get<Record<string, Saved>>(KEY) ?? {}
  }

  save(sessions: PtySessionImpl[], inClaude: (s: PtySessionImpl) => boolean): void {
    const all = this.all()
    for (const s of sessions) {
      if (!s.paneId) continue
      const text = s.ringText()
      if (stripAnsi(text).trim() === '') continue
      const cut = text.length > KEEP_CHARS
      all[s.paneId] = {
        data: cut ? text.slice(text.length - KEEP_CHARS) : text,
        truncated: cut || s.ringStart > 0,
        cwd: s.cwd,
        claudeSessionId: inClaude(s) ? s.claudeSessionId : undefined,
        autoRun: s.claudeAutoRun
      }
    }
    this.storage.set(KEY, all)
  }

  load(paneId: string): PtyScrollback | null {
    const saved = this.all()[paneId]
    if (!saved) return null
    // Demo-only departure from Rust: a pane whose own auto-run was Claude starts it again (as Codex
    // does) instead of offering the old conversation back. Resuming costs nothing here, but a seed
    // pane that comes back as a plain shell reads as "Claude disappeared" inside the website.
    const resume =
      !saved.autoRun && saved.claudeSessionId && this.hasConversation(saved.claudeSessionId) ? { claudeSessionId: saved.claudeSessionId, cwd: saved.cwd } : null
    return { b64: utf8ToBase64(saved.data), truncated: saved.truncated, resume }
  }

  /** Forget panes that no longer exist. */
  prune(keep: string[]): void {
    const all = this.all()
    const wanted = new Set(keep)
    let changed = false
    for (const k of Object.keys(all)) {
      if (!wanted.has(k)) {
        delete all[k]
        changed = true
      }
    }
    if (changed) this.storage.set(KEY, all)
  }
}
