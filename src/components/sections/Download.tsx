import { Download as DownloadIcon, MonitorCheck, Bot, Package, Smartphone } from 'lucide-react'
import { Section } from '../ui/Section'
import { Button } from '../ui/Button'
import { Reveal } from '../ui/Reveal'
import { DOWNLOAD_URL, RELEASES_URL } from '../../lib/links'
import { toast } from '../../lib/toast'

const requirements = [
  { icon: MonitorCheck, text: 'Windows 10 or 11, 64-bit (Intel/AMD).' },
  { icon: Bot, text: 'Claude Code on your PATH, only for AI agent features.' },
  { icon: Package, text: 'No build tools required; native terminal binaries ship prebuilt.' },
  {
    icon: Smartphone,
    text: 'For RemoteDeck: the free Tailscale app on your PC and phone, same account.'
  }
] as const

export function Download(): React.JSX.Element {
  return (
    <Section id="download" grid className="py-24 sm:py-32">
      {/* Brass glow — the page's climax, lit like the bridge at night. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
      />

      <div className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* The one dominant CTA. */}
        <div className="flex flex-col items-start">
          <Reveal
            as="h2"
            className="max-w-[14ch] text-balance font-display text-[clamp(2.2rem,4.8vw,3.4rem)] leading-[1.0] font-semibold text-ink"
          >
            Command your fleet.
          </Reveal>

          <Reveal
            as="p"
            delay={80}
            className="mt-5 max-w-[44ch] text-pretty font-ui text-[clamp(1.05rem,1.5vw,1.2rem)] leading-relaxed text-ink-2"
          >
            Install once and run parallel AI agents on your own machine. Private by default,
            no account.
          </Reveal>

          <Reveal delay={140} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button
              href={DOWNLOAD_URL}
              onClick={() => toast('Downloading TerminalDeck for Windows…', { kind: 'download' })}
              variant="primary"
              size="lg"
            >
              <DownloadIcon size={18} />
              Download for Windows
            </Button>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="font-ui text-[13.5px] font-medium text-ink-2 underline decoration-edge underline-offset-4 transition-colors hover:text-ink hover:decoration-accent"
            >
              Release notes
            </a>
          </Reveal>

          <Reveal as="p" delay={170} className="mt-3 font-mono text-[12px] text-ink-3">
            v0.2.0 · Windows 10/11 64-bit · ~120 MB
          </Reveal>

          <Reveal
            as="p"
            delay={200}
            className="mt-5 max-w-[48ch] font-ui text-[13px] leading-relaxed text-ink-3"
          >
            The installer is not yet code-signed, so Windows SmartScreen may warn on first run.
            Click More info, then Run anyway. Code signing is on the roadmap.
          </Reveal>
        </div>

        {/* Tidy requirements panel. */}
        <Reveal
          delay={120}
          className="spotlight rounded-xl border border-edge bg-raised p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] sm:p-7"
        >
          <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">
            Requirements
          </span>

          <ul className="mt-4 divide-y divide-edge-2">
            {requirements.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge-2 bg-overlay text-accent">
                  <Icon size={15} />
                </span>
                <span className="font-ui text-[14px] leading-relaxed text-ink-2">{text}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  )
}
