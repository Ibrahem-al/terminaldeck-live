import type { Block } from './types'
import { A, type Line } from '../Terminal'

/** Shared terminal-block rendering for the desktop pane and the phone mirror. */

export function PromptRow({
  cwd,
  text,
  caret
}: {
  cwd: string
  text?: string
  caret?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 whitespace-pre-wrap break-all">
      <span style={{ color: A(6) }}>{cwd}</span>
      <span className="font-bold" style={{ color: 'var(--accent)' }}>
        ❯
      </span>
      <span style={{ color: 'var(--term-ink)' }}>
        {text}
        {caret && <span className="caret">&nbsp;</span>}
      </span>
    </div>
  )
}

export function OutRow({ line }: { line: Line }): React.JSX.Element {
  return (
    <div className="block-enter whitespace-pre-wrap break-all">
      {line.length === 0 ? (
        <span>&nbsp;</span>
      ) : (
        line.map((sg, i) => (
          <span key={i} style={{ color: sg.c ?? 'var(--term-ink)' }}>
            {sg.t}
          </span>
        ))
      )}
    </div>
  )
}

export function ExitRow({ code, took }: { code: number; took?: string }): React.JSX.Element {
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

export function renderBlock(b: Block): React.JSX.Element {
  if (b.kind === 'cmd') return <PromptRow key={b.id} cwd={b.cwd} text={b.text} />
  if (b.kind === 'exit') return <ExitRow key={b.id} code={b.code} took={b.took} />
  return <OutRow key={b.id} line={b.line} />
}
