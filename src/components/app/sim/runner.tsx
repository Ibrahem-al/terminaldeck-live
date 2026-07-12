import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { A, L, s } from '../Terminal'
import { THEMES, useTheme } from '../../../lib/theme'
import { useReducedMotion } from '../../../lib/useReducedMotion'
import { blk, useSim } from './store'
import { interpret } from './shell'

interface RunOpts {
  /** Auto-play: type the command out character-by-character first. */
  auto?: boolean
}

interface RunnerApi {
  /** Run a command in a pane (commits the prompt line, then streams output). */
  run: (paneId: string, command: string, opts?: RunOpts) => Promise<void>
  /** Ctrl-C: abort a running command in a pane (prints ^C). */
  interrupt: (paneId: string) => void
  /** Silently abort a pane's in-flight run — used when the user grabs the prompt. */
  cancel: (paneId: string) => void
  /** Abort every in-flight command (e.g. when the user takes over). */
  abortAll: () => void
}

const Ctx = createContext<RunnerApi | null>(null)

const THEME_LIST = THEMES.map((t) => ({ id: t.id, name: t.name }))

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        resolve()
      },
      { once: true }
    )
  })
}

export function RunnerProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { state, dispatch } = useSim()
  const { commit } = useTheme()
  const reduced = useReducedMotion()

  // Read freshest pane state at execution time (cwd mutates mid-run via `cd`).
  const stateRef = useRef(state)
  stateRef.current = state
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  const controllers = useRef<Map<string, AbortController>>(new Map())
  const autoRuns = useRef<Set<string>>(new Set())

  const run = useCallback(
    async (paneId: string, command: string, opts?: RunOpts): Promise<void> => {
      const cmd = command.trim()
      // Cancel any in-flight run for this pane and start a fresh one.
      controllers.current.get(paneId)?.abort()
      const ac = new AbortController()
      controllers.current.set(paneId, ac)
      if (opts?.auto) autoRuns.current.add(paneId)
      else autoRuns.current.delete(paneId)
      const signal = ac.signal
      const slow = !reducedRef.current

      const start = stateRef.current.panes[paneId]
      if (!start) {
        autoRuns.current.delete(paneId)
        return
      }

      try {
      // Auto-play types the command into the prompt before "pressing enter".
      if (opts?.auto) {
        // An abortable settle before any mutation — lets StrictMode's throwaway
        // first mount cancel cleanly without leaving a half-typed line behind.
        await wait(slow ? 700 : 0, signal)
        if (signal.aborted) return
        if (slow) {
          for (let i = 1; i <= cmd.length; i++) {
            if (signal.aborted) return
            dispatch({ type: 'setInput', paneId, input: cmd.slice(0, i) })
            await wait(24 + (cmd[i - 1] === ' ' ? 38 : Math.random() * 30), signal)
          }
          await wait(280, signal)
        } else {
          dispatch({ type: 'setInput', paneId, input: cmd })
        }
        if (signal.aborted) return
      }

      if (!cmd) {
        // Bare Enter: just drop a fresh prompt line.
        const cwd = stateRef.current.panes[paneId]?.cwd ?? start.cwd
        dispatch({ type: 'appendBlocks', paneId, blocks: [blk({ kind: 'cmd', cwd, text: '' })] })
        dispatch({ type: 'setInput', paneId, input: '' })
        return
      }

      const cwd = stateRef.current.panes[paneId]?.cwd ?? start.cwd
      const root = stateRef.current.panes[paneId]?.root ?? start.root
      dispatch({ type: 'pushHistory', paneId, cmd })
      dispatch({ type: 'appendBlocks', paneId, blocks: [blk({ kind: 'cmd', cwd, text: cmd })] })
      dispatch({ type: 'setInput', paneId, input: '' })
      dispatch({ type: 'setBusy', paneId, busy: true })

      const steps = interpret(cmd, { root, cwd, themes: THEME_LIST })

      for (const step of steps) {
        if (signal.aborted) break
        switch (step.t) {
          case 'wait':
            await wait(slow ? step.ms : 0, signal)
            break
          case 'clear':
            dispatch({ type: 'clearBlocks', paneId })
            break
          case 'cd':
            dispatch({ type: 'setCwd', paneId, cwd: step.cwd })
            break
          case 'theme':
            commit(step.id)
            break
          case 'kind':
            dispatch({ type: 'setKind', paneId, kind: step.kind, title: step.title, badge: step.badge })
            break
          case 'out':
            for (const line of step.lines) {
              if (signal.aborted) break
              dispatch({ type: 'appendBlocks', paneId, blocks: [blk({ kind: 'out', line })] })
              await wait(slow ? 58 : 0, signal)
            }
            break
          case 'exit':
            dispatch({ type: 'appendBlocks', paneId, blocks: [blk({ kind: 'exit', code: step.code, took: step.took })] })
            await wait(slow ? 150 : 0, signal)
            break
        }
      }

      } finally {
        autoRuns.current.delete(paneId)
        // Only the run that still owns the pane may clear busy / its controller.
        // A superseded (aborted) run must NOT stomp the newer run's busy=true.
        if (controllers.current.get(paneId) === ac) {
          controllers.current.delete(paneId)
          dispatch({ type: 'setBusy', paneId, busy: false })
        }
      }
    },
    [dispatch, commit]
  )

  const interrupt = useCallback(
    (paneId: string) => {
      controllers.current.get(paneId)?.abort()
      controllers.current.delete(paneId)
      dispatch({
        type: 'appendBlocks',
        paneId,
        blocks: [blk({ kind: 'out', line: L(s('^C', A(8))) })]
      })
      dispatch({ type: 'setBusy', paneId, busy: false })
      dispatch({ type: 'setInput', paneId, input: '' })
    },
    [dispatch]
  )

  const cancel = useCallback(
    (paneId: string) => {
      // Only abort *autoplay* — never a command the user kicked off themselves.
      if (!autoRuns.current.has(paneId)) return
      controllers.current.get(paneId)?.abort()
      controllers.current.delete(paneId)
      autoRuns.current.delete(paneId)
      dispatch({ type: 'setBusy', paneId, busy: false })
      dispatch({ type: 'setInput', paneId, input: '', histIndex: -1 })
    },
    [dispatch]
  )

  const abortAll = useCallback(() => {
    controllers.current.forEach((c) => c.abort())
    controllers.current.clear()
  }, [])

  const api = useMemo<RunnerApi>(() => ({ run, interrupt, cancel, abortAll }), [run, interrupt, cancel, abortAll])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useRunner(): RunnerApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRunner must be used within RunnerProvider')
  return ctx
}
