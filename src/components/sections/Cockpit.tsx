import type { ReactNode } from 'react'
import {
  TerminalSquare,
  Bot,
  FileCode2,
  FolderTree,
  ListTodo,
  FolderGit2,
  type LucideIcon
} from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { cn } from '../../lib/cn'

/** A tiny mono keycap chip, reused for the keyboard-shortcut hints. */
function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="rounded border border-edge bg-raised px-1 font-mono text-[11px] leading-5 text-ink-2">
      {children}
    </kbd>
  )
}

type Cell = {
  icon: LucideIcon
  title: string
  body: string
  /** responsive grid spans — mobile is always full width (collapses to 1 col). */
  span: string
  /** background / border treatment for visual rhythm. */
  panel: string
  /** faint blueprint grid behind the cell. */
  grid?: boolean
  /** full-width row layout instead of a stacked card. */
  wide?: boolean
  extra?: ReactNode
}

const cells: Cell[] = [
  {
    icon: TerminalSquare,
    title: 'Real terminals',
    body: 'True PTYs via ConPTY and node-pty, GPU-rendered with xterm.js. vim, Ctrl+C, ANSI colors, and interactive CLIs all behave exactly as they should.',
    span: 'md:col-span-2 lg:col-span-4',
    panel: 'border-l-2 border-l-accent/60 bg-base',
    grid: true,
    extra: (
      <>
        <Kbd>vim</Kbd>
        <Kbd>Ctrl+C</Kbd>
        <Kbd>Ctrl+F</Kbd>
        <span className="font-ui text-[12px] text-ink-3">buffer search · drag a file to insert its path</span>
      </>
    )
  },
  {
    icon: Bot,
    title: 'AI agents',
    body: 'Run Claude Code in any pane as a real terminal: plugins, slash commands, and interactive approvals, all intact. Launch it with Ctrl+Enter and run several across tabs.',
    span: 'md:col-span-1 lg:col-span-2',
    panel: 'border border-accent/30 bg-accent-soft'
  },
  {
    icon: FileCode2,
    title: 'Inline editor',
    body: 'The Monaco engine, the same one as VS Code, sitting next to your terminals. Multi-tab, format on save, find and replace.',
    span: 'md:col-span-1 lg:col-span-2',
    panel: 'border border-edge bg-raised',
    extra: (
      <>
        <Kbd>Ctrl+P</Kbd>
        <span className="font-ui text-[12px] text-ink-3">Quick Open</span>
      </>
    )
  },
  {
    icon: FolderTree,
    title: 'File browser',
    body: 'A live-watching tree. Inline create and rename, Recycle Bin delete, reveal in Explorer, and drag a path straight into a terminal.',
    span: 'md:col-span-1 lg:col-span-2',
    panel: 'border border-edge bg-raised'
  },
  {
    icon: ListTodo,
    title: 'Task board',
    body: 'A global five-column kanban. Send a card straight to a pane as a command or an agent prompt. Auto-review on exit 0.',
    span: 'md:col-span-1 lg:col-span-2',
    panel: 'border border-edge bg-raised'
  },
  {
    icon: FolderGit2,
    title: 'Projects',
    body: 'Root directory, shell, layout, DPAPI-encrypted env vars, and auto-start commands, one click away. Each tab can be its own project.',
    span: 'md:col-span-2 lg:col-span-6',
    panel: 'border border-edge border-l-2 border-l-accent/60 bg-raised',
    wide: true,
    extra: (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {['#4cc38a', '#5b9dd9', '#b583d9'].map((c) => (
            <span key={c} aria-hidden className="h-2 w-2 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <Kbd>Ctrl+K</Kbd>
      </div>
    )
  }
]

export function Cockpit(): React.JSX.Element {
  return (
    <Section id="cockpit" className="py-24 sm:py-32">
      <SectionHeading
        title={<>One window. Your whole dev cockpit.</>}
        sub={
          <>
            Terminals, AI agents, an editor, a file browser, a task board, and per-project setups, side
            by side with no alt-tabbing.
          </>
        }
      />

      {/* Bento grid — 1 col on mobile, 2 on md, 6 on lg with two wider cells. */}
      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        {cells.map((cell, i) => {
          const Icon = cell.icon
          return (
            <Reveal
              key={cell.title}
              delay={i * 70}
              className={cn(
                'spotlight group relative overflow-hidden rounded-xl p-6 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent/40',
                cell.span,
                cell.panel
              )}
            >
              {cell.grid && (
                <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
              )}

              {cell.wide ? (
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
                  <div className="flex items-center gap-3 sm:w-[230px] sm:shrink-0">
                    <Icon size={20} className="shrink-0 text-accent" />
                    <h3 className="font-ui text-[15px] font-semibold text-ink">{cell.title}</h3>
                  </div>
                  <p className="flex-1 font-ui text-[14px] leading-relaxed text-ink-2">{cell.body}</p>
                  {cell.extra && <div className="shrink-0">{cell.extra}</div>}
                </div>
              ) : (
                <div className="relative flex h-full flex-col">
                  <Icon size={20} className="text-accent" />
                  <h3 className="mt-4 font-ui text-[15px] font-semibold text-ink">{cell.title}</h3>
                  <p className="mt-2 max-w-[48ch] font-ui text-[14px] leading-relaxed text-ink-2">
                    {cell.body}
                  </p>
                  {cell.extra && (
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">{cell.extra}</div>
                  )}
                </div>
              )}
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
