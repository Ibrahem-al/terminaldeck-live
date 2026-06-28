import type { ReactNode } from 'react'
import { Lock, KeyRound, ShieldOff, FolderLock, HardDrive, type LucideIcon } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'

type Guarantee = {
  icon: LucideIcon
  title: string
  body: ReactNode
}

const guarantees: Guarantee[] = [
  {
    icon: Lock,
    title: 'Secrets encrypted at rest',
    body: (
      <>
        Project environment variables are sealed with Windows DPAPI through{' '}
        <code className="font-mono text-[13px] text-ink">safeStorage</code>, and never written into
        the session file.
      </>
    )
  },
  {
    icon: KeyRound,
    title: 'Hardened phone pairing',
    body: (
      <>
        Each device gets a 256-bit token. Only its SHA-256 hash is stored, compared in constant
        time, and revocable one device at a time.
      </>
    )
  },
  {
    icon: ShieldOff,
    title: 'Never exposed to the internet',
    body: (
      <>
        RemoteDeck rides Tailscale serve inside your private tailnet, never funnel. No port
        forwarding, no public URL.
      </>
    )
  },
  {
    icon: FolderLock,
    title: 'Filesystem allow-list',
    body: (
      <>
        Phone file operations and new sessions stay inside the roots you configure, with traversal
        and symlink-escape protection.
      </>
    )
  },
  {
    icon: HardDrive,
    title: 'Your data lives on disk',
    body: (
      <>
        Settings, projects, and your kanban board all live in{' '}
        <code className="font-mono text-[13px] text-ink">%APPDATA%</code>. Nothing is sent to any
        server.
      </>
    )
  }
]

export function Privacy(): React.JSX.Element {
  return (
    <Section id="privacy" className="py-24 sm:py-32">
      {/* Asymmetric: a confident standing statement on the left, a ledger of guarantees
          on the right. Collapses to a single stacked column below lg. */}
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            align="left"
            title={<>No cloud. No telemetry. No account.</>}
            sub={<>Your terminals, your secrets, and your code never leave your machine.</>}
          />
          <Reveal
            delay={120}
            className="mt-8 max-w-[36ch] border-t border-edge-2 pt-6 font-mono text-[12.5px] leading-relaxed text-ink-3"
          >
            TerminalDeck has no servers and no telemetry. There is nothing for us to see.
          </Reveal>
        </div>

        <ul className="divide-y divide-edge-2 border-l-2 border-accent/30">
          {guarantees.map((g, i) => {
            const Icon = g.icon
            return (
              <Reveal
                as="li"
                key={g.title}
                delay={i * 70}
                className="flex gap-4 py-5 pl-6 first:pt-0 last:pb-0"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-edge bg-raised text-accent">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-ui text-[15px] font-semibold tracking-[-0.01em] text-ink">
                    {g.title}
                  </h3>
                  <p className="mt-1 font-ui text-[14px] leading-relaxed text-ink-2 text-pretty">
                    {g.body}
                  </p>
                </div>
              </Reveal>
            )
          })}
        </ul>
      </div>
    </Section>
  )
}
