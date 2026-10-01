/**
 * Client for the playable demo iframe (./demo/index.html?embed=1, built from website/demo).
 * Protocol (see website/demo/host/site.ts and demo/backend/contracts.ts):
 *   site → demo  { source: 'td-site', type: 'tour' | 'reset' | 'type' | 'theme' | 'blackout' | 'focus', … }
 *   demo → site  { source: 'td-demo', type: 'ready' | 'tour-step' | 'tour-done' | 'theme', … }
 * Same-origin only. Commands sent before 'ready' are queued and flushed on 'ready'.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_PATH } from './links'

export const DEMO_SRC = DEMO_PATH

export type DemoCommand =
  | { type: 'tour'; action?: 'start' | 'stop' }
  | { type: 'reset' }
  | { type: 'type'; text: string; paneId?: string; submit?: boolean }
  | { type: 'theme'; theme: string }
  | { type: 'blackout'; on?: boolean }
  | { type: 'focus'; paneId?: string }

export type DemoEvent =
  | { type: 'ready'; tour?: boolean }
  | { type: 'tour-step'; index: number; total: number; title: string }
  | { type: 'tour-done'; completed: boolean }
  | { type: 'theme'; theme: string }
  /** Local only (never posted by the demo): the site just asked the demo to reset. */
  | { type: 'resetting' }

type Listener = (e: DemoEvent) => void

export interface DemoClient {
  readonly ready: boolean
  send(cmd: DemoCommand): void
  tour(action?: 'start' | 'stop'): void
  reset(): void
  type(text: string, opts?: { paneId?: string; submit?: boolean }): void
  theme(id: string): void
  blackout(on?: boolean): void
  focus(paneId?: string): void
  on(listener: Listener): () => void
  destroy(): void
}

/** Wire a client to an iframe element. Call destroy() when the iframe unmounts. */
export function createDemoClient(iframe: HTMLIFrameElement): DemoClient {
  let ready = false
  let queue: DemoCommand[] = []
  const listeners = new Set<Listener>()

  const post = (cmd: DemoCommand): void => {
    const win = iframe.contentWindow
    if (!win) return
    // `id` duplicates `theme` for theme commands so either field name works on the demo side.
    const extra = cmd.type === 'theme' ? { id: cmd.theme } : {}
    try {
      win.postMessage({ source: 'td-site', ...cmd, ...extra }, location.origin)
    } catch {
      /* frame navigated away */
    }
  }

  const onMessage = (e: MessageEvent): void => {
    if (e.source !== iframe.contentWindow || e.origin !== location.origin) return
    const data = e.data as (DemoEvent & { source?: string }) | null
    if (!data || data.source !== 'td-demo' || typeof data.type !== 'string') return
    if (data.type === 'ready') {
      ready = true
      const pending = queue
      queue = []
      pending.forEach(post)
    }
    listeners.forEach((l) => l(data))
  }
  window.addEventListener('message', onMessage)

  const send = (cmd: DemoCommand): void => {
    if (ready) post(cmd)
    else {
      // Keep only the latest theme; everything else in order.
      if (cmd.type === 'theme') queue = queue.filter((q) => q.type !== 'theme')
      queue.push(cmd)
    }
  }

  return {
    get ready() {
      return ready
    },
    send,
    tour: (action = 'start') => send({ type: 'tour', action }),
    reset: () => {
      // Post straight to the frame (send() would queue it while not ready, and nothing would ever
      // flush it). The demo reboots and says 'ready' again, which flushes anything sent meanwhile.
      post({ type: 'reset' })
      queue = []
      ready = false
      listeners.forEach((l) => l({ type: 'resetting' }))
    },
    type: (text, opts) => send({ type: 'type', text, ...opts }),
    theme: (id) => send({ type: 'theme', theme: id }),
    blackout: (on = true) => send({ type: 'blackout', on }),
    focus: (paneId) => send({ type: 'focus', paneId }),
    on: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    destroy: () => {
      window.removeEventListener('message', onMessage)
      listeners.clear()
      queue = []
    }
  }
}

export interface DemoState {
  ready: boolean
  /** Between a reset and the demo's next 'ready'. The app stays on screen while it reboots. */
  resetting: boolean
  /** Set when the demo's 'ready' says whether it has a guided tour (undefined: it didn't say). */
  tourSupported?: boolean
  tour: { running: boolean; index: number; total: number; title: string } | null
  tourDone: { completed: boolean } | null
}

/**
 * React binding. Pass the iframe ref (the iframe may mount later, e.g. load-on-click);
 * the hook reconnects whenever `frame` changes.
 *   const frame = useRef<HTMLIFrameElement>(null)
 *   const { client, state } = useDemo(frame, mounted)
 */
export function useDemo(
  frame: React.RefObject<HTMLIFrameElement>,
  mounted: boolean
): { client: DemoClient | null; state: DemoState } {
  const [client, setClient] = useState<DemoClient | null>(null)
  const [state, setState] = useState<DemoState>({ ready: false, resetting: false, tour: null, tourDone: null })
  const clientRef = useRef<DemoClient | null>(null)

  useEffect(() => {
    const el = frame.current
    if (!mounted || !el) return
    const c = createDemoClient(el)
    clientRef.current = c
    setClient(c)
    const off = c.on((e) => {
      if (e.type === 'ready')
        setState((s) => ({ ...s, ready: true, resetting: false, tourSupported: typeof e.tour === 'boolean' ? e.tour : s.tourSupported }))
      else if (e.type === 'resetting') setState((s) => ({ ...s, resetting: true, tour: null, tourDone: null }))
      else if (e.type === 'tour-step')
        setState((s) => ({ ...s, tour: { running: true, index: e.index, total: e.total, title: e.title }, tourDone: null }))
      else if (e.type === 'tour-done') setState((s) => ({ ...s, tour: null, tourDone: { completed: e.completed } }))
    })
    return () => {
      off()
      c.destroy()
      clientRef.current = null
      setClient(null)
      setState({ ready: false, resetting: false, tour: null, tourDone: null })
    }
  }, [frame, mounted])

  return useMemo(() => ({ client, state }), [client, state])
}

/**
 * What the deployed demo build offers. GETs ./demo/index.html and checks for the demo host's own
 * markup (id="desktop"), so a dev-server or host SPA fallback page never counts. Then reads the
 * host script (about 12 KB, the same file the iframe loads) to see whether its guided tour is the
 * real one or the "not in this build yet" placeholder.
 */
export async function probeDemo(signal?: AbortSignal): Promise<{ available: boolean; tour: boolean }> {
  try {
    const url = new URL(DEMO_SRC.split('?')[0], location.href)
    const res = await fetch(url, { cache: 'no-store', signal })
    if (!res.ok) return { available: false, tour: false }
    const html = await res.text()
    if (!html.includes('id="desktop"')) return { available: false, tour: false }
    const src = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1]
    if (!src) return { available: true, tour: false }
    const host = await fetch(new URL(src, url), { signal })
    const code = host.ok ? await host.text() : ''
    return { available: true, tour: /tour/i.test(code) && !/not in this build yet/i.test(code) }
  } catch {
    return { available: false, tour: false }
  }
}

/** True when the demo build is deployed (see probeDemo). */
export async function demoAvailable(signal?: AbortSignal): Promise<boolean> {
  return (await probeDemo(signal)).available
}

/** True when a media file is deployed (HEAD). Use before swapping a placeholder for <video>. */
export async function mediaAvailable(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal })
    const type = res.headers.get('content-type') ?? ''
    return res.ok && !type.includes('text/html')
  } catch {
    return false
  }
}
