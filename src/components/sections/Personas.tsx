import type { LucideIcon } from 'lucide-react'
import { Bot, Rocket, BellRing, ShieldCheck, MonitorCheck } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'

type Persona = {
  icon: LucideIcon
  label: string
  who: string
  hook: string
  /** md+ column span on the 6-col grid: 3 for the top pair, 2 for the bottom trio (2+3, no empty cells). */
  span: string
}

const personas: Persona[] = [
  {
    icon: Bot,
    label: 'The AI-first developer',
    who: 'Runs several coding agents across different repos at the same time.',
    hook: 'Stop alt-tabbing between five terminal windows.',
    span: 'md:col-span-3'
  },
  {
    icon: Rocket,
    label: 'The solo builder',
    who: 'Bounces between a stack of side projects, each with its own setup.',
    hook: 'Every project, pre-wired and one click away.',
    span: 'md:col-span-3'
  },
  {
    icon: BellRing,
    label: 'The walk-away engineer',
    who: 'Kicks off long builds and tasks, then steps away from the keyboard.',
    hook: 'Get pinged on your phone the second your build finishes.',
    span: 'md:col-span-2'
  },
  {
    icon: ShieldCheck,
    label: 'The privacy-conscious dev',
    who: "Won't pipe terminals or secrets through someone else's cloud.",
    hook: 'Your machine, your data, your encrypted mesh.',
    span: 'md:col-span-2'
  },
  {
    icon: MonitorCheck,
    label: 'The Windows power user',
    who: 'Wants a terminal cockpit that treats Windows as home, not an afterthought.',
    hook: 'Built Windows-first, not ported to Windows.',
    span: 'md:col-span-2'
  }
]

export function Personas(): React.JSX.Element {
  return (
    <Section id="personas" className="py-24 sm:py-32">
      <SectionHeading title={<>Built for people who live in the terminal</>} />

      {/* Mobile: single stacked column. md+: a 6-col grid laid out 2 (col-span-3) over 3 (col-span-2). */}
      <div className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 md:grid-cols-6">
        {personas.map((p, i) => (
          <Reveal key={p.label} delay={i * 70} className={p.span}>
            <article className="group flex h-full flex-col gap-4 rounded-xl border border-edge bg-raised/60 p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-edge-2 bg-accent-soft text-accent transition-colors duration-200 group-hover:border-accent/40">
                <p.icon size={18} strokeWidth={1.75} />
              </span>

              <div className="flex flex-col gap-1.5">
                <h3 className="font-ui text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {p.label}
                </h3>
                <p className="font-ui text-[13.5px] leading-relaxed text-ink-2">{p.who}</p>
              </div>

              <p className="mt-auto border-l-2 border-accent/40 pl-3 font-ui text-[13px] leading-relaxed text-ink-2 italic">
                {p.hook}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
