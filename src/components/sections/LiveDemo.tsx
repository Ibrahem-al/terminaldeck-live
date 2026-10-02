import { useState } from 'react'
import { HeroStage, TOUR_EVENT, type TourProgress } from '../hero/HeroStage'
import { Button } from '../ui/Button'
import { TOUR_STEPS } from '../../lib/demo'
import { SHELLS } from '../../lib/facts'
import { useInView } from '../../lib/useInView'

const WORKS_WITH = ['Claude Code', 'Codex', 'Gemini CLI', ...SHELLS.filter((s) => s !== 'PowerShell 7')]

const IDLE: TourProgress = { running: false, index: -1, total: TOUR_STEPS.length, done: false, supported: false }

/**
 * The workbench: the real app on a simulated machine, lit on a dot-grid bench. Hands-on, where the
 * film further down is lean-back. The tour's eight steps sit under the window as a track that
 * follows the tour while it plays; when the section first scrolls in, the window powers on.
 */
export function LiveDemo() {
  const [tour, setTour] = useState<TourProgress>(IDLE)
  const [benchRef, seen] = useInView<HTMLDivElement>(0.2)
  const playTour = (): void => {
    window.dispatchEvent(new Event(TOUR_EVENT))
  }

  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className="band workbench"
      data-seen={seen ? '' : undefined}
      data-touring={tour.running ? '' : undefined}
    >
      <div className="wrap">
        <div className="wb-head">
          <div className="wb-head-text">
            <h2 id="demo-title" className="h2">
              Try the real app, right here
            </h2>
            <p className="sec-lede">
              This is TerminalDeck’s own interface on a simulated machine.{' '}
              {tour.supported ? 'Play the guided tour, or click into a pane and run ' : 'Click into a pane and run '}
              <code>claude</code> yourself. Nothing is installed and nothing leaves this page.
            </p>
          </div>
          {tour.supported ? (
            <Button variant="secondary" size="lg" icon={tour.running ? 'pause' : 'play'} onClick={playTour}>
              {tour.running ? 'Stop the tour' : 'Play the guided tour'}
            </Button>
          ) : null}
        </div>

        <div ref={benchRef} className="stage-wrap wb-stage">
          <div className="stage-glow" aria-hidden="true" />
          <div className="wb-scan" aria-hidden="true" />
          <div id="hero-stage" className="band-deep stage-card">
            <HeroStage withFilm={false} tourButton={false} onTour={setTour} />
          </div>
        </div>

        {tour.supported ? (
          <ol className="wb-track" aria-label="The guided tour">
            {TOUR_STEPS.map((title, i) => {
              const state =
                tour.running && i === tour.index
                  ? 'now'
                  : (tour.running && i < tour.index) || (!tour.running && tour.done)
                    ? 'done'
                    : 'next'
              return (
                <li key={title} className="wb-step" data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                  <span className="wb-step-bar" aria-hidden="true" />
                  <span className="wb-step-n tnum">{i + 1}</span>
                  <span className="wb-step-title">{title}</span>
                </li>
              )
            })}
          </ol>
        ) : null}

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
