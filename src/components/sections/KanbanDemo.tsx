import { useState } from 'react'
import { AlignLeft, ListTodo, Search, SendHorizontal } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { cn } from '../../lib/cn'

type ColId = 'backlog' | 'todo' | 'inprogress' | 'inreview' | 'done'
const COLUMNS: { id: ColId; label: string; accent: string }[] = [
  { id: 'backlog', label: 'Backlog', accent: '#5c677c' },
  { id: 'todo', label: 'Todo', accent: '#5b9dd9' },
  { id: 'inprogress', label: 'In Progress', accent: '#d8a956' },
  { id: 'inreview', label: 'In Review', accent: '#b583d9' },
  { id: 'done', label: 'Done', accent: '#4cc38a' }
]
const ORDER: ColId[] = ['backlog', 'todo', 'inprogress', 'inreview', 'done']

type Prio = 'low' | 'medium' | 'high' | 'critical'
const PRIO: Record<Prio, { label: string; color: string }> = {
  low: { label: 'Low', color: '#9aa4b8' },
  medium: { label: 'Medium', color: '#5b9dd9' },
  high: { label: 'High', color: '#e8913a' },
  critical: { label: 'Critical', color: '#ed5d5d' }
}
const TAG_COLORS = ['#d8a956', '#5b9dd9', '#4cc38a', '#ed5d5d', '#b583d9', '#4fb8c9', '#e8b130']

interface Card {
  id: string
  col: ColId
  title: string
  prio: Prio
  tags: string[]
  hasDesc?: boolean
  pane?: number
}

const SEED: Card[] = [
  { id: 'c1', col: 'backlog', title: 'Build the encrypted env vault', prio: 'high', tags: ['backend', 'security'], hasDesc: true },
  { id: 'c2', col: 'backlog', title: 'Design the onboarding wizard', prio: 'medium', tags: ['design'] },
  { id: 'c3', col: 'backlog', title: 'Write the IPC API reference', prio: 'low', tags: ['docs'] },
  { id: 'c4', col: 'todo', title: 'Wire up Web Push notifications', prio: 'critical', tags: ['remotedeck', 'push'], hasDesc: true },
  { id: 'c5', col: 'todo', title: 'Project switcher fuzzy search', prio: 'high', tags: ['ux'] },
  { id: 'c6', col: 'inprogress', title: 'RemoteDeck mobile key bar', prio: 'high', tags: ['mobile'], pane: 3, hasDesc: true },
  { id: 'c7', col: 'inprogress', title: 'Theme cross-fade on apply', prio: 'medium', tags: ['ui'] },
  { id: 'c8', col: 'inreview', title: 'DPAPI secret storage', prio: 'critical', tags: ['security'], pane: 2 },
  { id: 'c9', col: 'done', title: 'OSC 133 shell integration', prio: 'medium', tags: ['terminal'] },
  { id: 'c10', col: 'done', title: 'Pane drag and swap', prio: 'low', tags: ['ux'] }
]

function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

export function KanbanDemo(): React.JSX.Element {
  const [cards, setCards] = useState<Card[]>(SEED)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<ColId | null>(null)

  const move = (id: string, col: ColId): void =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, col } : c)))

  const advance = (id: string): void =>
    setCards((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c
        const next = ORDER[Math.min(ORDER.indexOf(c.col) + 1, ORDER.length - 1)]
        return { ...c, col: next }
      })
    )

  return (
    <Section id="board" className="py-24 sm:py-32">
      <SectionHeading
        title="A board that runs your tasks."
        sub="Drag a card to its column, then send it straight to a pane as a terminal command or an agent prompt. When the command exits 0, the board offers to move it to review."
      />

      <Reveal delay={100} className="mt-12">
        <div className="window-shadow overflow-hidden rounded-xl border border-edge bg-base">
          {/* board header */}
          <header className="flex h-11 items-center gap-3 border-b border-edge-2 px-4">
            <span className="flex items-center gap-2 font-ui text-[13px] font-semibold text-ink">
              <ListTodo size={15} className="text-accent" />
              Task Board
            </span>
            <span className="ml-2 hidden items-center gap-1.5 rounded-md border border-edge bg-term px-2 py-1 sm:flex">
              <Search size={11} className="text-ink-3" />
              <span className="font-ui text-[11.5px] text-ink-3">Search tasks…</span>
            </span>
            <span className="ml-auto hidden font-ui text-[11px] text-ink-3 sm:inline">
              drag a card, or tap to advance it
            </span>
          </header>

          {/* columns */}
          <div className="flex gap-3 overflow-x-auto p-3">
            {COLUMNS.map((col) => {
              const colCards = cards.filter((c) => c.col === col.id)
              return (
                <section
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOverCol(col.id)
                  }}
                  onDragLeave={() => setOverCol((o) => (o === col.id ? null : o))}
                  onDrop={() => {
                    if (dragId) move(dragId, col.id)
                    setDragId(null)
                    setOverCol(null)
                  }}
                  className={cn(
                    'flex w-[230px] shrink-0 flex-col rounded-xl border transition-colors duration-100',
                    overCol === col.id ? 'border-accent/60 bg-raised/60' : 'border-edge-2 bg-raised/30'
                  )}
                >
                  <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.accent }} />
                    <h3 className="font-ui text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
                      {col.label}
                    </h3>
                    <span className="ml-auto font-ui text-[10.5px] text-ink-3 tabular-nums">
                      {colCards.length}
                    </span>
                  </header>

                  <div className="flex min-h-[140px] flex-col gap-1.5 px-2 pb-2">
                    {colCards.length === 0 && (
                      <p className="px-2 py-3 text-center font-ui text-[11px] text-ink-3 italic">
                        {col.id === 'backlog' ? 'Ideas land here' : 'Nothing here'}
                      </p>
                    )}
                    {colCards.map((card) => {
                      const prio = PRIO[card.prio]
                      return (
                        <article
                          key={card.id}
                          draggable
                          role="button"
                          tabIndex={0}
                          aria-label={`Advance task "${card.title}" to the next column`}
                          onDragStart={() => setDragId(card.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => advance(card.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              advance(card.id)
                            }
                          }}
                          className={cn(
                            'cursor-grab rounded-lg border border-edge-2 bg-raised px-2.5 py-2 transition-[border-color,box-shadow,opacity,transform] duration-100 hover:border-edge hover:shadow-md focus-visible:border-accent active:cursor-grabbing',
                            dragId === card.id && 'opacity-40 shadow-xl'
                          )}
                        >
                          <p className="font-ui text-[12px] leading-snug font-medium text-ink">
                            {card.title}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span
                              className="rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
                              style={{ backgroundColor: `${prio.color}1f`, color: prio.color }}
                            >
                              {prio.label}
                            </span>
                            {card.tags.map((tag) => {
                              const c = tagColor(tag)
                              return (
                                <span
                                  key={tag}
                                  className="rounded-full px-1.5 py-px font-ui text-[9.5px] font-medium"
                                  style={{ backgroundColor: `${c}26`, color: c }}
                                >
                                  #{tag}
                                </span>
                              )
                            })}
                            {card.hasDesc && <AlignLeft size={9} className="text-ink-3" />}
                            {card.pane != null && (
                              <span className="ml-auto inline-flex items-center gap-0.5 font-mono text-[9.5px] text-ink-3">
                                <SendHorizontal size={9} />P{card.pane}
                              </span>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
