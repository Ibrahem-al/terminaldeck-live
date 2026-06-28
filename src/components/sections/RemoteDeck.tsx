import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, RefreshCw, Smartphone, Wifi, KeyRound, RotateCw, Hand } from 'lucide-react'
import { Section } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { PhoneFrame, PhoneBar, KeyBar, SessionList, type PhoneSession } from '../app/Phone'
import { Terminal, A, L, s, type TermStep } from '../app/Terminal'

const sessions: PhoneSession[] = [
  { name: 'pwsh · my-app', cwd: '~\\dev\\my-app', status: 'busy' },
  { name: 'Agent · api', cwd: 'C:\\repos\\api', status: 'idle' },
  { name: 'git-bash', cwd: '~/dotfiles', status: 'dead' }
]

const remoteTerm: TermStep[] = [
  { cmd: 'npm run build', cwd: '~/my-app' },
  {
    out: [
      L(s('vite ', A(5)), s('v6.0.5 building…', A(8))),
      L(s('✓ ', A(2)), s('412 modules transformed', A(7))),
      L(s('✓ ', A(2)), s('built in 3.4s', A(2)))
    ]
  },
  { exit: 0, took: '3.4s' },
  { cmd: 'git push' },
  { out: [L(s('→ main b71c0de', A(2)), s('  pushed', A(8)))] }
]

const features = [
  { icon: Smartphone, t: 'Installable PWA. Add to the home screen. No App Store, no review.' },
  { icon: KeyRound, t: 'One QR to pair. Long-lived device token, revocable per device.' },
  { icon: Hand, t: 'A mobile key bar for Esc, Tab, arrows, Ctrl-C and the rest.' },
  { icon: RotateCw, t: 'Auto-reconnect with replayed scrollback. It feels continuous.' }
]

/** A genuinely navigable phone: tap a session to drive it, tap back to return. */
function RemotePhone(): React.JSX.Element {
  const [active, setActive] = useState<PhoneSession | null>(null)

  return (
    <PhoneFrame width={252}>
      {active ? (
        <>
          <PhoneBar
            title={active.name}
            status="busy"
            back
            onBack={() => setActive(null)}
            end
            onEnd={() => setActive(null)}
          />
          <div className="min-h-0 flex-1">
            <Terminal script={remoteTerm} defaultCwd="~/my-app" />
          </div>
          <KeyBar />
        </>
      ) : (
        <>
          <PhoneBar title="Sessions" status="open" bell add />
          <SessionList sessions={sessions} />
          <button
            onClick={() => setActive(sessions[0])}
            className="m-3 mt-0 rounded-xl bg-accent py-3 font-ui text-[14px] font-semibold text-ink-inverse"
          >
            Open “pwsh · my-app”
          </button>
        </>
      )}
    </PhoneFrame>
  )
}

function WizardRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok text-ink-inverse">
        <Check size={11} />
      </span>
      <span className="font-ui text-[12.5px] text-ink-2">
        {label} <span className="text-ink-3">{value}</span>
      </span>
    </div>
  )
}

export function RemoteDeck(): React.JSX.Element {
  return (
    <Section id="remotedeck" className="py-24 sm:py-32">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
        {/* Left: copy + desktop wizard */}
        <div>
          <Reveal as="span" className="inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-accent uppercase">
            <Smartphone size={14} /> RemoteDeck
          </Reveal>
          <Reveal as="h2" delay={60} className="mt-4 max-w-[18ch] font-ui text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink text-balance">
            Your terminals, in your pocket.
          </Reveal>
          <Reveal as="p" delay={110} className="mt-5 max-w-[52ch] font-ui text-[1.05rem] leading-relaxed text-ink-2 text-pretty">
            Pair once with a QR. Then your phone mirrors and drives your actual desktop terminals from
            any network, over an encrypted private mesh. No app store, no public URL.
          </Reveal>

          {/* Desktop pairing wizard */}
          <Reveal delay={150} className="mt-8 max-w-[460px] overflow-hidden rounded-xl border border-edge bg-overlay">
            <header className="flex items-center gap-2.5 border-b border-edge-2 px-4 py-3">
              <Smartphone size={16} className="text-accent" />
              <span className="font-ui text-[13.5px] font-semibold text-ink">RemoteDeck</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 font-ui text-[10.5px] font-semibold text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> on · 8787
              </span>
            </header>
            <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
                  Step 1 · Network
                </p>
                <WizardRow label="Connected to" value="your tailnet" />
                <WizardRow label="Published" value="orion-pc.tail9x.ts.net" />
                <p className="pt-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
                  Step 2 · Pair
                </p>
                <div className="rounded-lg bg-base px-3 py-2">
                  <span className="font-mono text-[19px] font-bold tracking-[0.28em] text-accent">
                    K3F7Q2
                  </span>
                </div>
                <span className="flex items-center gap-1.5 font-ui text-[11px] text-ink-3">
                  <RefreshCw size={11} /> codes expire in 5 minutes
                </span>
              </div>
              <div className="flex flex-col items-center justify-start gap-2">
                <div className="rounded-xl bg-white p-2.5 shadow-lg">
                  <QRCodeSVG value="https://orion-pc.tail9x.ts.net/?c=K3F7Q2" size={116} level="M" marginSize={0} />
                </div>
                <span className="flex items-center gap-1.5 font-ui text-[10.5px] text-ink-3">
                  <Wifi size={11} className="text-accent" /> scan to pair
                </span>
              </div>
            </div>
          </Reveal>

          <div className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {features.map((f, i) => (
              <Reveal key={i} delay={180 + i * 60} className="flex items-start gap-2.5">
                <f.icon size={15} className="mt-0.5 shrink-0 text-accent" />
                <span className="font-ui text-[12.5px] leading-relaxed text-ink-2">{f.t}</span>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Right: interactive phone */}
        <Reveal delay={120} className="mx-auto lg:mx-0">
          <RemotePhone />
          <p className="mt-3 text-center font-ui text-[12px] text-ink-3">
            tap a session to drive it · tap back to return
          </p>
        </Reveal>
      </div>
    </Section>
  )
}
