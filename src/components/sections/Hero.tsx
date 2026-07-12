import { Download, Play, ShieldCheck, Cpu, Smartphone, Sparkles } from 'lucide-react'
import { HeroSim } from '../app/sim/SimWindow'
import { Button } from '../ui/Button'
import { Reveal } from '../ui/Reveal'
import { DOWNLOAD_URL } from '../../lib/links'
import { toast } from '../../lib/toast'

export function Hero(): React.JSX.Element {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
      {/* brass glow + blueprint grid */}
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="glow-drift pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
      />

      <div className="relative mx-auto w-full max-w-[1180px] px-5 sm:px-8">
        {/* Copy */}
        <div className="max-w-[44rem]">
          <Reveal
            as="span"
            className="inline-flex items-center gap-2 rounded-full border border-edge bg-raised/60 px-3 py-1 font-ui text-[12px] font-medium text-ink-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
            Local-first workspace for AI coding agents · Windows
          </Reveal>

          <Reveal as="h1" delay={60} className="mt-5 max-w-[56rem] font-display text-[clamp(2.05rem,4.4vw,2.85rem)] leading-[1.04] font-semibold tracking-[-0.03em] text-ink text-balance">
            Command a fleet of AI agents.
            <br />
            <span className="text-ink-2">From your desk, or your pocket.</span>
          </Reveal>

          <Reveal as="p" delay={120} className="mt-6 max-w-[40rem] font-ui text-[clamp(1.05rem,1.5vw,1.25rem)] leading-relaxed text-ink-2 text-pretty">
            A private, Windows-native workspace for parallel AI coding agents, plus a phone that
            mirrors and drives your real terminals from anywhere.
          </Reveal>

          <Reveal delay={180} className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              href={DOWNLOAD_URL}
              onClick={() => toast('Downloading TerminalDeck for Windows…', { kind: 'download' })}
              variant="primary"
              size="lg"
            >
              <Download size={17} />
              Download for Windows
            </Button>
            <Button href="#agents" variant="secondary" size="lg">
              <Play size={15} />
              See it work
            </Button>
          </Reveal>

          <Reveal delay={220} className="mt-5 inline-flex items-center gap-2 font-ui text-[12.5px] text-ink-3">
            <Sparkles size={14} className="text-accent" />
            <span>
              The window below is <span className="text-ink-2">live</span> — switch decks, split panes, open the
              board, and <span className="text-accent">type real commands</span> in any terminal. Try{' '}
              <code className="rounded bg-raised px-1 py-px font-mono text-[11.5px] text-ink-2">help</code>,{' '}
              <code className="rounded bg-raised px-1 py-px font-mono text-[11.5px] text-ink-2">npm test</code>, or{' '}
              <code className="rounded bg-raised px-1 py-px font-mono text-[11.5px] text-ink-2">theme ember</code>.
            </span>
          </Reveal>
        </div>

        {/* Live, drivable app window + phone mirror */}
        <Reveal delay={140}>
          <HeroSim />
        </Reveal>

        {/* Trust strip (kept out of the hero stack itself) */}
        <Reveal delay={160} className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-edge-2 pt-8 text-ink-2 xl:justify-start">
          {[
            { icon: Cpu, t: 'Real PTYs: vim, Ctrl+C, ANSI, GPU-rendered' },
            { icon: ShieldCheck, t: 'No cloud · no telemetry · secrets encrypted at rest' },
            { icon: Smartphone, t: 'Phone control over an encrypted private mesh' }
          ].map((f, i) => (
            <span key={i} className="inline-flex items-center gap-2 font-ui text-[12.5px]">
              <f.icon size={14} className="text-accent" />
              {f.t}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
