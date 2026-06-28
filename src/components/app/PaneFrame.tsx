import type { ReactNode } from 'react'
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
import { cn } from '../../lib/cn'

export type PaneKind = 'terminal' | 'agent' | 'editor'
export interface Badge {
  label: string
  color: string
}

const kindIcon: Record<PaneKind, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  agent: Bot,
  editor: FileCode2
}

/**
 * Faithful recreation of the app's pane header + frame
 * (workspace/PaneFrame.tsx). Hover reveals the badge / pin / split / close
 * affordances exactly like the real app, so the chrome reads as live.
 */
export function PaneFrame({
  kind,
  title,
  cwd,
  badge,
  pinned,
  active,
  children,
  className,
  bodyClassName
}: {
  kind: PaneKind
  title: string
  cwd?: string
  badge?: Badge
  pinned?: boolean
  active?: boolean
  children: ReactNode
  className?: string
  bodyClassName?: string
}): React.JSX.Element {
  const Icon = kindIcon[kind]
  return (
    <div
      className={cn(
        'group/pane flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-term',
        active ? 'border-accent/40' : 'border-edge-2',
        className
      )}
    >
      <header className="flex h-7 shrink-0 items-center gap-1.5 border-b border-edge-2 bg-raised pr-1 pl-2">
        <GripVertical size={11} className="shrink-0 text-ink-3/60" />
        <Icon size={11} className={cn('shrink-0', kind === 'agent' ? 'text-accent' : 'text-ink-3')} />
        <span
          className={cn(
            'shrink-0 truncate font-ui text-[11.5px] font-medium',
            active ? 'text-ink' : 'text-ink-3'
          )}
        >
          {title}
        </span>
        {cwd && (
          <span className="flex min-w-0 shrink items-center gap-1 font-ui text-[10.5px] text-ink-3">
            <Folder size={10} className="shrink-0 opacity-70" />
            <span className="truncate">{cwd}</span>
          </span>
        )}
        {badge && (
          <span
            className="shrink-0 truncate rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
            style={{
              backgroundColor: `${badge.color}2e`,
              // Nudge the label toward the active theme's ink so it keeps contrast
              // on light themes (where the raw brand hue would wash out) and dark.
              color: `color-mix(in srgb, ${badge.color} 70%, var(--ink) 30%)`
            }}
          >
            {badge.label}
          </span>
        )}
        {pinned && <Pin size={10} className="shrink-0 fill-current text-accent" />}

        <div className="ml-auto flex shrink-0 items-center text-ink-3 opacity-0 transition-opacity duration-150 group-hover/pane:opacity-100">
          {!badge && <span className="rounded p-1 hover:text-ink"><Tag size={12} /></span>}
          <span className="rounded p-1 hover:text-ink"><Pin size={12} /></span>
          <span className="rounded p-1 hover:text-ink"><SquareSplitHorizontal size={12} /></span>
          <span className="rounded p-1 hover:text-ink"><SquareSplitVertical size={12} /></span>
          <span className="rounded p-1 hover:text-ink"><ChevronDown size={12} /></span>
          <span className="rounded p-1 hover:text-ink"><X size={12} /></span>
        </div>
      </header>
      <div className={cn('min-h-0 flex-1 overflow-hidden', bodyClassName)}>{children}</div>
    </div>
  )
}
