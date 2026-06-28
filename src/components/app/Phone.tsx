import type { ReactNode } from 'react'
import { Bell, ChevronLeft, Plus } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Physical phone shell. Content recolors with the active theme, like the PWA. */
export function PhoneFrame({
  children,
  className,
  width = 244
}: {
  children: ReactNode
  className?: string
  width?: number
}): React.JSX.Element {
  return (
    <div
      className={cn('shrink-0 rounded-[2.4rem] border border-edge bg-black p-2 shadow-2xl', className)}
      style={{ width }}
    >
      <div className="relative overflow-hidden rounded-[1.9rem] border border-edge-2 bg-base">
        {/* notch */}
        <div className="pointer-events-none absolute top-0 left-1/2 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
        <div className="flex h-[460px] flex-col">{children}</div>
      </div>
    </div>
  )
}

const dot: Record<'open' | 'busy' | 'idle' | 'dead', string> = {
  open: 'var(--ok)',
  busy: 'var(--accent)',
  idle: 'var(--ok)',
  dead: 'var(--danger)'
}

/** The RemoteDeck top bar (status dot · title · actions). */
export function PhoneBar({
  title,
  status = 'open',
  back = false,
  bell = false,
  add = false,
  end = false
}: {
  title: string
  status?: 'open' | 'busy' | 'idle' | 'dead'
  back?: boolean
  bell?: boolean
  add?: boolean
  end?: boolean
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-edge bg-raised px-3.5 pt-6 pb-3">
      {back && <ChevronLeft size={18} className="text-ink-2" />}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: dot[status], boxShadow: `0 0 8px ${dot[status]}` }}
      />
      <span className="truncate font-ui text-[15px] font-semibold text-ink">{title}</span>
      <span className="flex-1" />
      {bell && <Bell size={17} className="text-accent" />}
      {add && <Plus size={20} className="text-ink-2" />}
      {end && (
        <span className="rounded-lg border border-danger-edge px-2.5 py-1 font-ui text-[12px] font-semibold text-danger">
          End
        </span>
      )}
    </div>
  )
}

const KEYS = [
  { k: 'Paste', accent: true },
  { k: 'Esc' },
  { k: 'Tab' },
  { k: '^C' },
  { k: 'Up' },
  { k: 'Down' },
  { k: 'Left' },
  { k: 'Right' },
  { k: 'Home' },
  { k: 'End' },
  { k: '^L' },
  { k: '^R' },
  { k: '^D' },
  { k: '^Z' },
  { k: 'PgUp' },
  { k: 'PgDn' },
  { k: 'Del' }
]

/** The mobile key bar — the keys phones lack that Claude Code & shells wait on. */
export function KeyBar(): React.JSX.Element {
  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-edge bg-raised p-2">
      {KEYS.map((key, i) => (
        <span
          key={i}
          className={cn(
            'flex h-9 min-w-[42px] shrink-0 items-center justify-center rounded-lg border border-edge bg-overlay font-mono text-[12.5px] active:bg-accent active:text-ink-inverse',
            key.accent ? 'text-accent' : 'text-ink'
          )}
        >
          {key.k}
        </span>
      ))}
    </div>
  )
}

export interface PhoneSession {
  name: string
  cwd: string
  status: 'busy' | 'idle' | 'dead'
}

/** The session list — the same desktop terminals, mirrored. */
export function SessionList({
  sessions,
  activeName
}: {
  sessions: PhoneSession[]
  activeName?: string
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
      {sessions.map((s, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 rounded-xl border bg-raised px-3.5 py-3',
            s.name === activeName ? 'border-accent/60' : 'border-edge'
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: dot[s.status], boxShadow: `0 0 8px ${dot[s.status]}` }}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-ui text-[14px] font-semibold text-ink">{s.name}</span>
            <span className="truncate font-mono text-[10.5px] text-ink-3">{s.cwd}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
