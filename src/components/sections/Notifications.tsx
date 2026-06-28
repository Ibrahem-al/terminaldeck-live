import { useEffect, useState } from 'react'
import { BellRing, Check, MonitorSmartphone, Timer } from 'lucide-react'
import { Section } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { PhoneFrame } from '../app/Phone'

const routes = [
  { label: 'Phone only', note: 'default' },
  { label: 'Desktop only' },
  { label: 'Phone + desktop' },
  { label: 'Off' }
]

const pushes = [
  { title: 'pwsh · my-app', body: 'npm run build finished · exit 0 · took 6m 12s' },
  { title: 'Agent · api-gateway', body: 'Claude finished the refactor · 28 tests pass' },
  { title: 'pwsh · worker', body: 'integration suite done · exit 0 · took 11m 04s' }
]

function LockScreen(): React.JSX.Element {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), 5000)
    return () => window.clearInterval(id)
  }, [])
  const push = pushes[n % pushes.length]

  return (
    <PhoneFrame width={252}>
      <div className="relative flex h-full flex-col items-center overflow-hidden bg-base">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(circle at 50% 18%, var(--accent-soft), transparent 60%)' }}
        />
        {/* clock */}
        <div className="relative mt-12 text-center">
          <div className="font-ui text-[15px] font-medium text-ink-2">Saturday, June 28</div>
          <div className="font-ui text-[72px] leading-none font-semibold tracking-[-0.03em] text-ink">
            9:41
          </div>
        </div>

        {/* push notification */}
        <div className="relative mt-8 w-full px-3">
          <div
            key={n}
            className="push-in flex items-start gap-3 rounded-2xl border border-edge/60 bg-overlay/80 p-3 backdrop-blur-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base font-mono text-[15px] font-bold text-accent">
              ❯_
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-ui text-[12.5px] font-semibold text-ink">TerminalDeck</span>
                <span className="font-ui text-[10.5px] text-ink-3">now</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 font-ui text-[12px] leading-snug text-ink-2">
                <Check size={12} className="shrink-0 text-ok" />
                <span className="min-w-0">
                  <span className="font-medium text-ink">{push.title}</span> {push.body}
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}

export function Notifications(): React.JSX.Element {
  return (
    <Section className="py-24 sm:py-32">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal as="span" className="inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-accent uppercase">
            <BellRing size={14} /> Notifications
          </Reveal>
          <Reveal as="h2" delay={60} className="mt-4 max-w-[16ch] font-ui text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink text-balance">
            Walk away. We’ll tell you when it’s done.
          </Reveal>
          <Reveal as="p" delay={110} className="mt-5 max-w-[48ch] font-ui text-[1.05rem] leading-relaxed text-ink-2 text-pretty">
            TerminalDeck watches your terminals through the shell integration and pings you the
            moment a long command finishes, with its real exit code and duration.
          </Reveal>

          <Reveal delay={150} className="mt-7">
            <div className="flex items-center gap-2 font-ui text-[12px] text-ink-3">
              <MonitorSmartphone size={14} className="text-accent" /> route notifications
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {routes.map((r, i) => (
                <span
                  key={r.label}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-ui text-[12px] font-medium ${
                    i === 0 ? 'border-accent/50 bg-accent-soft text-accent' : 'border-edge text-ink-2'
                  }`}
                >
                  {r.label}
                  {r.note && <span className="font-ui text-[9.5px] text-ink-3 uppercase">{r.note}</span>}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={210} className="mt-6 flex items-start gap-2.5 rounded-lg border border-edge-2 bg-raised/40 px-3.5 py-3">
            <Timer size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="font-ui text-[12.5px] leading-relaxed text-ink-2">
              Real Web Push reaches your phone even when RemoteDeck is closed or on another network.
              Trivial commands never spam you. Only ones that ran longer than your threshold (20s by default).
            </p>
          </Reveal>
        </div>

        <Reveal delay={120} className="mx-auto">
          <LockScreen />
        </Reveal>
      </div>
    </Section>
  )
}
