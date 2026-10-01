/**
 * Runtime services every module leans on: tab-session persistence and a clock
 * whose timers stop while nobody can see the demo.
 */
import type { Clock, DemoStorage, Timers } from './contracts'

const PREFIX = 'td-demo:'

/** sessionStorage-backed; every failure (private mode, quota) degrades to "not saved". */
export function createStorage(area: Storage | null = safeSessionStorage()): DemoStorage {
  let frozen = false
  const storage: DemoStorage = {
    get<T>(key: string): T | undefined {
      if (!area) return undefined
      try {
        const raw = area.getItem(PREFIX + key)
        return raw === null ? undefined : (JSON.parse(raw) as T)
      } catch {
        return undefined
      }
    },
    set(key, value) {
      if (!area || frozen) return
      try {
        area.setItem(PREFIX + key, JSON.stringify(value))
      } catch {
        /* over quota: the demo keeps running, it just won't survive a reload */
      }
    },
    remove(key) {
      try {
        area?.removeItem(PREFIX + key)
      } catch {
        /* ignore */
      }
    },
    clear() {
      if (!area) return
      try {
        const keys: string[] = []
        for (let i = 0; i < area.length; i++) {
          const k = area.key(i)
          if (k?.startsWith(PREFIX)) keys.push(k)
        }
        for (const k of keys) area.removeItem(k)
      } catch {
        /* ignore */
      }
    },
    wipe() {
      frozen = true
      storage.clear()
    }
  }
  return storage
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

interface TimerEntry {
  fn: () => void
  /** Visible milliseconds left until it fires. */
  remaining: number
  /** For intervals; 0 for one-shots. */
  every: number
  startedAt: number
  handle: ReturnType<typeof setTimeout> | undefined
  /** The owning group's id set, so a fired one-shot can leave it. */
  group: { ids: Set<number> }
}

/**
 * Timers measure VISIBLE time: when the host tab hides, every armed timer is
 * parked with its remaining time and re-armed on return, so a simulated agent
 * picks up mid-sentence instead of dumping a minute of output at once.
 */
export function createClock(doc: Document = document): Clock {
  let paused = doc.hidden
  const timers = new Map<number, TimerEntry>()
  const listeners = new Set<(paused: boolean) => void>()
  let nextId = 1

  const arm = (id: number, t: TimerEntry): void => {
    t.startedAt = performance.now()
    t.handle = setTimeout(() => fire(id), Math.max(0, t.remaining))
  }

  const fire = (id: number): void => {
    const t = timers.get(id)
    if (!t) return
    if (t.every > 0) {
      t.remaining = t.every
      arm(id, t)
    } else {
      timers.delete(id)
      t.group.ids.delete(id)
    }
    try {
      t.fn()
    } catch (err) {
      console.error('[demo] timer callback failed', err)
    }
  }

  doc.addEventListener('visibilitychange', () => {
    const next = doc.hidden
    if (next === paused) return
    paused = next
    const now = performance.now()
    for (const [id, t] of timers) {
      if (paused) {
        clearTimeout(t.handle)
        t.handle = undefined
        t.remaining = Math.max(0, t.remaining - (now - t.startedAt))
      } else {
        arm(id, t)
      }
    }
    for (const cb of listeners) cb(paused)
  })

  class TimerGroup implements Timers {
    ids = new Set<number>()
    disposed = false

    private add(fn: () => void, ms: number, every: number): number {
      if (this.disposed) return 0
      const id = nextId++
      const t: TimerEntry = { fn, remaining: Math.max(0, ms), every, startedAt: 0, handle: undefined, group: this }
      timers.set(id, t)
      this.ids.add(id)
      if (!paused) arm(id, t)
      return id
    }

    setTimeout(fn: () => void, ms: number): number {
      return this.add(fn, ms, 0)
    }

    setInterval(fn: () => void, ms: number): number {
      return this.add(fn, ms, Math.max(1, ms))
    }

    clear(id: number): void {
      const t = timers.get(id)
      if (!t || t.group !== this) return
      clearTimeout(t.handle)
      timers.delete(id)
      this.ids.delete(id)
    }

    /**
     * On a disposed group this never settles, on purpose: whatever awaited it
     * belongs to a killed program or session and must not run on. Resolving
     * would spin any `for (;;) await sleep()` loop; rejecting would surface as
     * unhandled rejections. The pending closure is collected with the group.
     */
    sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        this.add(resolve, ms, 0)
      })
    }

    dispose(): void {
      if (this.disposed) return
      this.disposed = true
      for (const id of this.ids) {
        clearTimeout(timers.get(id)?.handle)
        timers.delete(id)
      }
      this.ids.clear()
    }
  }

  return {
    group: () => new TimerGroup(),
    get paused() {
      return paused
    },
    onPauseChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    now: () => Date.now()
  }
}
