import { Button, DownloadButton } from '../ui/Button'
import { HeroStage } from '../hero/HeroStage'
import { HeroNotch, useNotchSequence } from '../hero/HeroNotch'
import { INSTALLER, REQUIREMENTS, SHELLS, VERSION } from '../../lib/facts'

const WORKS_WITH = ['Claude Code', 'Codex', 'Gemini CLI', ...SHELLS.filter((s) => s !== 'PowerShell 7')]

/**
 * The hero. On load, the Notch hangs from the nav and asks a question while the headline rises in
 * under it; the light behind the live demo warms while the question is up. Then the real app,
 * then the "works with" row.
 */
export function Hero() {
  const notch = useNotchSequence()
  return (
    <section id="demo" aria-labelledby="hero-title" className="band band-paper hero2" data-notch={notch}>
      <HeroNotch state={notch} />
      <div className="wrap">
        <div className="hero2-intro">
          <a className="pill-link rise" style={{ animationDelay: '0.05s' }} href="#releases">
            <span className="dot" aria-hidden="true" />
            v{VERSION}: agents can now message each other
            <span className="tag">What’s new</span>
          </a>
          <h1 id="hero-title" className="hero2-title">
            <span className="rise-line" style={{ animationDelay: '0.15s' }}>
              Run every coding
            </span>{' '}
            <span className="rise-line" style={{ animationDelay: '0.27s' }}>
              agent side by side
            </span>
          </h1>
          <p className="hero2-lead rise" style={{ animationDelay: '0.42s' }}>
            Tile real terminals into decks, know the moment an agent needs you, and let your agents message each
            other. Local only: no account, no cloud, no telemetry.
          </p>
          <div className="hero2-ctas rise" style={{ animationDelay: '0.52s' }}>
            <DownloadButton size="lg" />
            <Button href="#hero-stage" variant="secondary" size="lg" icon="play">
              Try the live demo
            </Button>
          </div>
          <ul className="hero2-meta tnum rise" style={{ animationDelay: '0.6s' }} aria-label="About the download">
            <li>Free</li>
            <li>{INSTALLER.sizeLabel} installer</li>
            <li>{REQUIREMENTS.osShort}</li>
          </ul>
        </div>

        <div className="stage-wrap rise" style={{ animationDelay: '0.7s' }}>
          <div className="stage-glow" aria-hidden="true" />
          <div id="hero-stage" className="band-deep stage-card">
            <HeroStage />
          </div>
        </div>

        <ul className="works-with" aria-label="Works with">
          <li className="works-label" aria-hidden="true">
            Works with
          </li>
          {WORKS_WITH.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
