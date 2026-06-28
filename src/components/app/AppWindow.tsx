import type { ReactNode } from 'react'
import { ChevronsUpDown, ListTodo, Plus, Settings, Smartphone } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface Deck {
  name: string
  color: string
  active?: boolean
}

function WindowControls(): React.JSX.Element {
  return (
    <div className="flex h-full items-stretch text-ink-3">
      <span className="flex w-9 items-center justify-center">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
      <span className="flex w-9 items-center justify-center">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
      <span className="group/close flex w-9 items-center justify-center transition-colors hover:bg-danger hover:text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
    </div>
  )
}

const toolBtn =
  'flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink'

/**
 * The frameless TerminalDeck window: top bar (project pill · deck tabs · tools ·
 * window controls) wrapping a content slot. A faithful port of chrome/TopBar.tsx.
 */
export function AppWindow({
  project,
  decks,
  children,
  className,
  onTool
}: {
  project: { name: string; color: string }
  decks: Deck[]
  children: ReactNode
  className?: string
  onTool?: (tool: 'remote' | 'kanban' | 'settings') => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'window-shadow flex min-h-0 flex-col overflow-hidden rounded-xl bg-base',
        className
      )}
    >
      {/* Top bar */}
      <header className="flex h-9 shrink-0 items-stretch border-b border-edge-2 bg-base">
        <div className="flex shrink-0 items-center pr-1 pl-2">
          <span className="group flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 transition-colors duration-100 hover:bg-raised">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="max-w-[160px] truncate font-ui text-[11.5px] font-semibold text-ink-2">
              {project.name}
            </span>
            <ChevronsUpDown size={11} className="shrink-0 text-ink-3" />
          </span>
        </div>

        <div className="mx-1.5 my-2 w-px shrink-0 self-stretch bg-edge-2" aria-hidden />

        <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1">
          {decks.map((d, i) => (
            <span
              key={i}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md pr-2 pl-2.5 transition-colors duration-100',
                d.active ? 'bg-overlay' : 'hover:bg-raised'
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span
                className={cn(
                  'font-ui text-[11.5px] font-medium',
                  d.active ? 'text-ink' : 'text-ink-3'
                )}
              >
                {d.name}
              </span>
            </span>
          ))}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink">
            <Plus size={14} />
          </span>
        </div>

        <div className="h-full flex-1" />

        <div className="flex shrink-0 items-center gap-0.5 px-1">
          <button className={toolBtn} aria-label="RemoteDeck" onClick={() => onTool?.('remote')}>
            <Smartphone size={14} />
          </button>
          <button className={toolBtn} aria-label="Task board" onClick={() => onTool?.('kanban')}>
            <ListTodo size={14} />
          </button>
          <button className={toolBtn} aria-label="Settings" onClick={() => onTool?.('settings')}>
            <Settings size={14} />
          </button>
        </div>

        <WindowControls />
      </header>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
