import { Download, Play, ShieldCheck, Cpu, Smartphone } from 'lucide-react'
import { AppWindow } from '../app/AppWindow'
import { PaneFrame } from '../app/PaneFrame'
import { Terminal, A, L, s, type TermStep } from '../app/Terminal'
import { AgentChat } from '../app/AgentChat'
import { PhoneFrame, PhoneBar, KeyBar } from '../app/Phone'
import { Button } from '../ui/Button'
import { Reveal } from '../ui/Reveal'
import { heroTerminal, heroAgent } from '../../content/scripts'

const phoneMirror: TermStep[] = [
  { cmd: 'claude', cwd: '~/my-app' },
  {
    out: [
      L(s('● ', A(2)), s('Running tests…', A(7))),
      L(s('  28 passed', A(2)), s(' in 1.2s', A(8))),
      L(s('● ', A(2)), s('All green. Push?', A(7)))
    ]
  }
]

export function Hero(): React.JSX.Element {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-20 sm:pt-32">
      {/* brass glow + blueprint grid */}
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
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

          <Reveal as="h1" delay={60} className="mt-5 max-w-[50rem] font-ui text-[clamp(2.2rem,5vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.025em] text-ink text-balance">
            Command a fleet of AI agents.
            <br />
            <span className="text-ink-2">From your desk, or your pocket.</span>
          </Reveal>

          <Reveal as="p" delay={120} className="mt-6 max-w-[40rem] font-ui text-[clamp(1.05rem,1.5vw,1.25rem)] leading-relaxed text-ink-2 text-pretty">
            A private, Windows-native workspace for parallel AI coding agents, plus a phone that
            mirrors and drives your real terminals from anywhere.
          </Reveal>

          <Reveal delay={180} className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="#download" variant="primary" size="lg">
              <Download size={17} />
              Download for Windows
            </Button>
            <Button href="#agents" variant="secondary" size="lg">
              <Play size={15} />
              See it work
            </Button>
          </Reveal>
        </div>

        {/* Live app window */}
        <Reveal delay={120} className="relative mt-14 flex items-end justify-center xl:justify-start">
          <AppWindow
            project={{ name: 'my-app', color: '#4cc38a' }}
            decks={[
              { name: 'my-app', color: '#4cc38a', active: true },
              { name: 'job-search', color: '#5b9dd9' },
              { name: 'scratch', color: '#b583d9' }
            ]}
            className="h-[clamp(420px,52vw,560px)] w-full xl:flex-1"
          >
            <div className="grid h-full grid-cols-1 gap-2 p-2 md:grid-cols-[1.05fr_1fr]">
              <PaneFrame
                kind="terminal"
                title="pwsh"
                cwd="my-app"
                badge={{ label: 'Test Runner', color: '#4cc38a' }}
                className="hidden md:flex"
              >
                <Terminal script={heroTerminal} defaultCwd="~\dev\my-app" />
              </PaneFrame>
              <PaneFrame
                kind="agent"
                title="Agent Chat"
                badge={{ label: 'Claude Code', color: '#d8a956' }}
                active
              >
                <AgentChat script={heroAgent} />
              </PaneFrame>
            </div>
          </AppWindow>

          {/* Phone mirror — sits beside the window with a slight overlap, never over content */}
          <div className="z-20 mb-[-2.5rem] hidden shrink-0 xl:-ml-12 xl:block">
            <Reveal delay={420}>
              <PhoneFrame width={208}>
                <PhoneBar title="pwsh · my-app" status="busy" back bell />
                <div className="min-h-0 flex-1">
                  <Terminal script={phoneMirror} defaultCwd="~/my-app" loop className="text-[11px]" />
                </div>
                <KeyBar />
              </PhoneFrame>
            </Reveal>
            <div className="mt-2 text-center font-ui text-[11px] text-ink-3">
              the <span className="text-accent">same</span> terminal, on your phone
            </div>
          </div>
        </Reveal>

        {/* Trust strip (kept out of the hero stack itself) */}
        <Reveal delay={160} className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-edge-2 pt-8 text-ink-3 xl:justify-start">
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
