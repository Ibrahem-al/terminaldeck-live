import { Check, Minus } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { cn } from '../../lib/cn'

type Cell = { ok: boolean; note?: string }
type Row = { feature: string; cells: Cell[] }

const Y: Cell = { ok: true }
const N: Cell = { ok: false }

/** Column order matches every row's `cells` array, left to right. */
const PRODUCTS: ReadonlyArray<{ name: string; highlight: boolean }> = [
  { name: 'TerminalDeck', highlight: true },
  { name: 'Windows Terminal', highlight: false },
  { name: 'Warp', highlight: false },
  { name: 'VS Code terminal', highlight: false }
]

const ROWS: Row[] = [
  { feature: 'Real PTYs (ConPTY)', cells: [Y, Y, Y, Y] },
  { feature: 'Multi-pane grid, 1 to 16', cells: [Y, Y, Y, { ok: false, note: 'Limited' }] },
  {
    feature: 'Built for parallel AI agents',
    cells: [Y, N, { ok: false, note: 'AI features' }, { ok: false, note: 'Via extensions' }]
  },
  {
    feature: 'Inline code editor (Monaco)',
    cells: [Y, N, N, { ok: true, note: 'It is the editor' }]
  },
  { feature: 'Kanban task board', cells: [Y, N, N, { ok: false, note: 'Via extensions' }] },
  {
    feature: 'Per-project setups + encrypted env',
    cells: [Y, { ok: false, note: 'Profiles' }, { ok: false, note: 'Profiles' }, { ok: false, note: 'Limited' }]
  },
  { feature: 'Phone control of your terminals (RemoteDeck)', cells: [Y, N, N, N] },
  { feature: 'Phone notifications on task done', cells: [Y, N, N, N] },
  { feature: 'Fully local, no account', cells: [Y, Y, { ok: false, note: 'Account-based' }, Y] }
]

/** A single yes / no verdict with an optional small qualifier underneath. */
function Verdict({ cell }: { cell: Cell }): React.JSX.Element {
  return (
    <span className="inline-flex flex-col items-center gap-1">
      {cell.ok ? (
        <Check size={16} strokeWidth={2.25} className="text-ok" aria-hidden />
      ) : (
        <Minus size={16} strokeWidth={2.25} className="text-ink-3" aria-hidden />
      )}
      <span className="sr-only">{cell.ok ? 'Yes' : 'No'}</span>
      {cell.note && (
        <span className="font-ui text-[11px] leading-tight text-ink-3">{cell.note}</span>
      )}
    </span>
  )
}

export function Comparison(): React.JSX.Element {
  return (
    <Section id="comparison" className="py-24 sm:py-32">
      <SectionHeading
        title={<>How it compares</>}
        sub={
          <>
            A single window in place of a stack of separate tools. Here is where it pulls ahead, and
            where it does not.
          </>
        }
      />

      {/* One wide table. Below md it scrolls sideways inside the framed card while the
          feature column stays pinned, so the row labels never leave the viewport. */}
      <Reveal delay={80} className="mt-14 sm:mt-16">
        <div className="overflow-x-auto rounded-xl border border-edge bg-raised shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
          <table className="w-full min-w-[680px] border-separate border-spacing-0">
            <caption className="sr-only">
              Feature comparison of TerminalDeck, Windows Terminal, Warp, and the VS Code terminal.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 border-b border-edge bg-raised px-4 py-3.5 text-left font-mono text-[11px] font-semibold tracking-[0.16em] text-ink-3 uppercase"
                >
                  Capability
                </th>
                {PRODUCTS.map((p) => (
                  <th
                    key={p.name}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-3.5 text-center font-mono text-[11px] font-semibold tracking-[0.16em] uppercase',
                      p.highlight
                        ? 'rounded-t-lg border-x border-t border-accent/40 bg-accent-soft text-accent'
                        : 'border-b border-edge text-ink-2'
                    )}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                const isLast = i === ROWS.length - 1
                return (
                  <Reveal as="tr" key={row.feature} delay={i * 45}>
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 min-w-[200px] bg-raised px-4 py-3.5 text-left align-middle font-ui text-[13.5px] font-medium text-ink',
                        !isLast && 'border-b border-edge-2'
                      )}
                    >
                      {row.feature}
                    </th>
                    {row.cells.map((cell, ci) => {
                      const highlight = PRODUCTS[ci].highlight
                      return (
                        <td
                          key={ci}
                          className={cn(
                            'px-4 py-3.5 text-center align-middle',
                            highlight
                              ? cn('border-x border-accent/40 bg-accent-soft', isLast && 'rounded-b-lg border-b')
                              : !isLast && 'border-b border-edge-2'
                          )}
                        >
                          <Verdict cell={cell} />
                        </td>
                      )
                    })}
                  </Reveal>
                )
              })}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal as="p" delay={120} className="mt-5 text-center font-mono text-[12px] text-ink-3">
        Comparisons are directional; competitors evolve.
      </Reveal>
    </Section>
  )
}
