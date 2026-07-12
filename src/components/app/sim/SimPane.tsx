import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  FileCode2,
  Folder,
  GripVertical,
  Pin,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Tag,
  Terminal as TerminalIcon,
  X
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { Badge, PaneKind, SimPane as Pane } from './types'
import { EDITOR_SCAFFOLD, editorPane, termPane, useSim } from './store'
import { SimTerminal } from './SimTerminal'

const kindIcon: Record<PaneKind, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  agent: Bot,
  editor: FileCode2
}

const BADGE_PRESETS: Badge[] = [
  { label: 'Claude Code', color: '#d8a956' },
  { label: 'Dev Server', color: '#4cc38a' },
  { label: 'Git', color: '#e8b130' },
  { label: 'Test Runner', color: '#b583d9' },
  { label: 'REPL', color: '#4fb8c9' }
]

const iconBtn = 'rounded p-1 text-ink-3 transition-colors hover:bg-overlay hover:text-ink'

function EditorBody({ pane }: { pane: Pane }): React.JSX.Element {
  return (
    <div
      className="h-full overflow-auto bg-term px-3 py-2 font-mono text-[12px] leading-[1.7]"
      style={{ color: 'var(--term-ink)' }}
    >
      {(pane.editorLines ?? []).map((line, i) => (
        <div key={i} className="whitespace-pre">
          {line.map((sg, j) => (
            <span key={j} style={{ color: sg.c ?? 'var(--term-ink)' }}>
              {sg.t}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * One interactive pane: a faithful, *working* port of the app's PaneFrame.
 * The header affordances (badge, pin, split-right, split-down, kind menu, close)
 * all mutate real state; the body is a typeable terminal or an editor preview.
 */
export function SimPane({
  pane,
  active,
  canClose
}: {
  pane: Pane
  active: boolean
  canClose: boolean
}): React.JSX.Element {
  const { dispatch } = useSim()
  const Icon = kindIcon[pane.kind]
  const [menu, setMenu] = useState<null | 'badge' | 'kind'>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => {
      if (!headerRef.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const touch = (): void => dispatch({ type: 'markTouched' })

  const splitWith = (dir: 'row' | 'col', kind: PaneKind): void => {
    touch()
    const p =
      kind === 'editor'
        ? editorPane({ title: 'untitled.ts', cwd: pane.cwd, root: pane.root, lines: EDITOR_SCAFFOLD })
        : termPane({
            title: kind === 'agent' ? 'claude' : 'pwsh',
            kind,
            cwd: pane.cwd,
            root: pane.root,
            badge: kind === 'agent' ? { label: 'Claude Code', color: '#d8a956' } : undefined
          })
    dispatch({ type: 'splitPane', paneId: pane.id, dir, pane: p })
    setMenu(null)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const from = e.dataTransfer.getData('text/sim-pane')
    if (from && from !== pane.id) dispatch({ type: 'swapPanes', a: from, b: pane.id })
  }

  return (
    <div
      className={cn(
        // No overflow-hidden here: the header popovers must be able to escape a
        // short pane. The body wrapper clips instead (rounded-b-lg below).
        'group/pane relative flex h-full min-h-0 flex-col rounded-lg border bg-term transition-colors',
        active ? 'border-accent/45' : 'border-edge-2'
      )}
      onMouseDownCapture={() => dispatch({ type: 'setActivePane', paneId: pane.id })}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header
        ref={headerRef}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-t-lg border-b border-edge-2 bg-raised pr-1 pl-2"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/sim-pane', pane.id)
          e.dataTransfer.effectAllowed = 'move'
          touch()
        }}
      >
        <GripVertical size={11} className="shrink-0 cursor-grab text-ink-3/60 active:cursor-grabbing" />
        <Icon size={11} className={cn('shrink-0', pane.kind === 'agent' ? 'text-accent' : 'text-ink-3')} />
        <span
          className={cn(
            'min-w-0 truncate font-ui text-[11.5px] font-medium',
            active ? 'text-ink' : 'text-ink-3'
          )}
        >
          {pane.title}
        </span>
        {pane.cwd && (
          <span className="hidden min-w-0 shrink items-center gap-1 font-ui text-[10.5px] text-ink-3 sm:flex">
            <Folder size={10} className="shrink-0 opacity-70" />
            <span className="truncate">{pane.cwd}</span>
          </span>
        )}
        {pane.badge && (
          <span
            className="shrink-0 truncate rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
            style={{
              backgroundColor: `${pane.badge.color}2e`,
              color: `color-mix(in srgb, ${pane.badge.color} 70%, var(--ink) 30%)`
            }}
          >
            {pane.badge.label}
          </span>
        )}
        {pane.pinned && <Pin size={10} className="shrink-0 fill-current text-accent" />}

        <div
          className={cn(
            'ml-auto flex shrink-0 items-center transition-opacity duration-150',
            active || menu
              ? 'opacity-100'
              : 'opacity-0 group-hover/pane:opacity-100 group-focus-within/pane:opacity-100'
          )}
        >
          <button className={iconBtn} aria-label="Set badge" onClick={() => setMenu(menu === 'badge' ? null : 'badge')}>
            <Tag size={12} />
          </button>
          <button
            className={cn(iconBtn, pane.pinned && 'text-accent')}
            aria-label={pane.pinned ? 'Unpin pane' : 'Pin pane'}
            onClick={() => {
              touch()
              dispatch({ type: 'togglePin', paneId: pane.id })
            }}
          >
            <Pin size={12} className={pane.pinned ? 'fill-current' : ''} />
          </button>
          <button className={iconBtn} aria-label="Split right" onClick={() => splitWith('row', 'terminal')}>
            <SquareSplitHorizontal size={12} />
          </button>
          <button className={iconBtn} aria-label="Split down" onClick={() => splitWith('col', 'terminal')}>
            <SquareSplitVertical size={12} />
          </button>
          <button className={iconBtn} aria-label="Pane menu" onClick={() => setMenu(menu === 'kind' ? null : 'kind')}>
            <ChevronDown size={12} />
          </button>
          <button
            className={cn(iconBtn, 'hover:bg-danger/20 hover:text-danger', (!canClose || pane.pinned) && 'opacity-40')}
            aria-label="Close pane"
            onClick={() => {
              touch()
              dispatch({ type: 'closePane', paneId: pane.id })
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Badge picker */}
        {menu === 'badge' && (
          <div className="absolute top-7 right-1 z-40 max-h-[min(220px,60vh)] w-44 overflow-y-auto rounded-lg border border-edge bg-overlay p-1.5 shadow-xl">
            <p className="px-1.5 py-1 font-ui text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Badge</p>
            {BADGE_PRESETS.map((b) => (
              <button
                key={b.label}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left font-ui text-[12px] text-ink-2 hover:bg-raised hover:text-ink"
                onClick={() => {
                  touch()
                  dispatch({ type: 'setBadge', paneId: pane.id, badge: b })
                  setMenu(null)
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                {b.label}
              </button>
            ))}
            <button
              className="mt-0.5 w-full rounded-md px-1.5 py-1.5 text-left font-ui text-[12px] text-ink-3 hover:bg-raised hover:text-ink"
              onClick={() => {
                touch()
                dispatch({ type: 'setBadge', paneId: pane.id, badge: undefined })
                setMenu(null)
              }}
            >
              Clear badge
            </button>
          </div>
        )}

        {/* Pane / split menu */}
        {menu === 'kind' && (
          <div className="absolute top-7 right-1 z-40 max-h-[min(220px,60vh)] w-48 overflow-y-auto rounded-lg border border-edge bg-overlay p-1.5 shadow-xl">
            <MenuItem icon={SquareSplitHorizontal} label="Split right · terminal" onClick={() => splitWith('row', 'terminal')} />
            <MenuItem icon={SquareSplitVertical} label="Split down · terminal" onClick={() => splitWith('col', 'terminal')} />
            <MenuItem icon={Bot} label="Split right · Claude Code" onClick={() => splitWith('row', 'agent')} />
            <MenuItem icon={FileCode2} label="Split down · editor" onClick={() => splitWith('col', 'editor')} />
            <div className="my-1 h-px bg-edge-2" />
            <MenuItem
              icon={X}
              label="Close pane"
              disabled={!canClose || pane.pinned}
              onClick={() => {
                touch()
                dispatch({ type: 'closePane', paneId: pane.id })
                setMenu(null)
              }}
            />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg">
        {pane.kind === 'editor' ? <EditorBody pane={pane} /> : <SimTerminal pane={pane} active={active} />}
      </div>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled
}: {
  icon: typeof TerminalIcon
  label: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left font-ui text-[12px] text-ink-2 hover:bg-raised hover:text-ink',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-ink-2'
      )}
    >
      <Icon size={13} className="shrink-0 text-ink-3" />
      {label}
    </button>
  )
}
