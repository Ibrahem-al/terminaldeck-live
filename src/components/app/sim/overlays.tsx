import { useState, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowUpRight,
  Check,
  ListTodo,
  Palette,
  SendHorizontal,
  Smartphone,
  X,
  type LucideIcon
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { scrollToId } from '../../../lib/links'
import { toast } from '../../../lib/toast'
import { THEMES, useTheme } from '../../../lib/theme'
import { leafPaneIds } from './tree'
import { useSim } from './store'
import { useRunner } from './runner'

function OverlayShell({
  icon: Icon,
  title,
  sectionId,
  sectionLabel,
  children
}: {
  icon: LucideIcon
  title: string
  sectionId?: string
  sectionLabel?: string
  children: ReactNode
}): React.JSX.Element {
  const { dispatch } = useSim()
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-base/96 backdrop-blur-sm">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-edge-2 px-3">
        <Icon size={14} className="text-accent" />
        <span className="font-ui text-[12.5px] font-semibold text-ink">{title}</span>
        <span className="flex-1" />
        {sectionId && (
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 font-ui text-[11px] text-ink-3 transition-colors hover:text-ink"
            onClick={() => {
              dispatch({ type: 'setOverlay', overlay: null })
              scrollToId(sectionId)
            }}
          >
            open full {sectionLabel}
            <ArrowUpRight size={12} />
          </button>
        )}
        <button
          className="rounded-md p-1 text-ink-3 transition-colors hover:bg-overlay hover:text-ink"
          aria-label="Close panel"
          onClick={() => dispatch({ type: 'setOverlay', overlay: null })}
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">{children}</div>
    </div>
  )
}

/* ───────────────────────── Settings · live themes ───────────────────────── */

export function SettingsOverlay(): React.JSX.Element {
  const { themeId, commit, preview } = useTheme()
  return (
    <OverlayShell icon={Palette} title="Themes" sectionId="themes" sectionLabel="gallery">
      <p className="mb-3 font-ui text-[12px] text-ink-2">
        Nine originals, not recolors. Hover to preview across the whole page; click to keep it.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" onMouseLeave={() => preview(null)}>
        {THEMES.map((t) => {
          const isActive = t.id === themeId
          return (
            <button
              key={t.id}
              onMouseEnter={() => preview(t.id)}
              onFocus={() => preview(t.id)}
              onClick={() => commit(t.id)}
              aria-pressed={isActive}
              className={cn(
                'group block overflow-hidden rounded-lg border text-left transition-all duration-150 hover:-translate-y-0.5',
                isActive ? 'border-accent/60' : 'border-edge-2 hover:border-edge'
              )}
            >
              <div className="flex h-14 flex-col justify-between p-2" style={{ backgroundColor: t.bg[0] }}>
                <div className="flex gap-1">
                  {[t.accent, t.ansi[2], t.ansi[4], t.ansi[5]].map((c, j) => (
                    <span key={j} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c, boxShadow: `0 0 0 1px ${t.edge[0]}` }} />
                  ))}
                </div>
                <span className="font-mono text-[10px]" style={{ color: t.term.ink }}>
                  <span style={{ color: t.accent }}>❯</span> {t.id}
                </span>
              </div>
              <div className="flex items-center justify-between border-t px-2 py-1.5" style={{ backgroundColor: t.bg[1], borderColor: t.edge[1] }}>
                <span className="truncate font-ui text-[11px] font-semibold" style={{ color: t.ink[0] }}>
                  {t.name}
                </span>
                {isActive && <Check size={12} style={{ color: t.accent }} />}
              </div>
            </button>
          )
        })}
      </div>
    </OverlayShell>
  )
}

/* ───────────────────────── Kanban · advance + send-to-pane ───────────────────────── */

type ColId = 'todo' | 'inprogress' | 'inreview' | 'done'
const KCOLS: { id: ColId; label: string; accent: string }[] = [
  { id: 'todo', label: 'To Do', accent: '#5b9dd9' },
  { id: 'inprogress', label: 'In Progress', accent: '#d8a956' },
  { id: 'inreview', label: 'In Review', accent: '#b583d9' },
  { id: 'done', label: 'Done', accent: '#4cc38a' }
]
const KORDER: ColId[] = ['todo', 'inprogress', 'inreview', 'done']

interface KCard {
  id: string
  col: ColId
  title: string
  cmd?: string
}
const KSEED: KCard[] = [
  { id: 'k1', col: 'todo', title: 'Run the test suite', cmd: 'npm test' },
  { id: 'k2', col: 'todo', title: 'Add a rate limiter', cmd: 'claude "add a token-bucket rate limiter and test it"' },
  { id: 'k3', col: 'inprogress', title: 'Start the dev server', cmd: 'npm run dev' },
  { id: 'k4', col: 'inprogress', title: 'Check git status', cmd: 'git status' },
  { id: 'k5', col: 'done', title: 'Encrypt env vars' }
]

