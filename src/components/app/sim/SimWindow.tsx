import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, ListTodo, Plus, Settings, Smartphone, X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { toast } from '../../../lib/toast'
import { DOWNLOAD_URL } from '../../../lib/links'
import { useInView } from '../../../lib/useInView'
import type { Deck } from './types'
import { leafPaneIds } from './tree'
import { SimProvider, useSim } from './store'
import { RunnerProvider, useRunner } from './runner'
import { SimPaneTree } from './SimPaneTree'
import { SimPhone } from './SimPhone'
import { KanbanOverlay, RemoteOverlay, SettingsOverlay } from './overlays'

const TEMPLATES = [
  { label: 'Single', rows: 1, cols: 1 },
  { label: 'Split', rows: 1, cols: 2 },
  { label: 'Quad', rows: 2, cols: 2 },
  { label: 'Six', rows: 2, cols: 3 },
  { label: 'Eight', rows: 2, cols: 4 }
]

const demoToast = (): void =>
  toast('This is a live preview — download to drive the real window.', { kind: 'download', href: DOWNLOAD_URL })

/* ───────────────────────── Deck tab (switch · rename · close) ───────────────────────── */

function DeckTab({ deck, active, closable }: { deck: Deck; active: boolean; closable: boolean }): React.JSX.Element {
  const { dispatch } = useSim()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(deck.name)

  const commit = (): void => {
    dispatch({ type: 'renameDeck', deckId: deck.id, name: val })
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setVal(deck.name)
            setEditing(false)
          }
        }}
        className="h-7 w-24 rounded-md border border-accent/60 bg-base px-2 font-ui text-[11.5px] text-ink outline-none"
        aria-label="Rename deck"
      />
    )
  }

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={active}
      className={cn(
        'group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2.5 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        active ? 'bg-overlay' : 'hover:bg-raised'
      )}
      onClick={() => dispatch({ type: 'setActiveDeck', deckId: deck.id })}
      onDoubleClick={() => {
        setVal(deck.name)
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          dispatch({ type: 'setActiveDeck', deckId: deck.id })
        } else if (e.key === 'F2') {
          setVal(deck.name)
          setEditing(true)
        }
      }}
      title="Click to switch · double-click (or F2) to rename"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: deck.color }} />
      <span className={cn('font-ui text-[11.5px] font-medium', active ? 'text-ink' : 'text-ink-3')}>{deck.name}</span>
      {closable && (
        <button
          className="ml-0.5 rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:bg-base hover:text-ink group-hover/tab:opacity-100 focus-visible:opacity-100"
          aria-label={`Close ${deck.name}`}
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: 'closeDeck', deckId: deck.id })
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

