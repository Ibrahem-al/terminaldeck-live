import { BellRing, LayoutGrid, MessagesSquare } from 'lucide-react'
import { DownloadButton } from '../ui/Button'
import { HeroNotch, useNotchSequence } from '../hero/HeroNotch'
import { FilmBackdrop } from '../hero/FilmBackdrop'
import { WatchFilm } from '../hero/WatchFilm'
import { COUNTS, INSTALLER, REQUIREMENTS, VERSION } from '../../lib/facts'

/** The three reasons, sitting on the hero's bottom edge; each one jumps to its section. */
const REASONS = [
  {
    href: '#workspace',
    icon: LayoutGrid,
    title: 'Decks of real terminals',
    text: `Up to ${COUNTS.panesPerDeckMax} shells per tab. Split, swap, zoom or pin a pane without stopping it.`
  },
  {
    href: '#notch',
    icon: BellRing,
    title: 'The Notch',
    text: 'A pill at the top of your screen lights up when an agent asks. Answer it from any window.'
  },
  {
    href: '#agents',
    icon: MessagesSquare,
    title: 'Agents that talk',
    text: 'Every claude or codex you start can message the agent next door, and you see every message.'
  }
]

/**
 * The hero. The film's teaser loops behind the headline as a moving background; "Watch the film"
 * takes the visitor down to the film's own section and plays it there. The Notch hangs from the nav and
 * asks its question while the headline rises in; the three reasons follow along the bottom edge.
 */
export function Hero() {
  const notch = useNotchSequence()
  return (
    <section id="intro" aria-labelledby="hero-title" className="hero3" data-notch={notch}>
      <FilmBackdrop />
      <HeroNotch state={notch} />
      <div className="wrap hero3-body">
        <div className="hero3-intro">
          <a className="pill-link rise" style={{ animationDelay: '0.05s' }} href="#releases">
            <span className="dot" aria-hidden="true" />
            v{VERSION}: agents can now message each other
            <span className="tag">What’s new</span>
          </a>
          <h1 id="hero-title" className="hero3-title">
            <span className="rise-line" style={{ animationDelay: '0.15s' }}>
              Run every coding
            </span>{' '}
            <span className="rise-line" style={{ animationDelay: '0.27s' }}>
              agent side by side
            </span>
          </h1>
          <p className="hero3-lead rise" style={{ animationDelay: '0.42s' }}>
            Tile real terminals into decks, know the moment an agent needs you, and let your agents message each
            other. Local only: no account, no cloud, no telemetry.
          </p>
          <div className="hero3-ctas rise" style={{ animationDelay: '0.52s' }}>
            <DownloadButton size="lg" />
            <WatchFilm className="btn-glass" />
          </div>
          <ul className="hero3-meta tnum rise" style={{ animationDelay: '0.6s' }} aria-label="About the download">
            <li>Free</li>
            <li>{INSTALLER.sizeLabel} installer</li>
            <li>{REQUIREMENTS.osShort}</li>
          </ul>
        </div>
      </div>

      <div id="features" className="hero3-reasons">
        <ul className="wrap hero3-reasons-list">
          {REASONS.map(({ href, icon: Icon, title, text }, i) => (
            <li key={href} className="rise" style={{ animationDelay: `${0.72 + i * 0.09}s` }}>
              <a href={href} className="reason">
                <Icon size={22} strokeWidth={2} aria-hidden="true" className="reason-icon" />
                <span className="reason-title">{title}</span>
                <span className="reason-text">{text}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
