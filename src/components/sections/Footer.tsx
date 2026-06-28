import { ArrowUp } from 'lucide-react'
import { Wordmark } from '../app/Wordmark'
import { Reveal } from '../ui/Reveal'

type FooterLink = { label: string; href: string }
type FooterGroup = { heading: string; links: FooterLink[] }

const groups: FooterGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'The cockpit', href: '#cockpit' },
      { label: 'AI agents', href: '#agents' },
      { label: 'RemoteDeck', href: '#remotedeck' },
      { label: 'Themes', href: '#themes' }
    ]
  },
  {
    heading: 'Learn',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Privacy', href: '#privacy' },
      { label: 'FAQ', href: '#faq' }
    ]
  },
  {
    heading: 'Get started',
    links: [{ label: 'Download', href: '#download' }]
  }
]

export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-edge-2 py-14">
      <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
        {/* Brand + grouped navigation. Stacks to a single column on mobile. */}
        <div className="grid grid-cols-1 gap-10 sm:gap-12 md:grid-cols-12">
          <Reveal className="md:col-span-5">
            <Wordmark size={20} />
            <p className="mt-4 max-w-[34ch] font-ui text-[14px] leading-relaxed text-ink-2">
              The command deck for AI-driven development.
            </p>
            <p className="mt-3 font-mono text-[11.5px] leading-relaxed text-ink-3">
              v0.2.0 · Windows-first · fully local, fully private.
            </p>
          </Reveal>

          <nav aria-label="Footer" className="md:col-span-7">
            {/* Link columns: 2-up on small screens, 3-up from sm and wider. */}
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {groups.map((group, i) => (
                <Reveal key={group.heading} delay={60 + i * 60}>
                  <h3 className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">
                    {group.heading}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {group.links.map((link) => {
                      const emphasized = link.href === '#download'
                      return (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            className={
                              'font-ui text-[13.5px] transition-colors ' +
                              (emphasized
                                ? 'text-accent hover:brightness-110'
                                : 'text-ink-2 hover:text-ink')
                            }
                          >
                            {link.label}
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </Reveal>
              ))}
            </div>
          </nav>
        </div>

        {/* Bottom strip. Stacks on mobile, spreads on sm and wider. */}
        <Reveal
          delay={120}
          className="mt-12 flex flex-col gap-4 border-t border-edge-2 pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="font-mono text-[11.5px] text-ink-3">© 2026 TerminalDeck</span>
            <span aria-hidden className="hidden text-ink-3/60 sm:inline">
              ·
            </span>
            <span className="font-ui text-[12.5px] text-ink-3">
              Built for developers who run AI agents all day.
            </span>
          </div>

          <a
            href="#top"
            className="group inline-flex items-center gap-1.5 self-start font-mono text-[11.5px] text-ink-3 transition-colors hover:text-accent sm:self-auto"
          >
            Back to top
            <ArrowUp size={13} className="transition-transform group-hover:-translate-y-0.5" />
          </a>
        </Reveal>
      </div>
    </footer>
  )
}