function TemplatePicker({ onPick }: { onPick: (rows: number, cols: number) => void }): React.JSX.Element {
  return (
    <div className="absolute top-8 left-2 z-40 w-[230px] rounded-lg border border-edge bg-overlay p-2 shadow-xl">
      <p className="px-1 pb-1.5 font-ui text-[10px] font-semibold tracking-wider text-ink-3 uppercase">New deck</p>
      <div className="grid grid-cols-3 gap-1.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => onPick(t.rows, t.cols)}
            className="flex flex-col items-center gap-1.5 rounded-md border border-edge-2 px-2 py-2 transition-colors hover:border-accent/60 hover:bg-raised"
          >
            <span
              className="grid gap-[2px]"
              style={{ width: 34, height: 22, gridTemplateRows: `repeat(${t.rows},1fr)`, gridTemplateColumns: `repeat(${t.cols},1fr)` }}
            >
              {Array.from({ length: t.rows * t.cols }).map((_, i) => (
                <span key={i} className="rounded-[2px] bg-edge" />
              ))}
            </span>
            <span className="font-ui text-[10.5px] text-ink-3">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function WindowControls(): React.JSX.Element {
  const { state, dispatch } = useSim()
  const ctrl = 'flex w-9 items-center justify-center text-ink-3 transition-colors hover:text-ink'
  return (
    <div className="flex h-full items-stretch">
      <button className={ctrl} aria-label="Minimize (preview)" onClick={demoToast}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className={ctrl}
        data-sim-maximize
        aria-label={state.maximized ? 'Restore' : 'Maximize'}
        onClick={() => dispatch({ type: 'setMaximized', maximized: !state.maximized })}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="flex w-9 items-center justify-center text-ink-3 transition-colors hover:bg-danger hover:text-white"
        aria-label="Close (preview)"
        onClick={demoToast}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

/* ───────────────────────── The window ───────────────────────── */

const toolBtn = 'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100'

function SimWindow({ className }: { className?: string }): React.JSX.Element {
  const { state, activeDeck, dispatch } = useSim()
  const [picker, setPicker] = useState(false)
  const [deckMenu, setDeckMenu] = useState(false)
  const canClose = leafPaneIds(activeDeck.tree).length > 1

  const tool = (overlay: 'remote' | 'kanban' | 'settings'): void =>
    dispatch({ type: 'setOverlay', overlay: state.overlay === overlay ? null : overlay })

  return (
    <div className={cn('window-shadow flex min-h-0 flex-col overflow-hidden rounded-xl bg-base', className)}>
      <header className="relative flex h-9 shrink-0 items-stretch border-b border-edge-2 bg-base">
        {/* project / deck switcher */}
        <div className="flex shrink-0 items-center pr-1 pl-2">
          <button
            className="flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 transition-colors duration-100 hover:bg-raised"
            aria-haspopup="menu"
            aria-expanded={deckMenu}
            aria-label="Switch deck"
            onClick={() => setDeckMenu((v) => !v)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: activeDeck.project.color }} />
            <span className="max-w-[120px] truncate font-ui text-[11.5px] font-semibold text-ink-2">
              {activeDeck.project.name}
            </span>
            <ChevronsUpDown size={11} className="shrink-0 text-ink-3" />
          </button>
        </div>

        <div className="mx-1.5 my-2 w-px shrink-0 self-stretch bg-edge-2" aria-hidden />

        {/* deck tabs — the single flexible, horizontally-scrollable region */}
        <div role="tablist" aria-label="Decks" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
          {state.decks.map((d) => (
            <DeckTab key={d.id} deck={d} active={d.id === activeDeck.id} closable={state.decks.length > 1} />
          ))}
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink"
            aria-label="New deck"
            onClick={() => setPicker((v) => !v)}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* tools — pinned */}
        <div className="flex shrink-0 items-center gap-0.5 px-1">
          <button className={cn(toolBtn, state.overlay === 'remote' ? 'bg-overlay text-accent' : 'text-ink-3 hover:bg-raised hover:text-ink')} aria-label="RemoteDeck" onClick={() => tool('remote')}>
            <Smartphone size={14} />
          </button>
          <button className={cn(toolBtn, state.overlay === 'kanban' ? 'bg-overlay text-accent' : 'text-ink-3 hover:bg-raised hover:text-ink')} aria-label="Task board" onClick={() => tool('kanban')}>
            <ListTodo size={14} />
          </button>
          <button className={cn(toolBtn, state.overlay === 'settings' ? 'bg-overlay text-accent' : 'text-ink-3 hover:bg-raised hover:text-ink')} aria-label="Themes & settings" onClick={() => tool('settings')}>
            <Settings size={14} />
          </button>
        </div>

        <div className="shrink-0">
          <WindowControls />
        </div>

        {deckMenu && (
          <>
            <div className="fixed inset-0 z-30" onMouseDown={() => setDeckMenu(false)} aria-hidden />
            <div role="menu" className="absolute top-9 left-2 z-40 w-52 rounded-lg border border-edge bg-overlay p-1.5 shadow-xl">
              <p className="px-1.5 py-1 font-ui text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Decks</p>
              {state.decks.map((d) => (
                <button
                  key={d.id}
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left font-ui text-[12px] text-ink-2 hover:bg-raised hover:text-ink"
                  onClick={() => {
                    dispatch({ type: 'setActiveDeck', deckId: d.id })
                    setDeckMenu(false)
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {d.id === activeDeck.id && <Check size={13} className="shrink-0 text-accent" />}
                </button>
              ))}
              <div className="my-1 h-px bg-edge-2" />
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left font-ui text-[12px] text-ink-2 hover:bg-raised hover:text-ink"
                onClick={() => {
                  setDeckMenu(false)
                  setPicker(true)
                }}
              >
                <Plus size={13} className="shrink-0 text-ink-3" />
                New deck…
              </button>
            </div>
          </>
        )}

        {picker && (
          <>
            <div className="fixed inset-0 z-30" onMouseDown={() => setPicker(false)} aria-hidden />
            <TemplatePicker
              onPick={(rows, cols) => {
                dispatch({ type: 'addDeck', rows, cols, label: `deck-${state.decks.length + 1}` })
                setPicker(false)
              }}
            />
          </>
        )}
      </header>

      {/* content */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full p-2">
          <SimPaneTree node={activeDeck.tree} activePaneId={activeDeck.activePaneId} canClose={canClose} />
        </div>
        {state.overlay === 'settings' && <SettingsOverlay />}
        {state.overlay === 'kanban' && <KanbanOverlay />}
        {state.overlay === 'remote' && <RemoteOverlay />}
      </div>
    </div>
  )
}

/* ───────────────────────── Autoplay + root ───────────────────────── */

function Autoplay({ inView }: { inView: boolean }): null {
  const { state } = useSim()
  const { run } = useRunner()
  const started = useRef(false)

  useEffect(() => {
    if (!inView || started.current) return
    started.current = true
    if (state.touched) return
    const deck = state.decks.find((d) => d.id === state.activeDeckId) ?? state.decks[0]
    leafPaneIds(deck.tree).forEach((id) => {
      const p = state.panes[id]
      if (p?.intro && (p.kind === 'terminal' || p.kind === 'agent')) void run(p.id, p.intro, { auto: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  return null
}

/** Accessible full-viewport modal: dialog semantics, focus-in/out, Tab trap. */
function MaximizedModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    return () => {
      // Restore focus to the (now-remounted) maximize control after the inline
      // window paints back in.
      window.setTimeout(() => {
        ;(document.querySelector('[data-sim-maximize]') as HTMLElement | null)?.focus()
      }, 0)
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const focusables = Array.from(
      ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const activeEl = document.activeElement
    if (e.shiftKey && (activeEl === first || activeEl === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="TerminalDeck — maximized preview"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm outline-none sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>,
    document.body
  )
}

function HeroSimInner(): React.JSX.Element {
  const { state, dispatch } = useSim()
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15 })
  const closeMax = (): void => dispatch({ type: 'setMaximized', maximized: false })

  return (
    <>
      <Autoplay inView={inView} />

      {/* The inline window stays mounted (so layout/scroll position is stable);
          when maximized we hide it and render a full-viewport modal via a portal
          to escape the hero's transformed/reveal ancestor. */}
      <div
        ref={ref}
        className={cn(
          'relative mt-14 flex items-end justify-center xl:justify-start',
          state.maximized && 'pointer-events-none opacity-0'
        )}
        aria-hidden={state.maximized}
      >
        {!state.maximized && (
          <>
            <SimWindow className="h-[clamp(440px,54vw,580px)] w-full xl:flex-1" />

            {/* Phone mirror — the same active terminal, on your phone. */}
            <div className="z-20 mb-[-2.5rem] hidden shrink-0 xl:-ml-12 xl:block">
              <SimPhone width={208} />
              <div className="mt-2 text-center font-ui text-[11px] text-ink-3">
                the <span className="text-accent">same</span> terminal, on your phone
              </div>
            </div>
          </>
        )}
        {/* Reserve height so the page doesn't jump when maximizing. */}
        {state.maximized && <div className="h-[clamp(440px,54vw,580px)] w-full" />}
      </div>

      {state.maximized && (
        <MaximizedModal onClose={closeMax}>
          <SimWindow className="h-[min(84vh,720px)] w-[min(1180px,96vw)]" />
        </MaximizedModal>
      )}
    </>
  )
}

/** The interactive hero simulation: a drivable miniature of TerminalDeck. */
export function HeroSim(): React.JSX.Element {
  return (
    <SimProvider>
      <RunnerProvider>
        <HeroSimInner />
      </RunnerProvider>
    </SimProvider>
  )
}
