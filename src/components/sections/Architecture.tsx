import type { ReactNode } from 'react'
import {
  Monitor,
  Smartphone,
  Network,
  HardDrive,
  Share2,
  KeyRound,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'

/** Short, concrete guarantees that sit beneath the flow diagram. */
const proofPoints: { icon: LucideIcon; text: ReactNode }[] = [
  {
    icon: HardDrive,
    text: (
      <>
        Everything lives on your disk (<span className="font-mono text-ink">%APPDATA%</span>). No
        accounts, no telemetry.
      </>
    )
  },
  {
    icon: Share2,
    text: <>The phone mirrors your actual open panes over a 256 KB scrollback ring with live fan-out.</>
  },
  {
    icon: KeyRound,
    text: <>Device tokens are stored only as SHA-256 hashes. Pairing codes expire in 5 minutes.</>
  },
  {
    icon: ShieldCheck,
    text: (
      <>
        No port forwarding, no public URL. <span className="font-mono text-ink">tailscale serve</span>{' '}
        keeps it tailnet-private.
      </>
    )
  }
]

export function Architecture(): React.JSX.Element {
  return (
    <Section id="how" grid className="py-24 sm:py-32">
      <SectionHeading
        title="Local by default. Reachable by design."
        sub="Your machine does the work and holds the data. Your phone reaches it through a private, encrypted mesh, never the public internet."
      />

      {/* Flow diagram: PC  ──Tailscale──  phone. Stacks vertically on mobile. */}
      <Reveal delay={80} className="mt-14 sm:mt-16">
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-2">
          {/* Node — the desktop */}
          <div className="rounded-xl border border-edge bg-raised p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] sm:p-6 md:flex-1">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge-2 bg-base text-accent">
                <Monitor size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-ui text-[15px] font-semibold text-ink">Your Windows PC</div>
                <div className="font-mono text-[11.5px] tracking-wide text-ink-3">TerminalDeck Agent</div>
              </div>
            </div>
            <p className="mt-4 font-ui text-[13.5px] leading-relaxed text-ink-2">
              Real PTYs, panes, the editor, and encrypted secrets all stay on this machine.
            </p>
          </div>

          {/* Connector — labeled, encrypted link */}
          <div className="relative flex flex-col items-center justify-center gap-2 py-1 md:min-w-[208px] md:py-0">
            <span className="font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">
              HTTPS + WSS · WireGuard
            </span>
            <div className="relative flex w-full flex-col items-center justify-center md:flex-row">
              {/* vertical dash (mobile, above chip) */}
              <span
                aria-hidden
                className="h-4 w-px border-l border-dashed border-accent/30 motion-safe:animate-pulse md:hidden"
              />
              {/* horizontal dash (desktop, behind chip) */}
              <span
                aria-hidden
                className="absolute top-1/2 right-0 left-0 hidden -translate-y-1/2 border-t border-dashed border-accent/30 motion-safe:animate-pulse md:block"
              />
              <span className="relative z-10 my-1 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-base px-3 py-1 font-mono text-[11.5px] font-medium text-accent md:my-0">
                <Network size={13} />
                Tailscale
              </span>
              {/* vertical dash (mobile, below chip) */}
              <span
                aria-hidden
                className="h-4 w-px border-l border-dashed border-accent/30 motion-safe:animate-pulse md:hidden"
              />
            </div>
            <span className="max-w-[24ch] text-center font-ui text-[11.5px] leading-snug text-ink-3">
              encrypted private mesh, never public
            </span>
          </div>

          {/* Node — the phone */}
          <div className="rounded-xl border border-edge bg-raised p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] sm:p-6 md:flex-1">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge-2 bg-base text-accent">
                <Smartphone size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-ui text-[15px] font-semibold text-ink">Your phone</div>
                <div className="font-mono text-[11.5px] tracking-wide text-ink-3">RemoteDeck PWA</div>
              </div>
            </div>
            <p className="mt-4 font-ui text-[13.5px] leading-relaxed text-ink-2">
              An installable web app that mirrors and drives those real terminals from anywhere.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Proof points — a quiet divided list, two columns on wider screens */}
      <div className="mt-12 grid grid-cols-1 gap-x-10 sm:mt-14 sm:grid-cols-2">
        {proofPoints.map((point, i) => {
          const Icon = point.icon
          return (
            <Reveal
              key={i}
              delay={i * 70}
              className="flex items-start gap-3 border-t border-edge-2 py-4"
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
              <p className="font-ui text-[13.5px] leading-relaxed text-ink-2">{point.text}</p>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
