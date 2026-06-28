import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useInView } from '../../lib/useInView'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { cn } from '../../lib/cn'

/** ANSI index → live CSS var, so terminal output recolors with the theme. */
export const A = (i: number): string => `var(--ansi-${i})`

export type Span = { t: string; c?: string }
export type Line = Span[]

export type TermStep =
  | { cmd: string; cwd?: string } // type a command at the prompt
  | { out: Line[] } // print output lines (streamed)
  | { exit: number; took?: string } // OSC 133;D exit chip
  | { wait: number }

const sp = (t: string, c?: string): Span => ({ t, c })

/** Convenience builders for readable scripts. */
export const L = (...spans: Span[]): Line => spans
export { sp as s }

function PromptLine({ cwd, children }: { cwd: string; children?: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 whitespace-pre-wrap">
      <span style={{ color: A(6) }}>{cwd}</span>
      <span className="font-bold" style={{ color: 'var(--accent)' }}>
        ❯
      </span>
      <span style={{ color: 'var(--term-ink)' }}>{children}</span>
    </div>
  )
}

function OutLine({ line }: { line: Line }): React.JSX.Element {
  return (
    <div className="block-enter whitespace-pre-wrap">
      {line.length === 0 ? (
        <span>&nbsp;</span>
      ) : (
        line.map((s, i) => (
          <span key={i} style={{ color: s.c ?? 'var(--term-ink)' }}>
            {s.t}
          </span>
        ))
      )}
    </div>
  )
}

type Rendered =
  | { kind: 'cmd'; cwd: string; text: string; typing: boolean }
  | { kind: 'out'; line: Line }
  | { kind: 'exit'; code: number; took?: string }

function ExitChip({ code, took }: { code: number; took?: string }): React.JSX.Element {
  const ok = code === 0
  return (
    <div className="block-enter flex items-center gap-2 py-0.5">
      <span
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-px font-ui text-[10.5px] font-semibold"
        style={{
          backgroundColor: ok ? 'var(--ok-soft)' : 'var(--danger-soft)',
          color: ok ? 'var(--ok)' : 'var(--danger)'
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
        exit {code}
      </span>
      {took && <span className="font-ui text-[10.5px] text-ink-3">· {took}</span>}
    </div>
  )
}

/**
 * Animated terminal body. Plays a scripted session — typing commands character
 * by character and streaming output — using only theme tokens, so it reads as
 * the real app's xterm pane. Starts when scrolled into view.
 */
export function Terminal({
  script,
  defaultCwd = '~\\dev\\my-app',
  loop = true,
  className,
  speed = 1
}: {
  script: TermStep[]
  defaultCwd?: string
  loop?: boolean
  className?: string
  speed?: number
}): React.JSX.Element {
  const [rendered, setRendered] = useState<Rendered[]>([])
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>({ threshold: 0.25 })
  const reduced = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    if (!inView) return
    alive.current = true
    const timers: number[] = []
    const wait = (ms: number): Promise<void> =>
      new Promise((res) => {
        const id = window.setTimeout(res, reduced ? Math.min(ms, 30) : ms / speed)
        timers.push(id)
      })

    // Static render when reduced motion: dump everything instantly.
    async function run(): Promise<void> {
      const acc: Rendered[] = []
      const push = (r: Rendered): void => {
        acc.push(r)
        if (alive.current) setRendered([...acc])
      }
      for (const step of script) {
        if (!alive.current) return
        if ('cmd' in step) {
          const cwd = step.cwd ?? defaultCwd
          const idx = acc.length
          acc.push({ kind: 'cmd', cwd, text: '', typing: true })
          if (reduced) {
            acc[idx] = { kind: 'cmd', cwd, text: step.cmd, typing: false }
            setRendered([...acc])
          } else {
            for (let i = 1; i <= step.cmd.length; i++) {
              if (!alive.current) return
              acc[idx] = { kind: 'cmd', cwd, text: step.cmd.slice(0, i), typing: true }
              setRendered([...acc])
              // human-ish cadence with light jitter
              await wait(22 + (step.cmd[i - 1] === ' ' ? 40 : Math.random() * 34))
            }
            acc[idx] = { kind: 'cmd', cwd, text: step.cmd, typing: false }
            setRendered([...acc])
            await wait(260)
          }
        } else if ('out' in step) {
          for (const line of step.out) {
            if (!alive.current) return
            push({ kind: 'out', line })
            await wait(reduced ? 0 : 70)
          }
        } else if ('exit' in step) {
          push({ kind: 'exit', code: step.exit, took: step.took })
          await wait(500)
        } else if ('wait' in step) {
          await wait(step.wait)
        }
      }
      if (loop && !reduced && alive.current) {
        await wait(2600)
        if (!alive.current) return
        setRendered([])
        acc.length = 0
        void run()
      }
    }
    void run()
    return () => {
      alive.current = false
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced])

  // Keep the latest output in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [rendered])

  return (
    <div ref={inViewRef} className={cn('h-full bg-term', className)}>
      <div
        ref={scrollRef}
        className="h-full overflow-hidden px-3 py-2 font-mono text-[12.5px] leading-[1.65]"
        style={{ color: 'var(--term-ink)' }}
      >
        {rendered.map((r, i) => {
          if (r.kind === 'cmd') {
            return (
              <PromptLine key={i} cwd={r.cwd}>
                {r.text}
                {r.typing && <span className="caret">&nbsp;</span>}
              </PromptLine>
            )
          }
          if (r.kind === 'exit') return <ExitChip key={i} code={r.code} took={r.took} />
          return <OutLine key={i} line={r.line} />
        })}
      </div>
    </div>
  )
}