export function KanbanOverlay(): React.JSX.Element {
  const { state, activeDeck, dispatch } = useSim()
  const { run } = useRunner()
  const [cards, setCards] = useState<KCard[]>(KSEED)

  const advance = (id: string): void =>
    setCards((cs) =>
      cs.map((c) => (c.id === id ? { ...c, col: KORDER[Math.min(KORDER.indexOf(c.col) + 1, KORDER.length - 1)] } : c))
    )

  const sendToPane = (card: KCard): void => {
    if (!card.cmd) return
    const direct = state.panes[activeDeck.activePaneId]
    const target =
      direct && direct.kind !== 'editor'
        ? direct
        : leafPaneIds(activeDeck.tree)
            .map((pid) => state.panes[pid])
            .find((p) => p && p.kind !== 'editor')
    if (!target) {
      toast('Open a terminal pane first', { kind: 'info' })
      return
    }
    dispatch({ type: 'setOverlay', overlay: null })
    void run(target.id, card.cmd)
    advance(card.id)
  }

  return (
    <OverlayShell icon={ListTodo} title="Task Board" sectionId="board" sectionLabel="board">
      <p className="mb-3 font-ui text-[12px] text-ink-2">
        Tap a card to advance it. <span className="text-accent">Send ▸</span> drops it into the active terminal as a real command.
      </p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {KCOLS.map((col) => {
          const colCards = cards.filter((c) => c.col === col.id)
          return (
            <section key={col.id} className="flex w-[180px] shrink-0 flex-col rounded-lg border border-edge-2 bg-raised/30">
              <header className="flex items-center gap-2 px-2.5 py-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.accent }} />
                <h4 className="font-ui text-[10.5px] font-semibold tracking-wider text-ink-2 uppercase">{col.label}</h4>
                <span className="ml-auto font-ui text-[10px] text-ink-3">{colCards.length}</span>
              </header>
              <div className="flex min-h-[80px] flex-col gap-1.5 px-2 pb-2">
                {colCards.map((card) => (
                  <article
                    key={card.id}
                    className="rounded-md border border-edge-2 bg-raised px-2 py-1.5 transition-colors hover:border-edge"
                  >
                    <button onClick={() => advance(card.id)} className="block w-full text-left font-ui text-[11.5px] font-medium text-ink">
                      {card.title}
                    </button>
                    {card.cmd && (
                      <button
                        onClick={() => sendToPane(card)}
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
                      >
                        <SendHorizontal size={10} /> send to pane
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </OverlayShell>
  )
}

/* ───────────────────────── RemoteDeck · pairing ───────────────────────── */

export function RemoteOverlay(): React.JSX.Element {
  const [paired, setPaired] = useState(false)
  return (
    <OverlayShell icon={Smartphone} title="RemoteDeck" sectionId="remotedeck" sectionLabel="walkthrough">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2.5">
          <p className="font-ui text-[12.5px] text-ink-2">
            Pair a phone once with the QR. Then it mirrors and drives your real terminals from any network, over an
            encrypted private mesh.
          </p>
          <div className="rounded-lg border border-edge bg-base px-3 py-2">
            <span className="font-mono text-[18px] font-bold tracking-[0.28em] text-accent">K3F7Q2</span>
            <p className="mt-0.5 font-ui text-[10.5px] text-ink-3">codes expire in 5 minutes · tailnet-private, no public URL</p>
          </div>
          <button
            onClick={() => setPaired(true)}
            disabled={paired}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 font-ui text-[12.5px] font-semibold transition-colors',
              paired ? 'bg-ok-soft text-ok' : 'bg-accent text-ink-inverse hover:brightness-105'
            )}
          >
            {paired ? (
              <>
                <Check size={14} /> Paired · iPhone 15
              </>
            ) : (
              <>
                <Smartphone size={14} /> Pair this device
              </>
            )}
          </button>
          {paired && (
            <p className="font-ui text-[11.5px] text-ink-2">
              Connected. The phone beside the window now mirrors your active terminal — type here, watch it appear there.
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl bg-white p-2.5 shadow-lg">
            <QRCodeSVG value="https://orion-pc.tail9x.ts.net/?c=K3F7Q2" size={104} level="M" marginSize={0} />
          </div>
          <span className="font-ui text-[10.5px] text-ink-3">scan to pair</span>
        </div>
      </div>
    </OverlayShell>
  )
}
