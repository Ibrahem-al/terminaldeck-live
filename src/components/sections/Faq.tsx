import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { cn } from '../../lib/cn'

type QA = { q: string; a: string }

const FAQ: readonly QA[] = [
  {
    q: 'Is my data sent anywhere?',
    a: 'No. Everything is local. There is no cloud, no telemetry, and no accounts. Secrets are encrypted at rest with Windows DPAPI.'
  },
  {
    q: 'Do I need Claude Code?',
    a: 'Only for the AI agent features. Terminals, the editor, the file browser, and the kanban board all work without it.'
  },
  {
    q: 'Can I connect from another network or on cellular?',
    a: 'Yes, through Tailscale. With both devices on the same Tailscale account, your phone reaches your laptop from anywhere. The laptop just has to be awake and online.'
  },
  {
    q: 'Is RemoteDeck exposing my machine to the internet?',
    a: "No. It runs over Tailscale's private mesh with tailscale serve, not a public tunnel. There is no public URL and no port forwarding."
  },
  {
    q: 'Does the phone see a copy or the real terminal?',
    a: 'The real one. The phone mirrors your actual open desktop panes, and typing on the phone writes to the same shell.'
  },
  {
    q: 'Will notifications reach my phone if the app is closed?',
    a: 'Yes. They use Web Push, which works with the PWA backgrounded or closed. On iOS, install the PWA to your home screen first.'
  },
  {
    q: 'Why Windows only?',
    a: 'It is built Windows-first around PowerShell, ConPTY, and DPAPI. Other platforms are on the roadmap.'
  },
  {
    q: 'Is the installer signed?',
    a: 'Not yet. Windows SmartScreen warns on first run (choose More info, then Run anyway). Code signing is on the roadmap.'
  }
]

export function Faq(): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <Section id="faq" className="py-24 sm:py-32">
      <SectionHeading title={<>Questions, answered</>} />

      <div className="mx-auto mt-14 max-w-[820px] divide-y divide-edge-2 rounded-xl border border-edge-2 bg-raised/40">
        {FAQ.map((item, i) => {
          const isOpen = open === i
          return (
            <Reveal key={item.q} delay={i * 45}>
              <h3 className="m-0">
                <button
                  type="button"
                  id={`faq-trigger-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-ui text-[15px] font-medium text-ink transition-colors hover:text-accent sm:px-6 sm:text-[16px]"
                >
                  <span className="text-pretty">{item.q}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden
                    className={cn(
                      'shrink-0 text-ink-3 transition-transform duration-300 ease-out',
                      isOpen && 'rotate-180 text-accent'
                    )}
                  />
                </button>
              </h3>
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-trigger-${i}`}
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-out',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[64ch] px-5 pb-5 font-ui text-[14.5px] leading-relaxed text-ink-2 text-pretty sm:px-6">
                    {item.a}
                  </p>
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
