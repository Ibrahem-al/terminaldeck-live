import { SquareStack, Hourglass, KeyRound, Waves } from 'lucide-react'
import { Section } from '../ui/Section'
import { Reveal } from '../ui/Reveal'

/** Three concrete pains of running agents in raw terminals, resolved into one calmer line. */
const pains = [
  {
    icon: SquareStack,
    title: 'Window sprawl',
    body: 'Five Claude Code sessions across four terminal windows, and you have lost track of which one finished.'
  },
  {
    icon: Hourglass,
    title: 'Chained to the desk',
    body: 'A 40-minute task might need a nudge, so you stay chained to your desk waiting.'
  },
  {
    icon: KeyRound,
    title: 'Secrets in the open',
    body: 'Secrets sit in plain env files, on terminals you would never pipe through someone else’s cloud.'
  }
]

export function Problem(): React.JSX.Element {
  return (
    <Section id="problem" className="py-24 sm:py-32">
      {/* Asymmetric: framing headline on the left, hairline-divided pain list on the right.
          Collapses to a single stacked column under lg. */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
        <Reveal>
          <h2 className="max-w-[16ch] text-balance font-ui text-[clamp(1.9rem,4.4vw,3.1rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink">
            Three agents in, you lose the thread.
          </h2>
          <p className="mt-5 max-w-[42ch] text-pretty font-ui text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-ink-2">
            Parallel AI coding is the new normal. The tooling has not caught up, so the work
            scatters across windows you cannot watch at once.
          </p>
        </Reveal>

        <ul className="border-y border-edge-2 divide-y divide-edge-2">
          {pains.map((p, i) => (
            <Reveal
              as="li"
              key={p.title}
              delay={80 + i * 80}
              className="flex gap-5 py-6 sm:gap-6 sm:py-7"
            >
              <span className="shrink-0 pt-0.5 font-mono text-[13px] font-medium tracking-[0.18em] text-ink-3 tabular-nums">
                0{i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-ui text-[15px] font-semibold text-ink">
                  <p.icon size={16} className="shrink-0 text-accent" />
                  {p.title}
                </h3>
                <p className="mt-1.5 text-pretty font-ui text-[15px] leading-relaxed text-ink-2">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>

      {/* The reframe — three pains resolve into one reassuring line.
          Stacks vertically on mobile, becomes a row at sm. */}
      <Reveal
        delay={120}
        className="mt-14 flex flex-col gap-4 border-t border-edge-2 pt-10 sm:mt-16 sm:flex-row sm:items-center sm:gap-6 sm:pt-12"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Waves size={20} />
        </span>
        <div>
          <h3 className="text-balance font-ui text-[clamp(1.35rem,2.6vw,1.9rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
            There is a calmer way to run agents.
          </h3>
          <p className="mt-1.5 max-w-[54ch] text-pretty font-ui text-[15px] leading-relaxed text-ink-2">
            One window, every session in view, your secrets staying on your machine. This is what
            TerminalDeck delivers.
          </p>
        </div>
      </Reveal>
    </Section>
  )
}
