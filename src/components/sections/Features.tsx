import { Kbd } from '../ui/Kbd'
import { useInView } from '../../lib/useInView'
import { COUNTS, THEME_DETAILS } from '../../lib/facts'
import editorShot from '../../assets/features/editor.webp'
import themesShot from '../../assets/docs-06-settings-themes.webp'

/** Everything around the terminals, as one bento grid: each card one idea, one or two sentences. */
export function Features() {
  const [barRef, playing] = useInView<HTMLDivElement>(0.6)
  return (
    <section id="workspace" aria-labelledby="workspace-title" className="band band-paper">
      <div className="wrap">
        <div className="sec-head">
          <h2 id="workspace-title" className="h2">
            Everything around the terminals
          </h2>
        </div>

        <div className="bento">
          <article className="card card-media bento-wide">
            <div className="card-body">
              <h3 className="card-title">Your files, next to your agents</h3>
              <p className="card-text max-w-[34em]">
                A file browser and a code editor live in the same grid as your terminals. <Kbd>Ctrl+P</Kbd> opens any
                file by name; drag one into a terminal to type its path.
              </p>
            </div>
            <img
              src={editorShot}
              width={1600}
              height={640}
              alt="The file browser, a terminal and the editor in one deck"
              loading="lazy"
              decoding="async"
              className="bento-edge-shot"
            />
          </article>

          <article className="card card-ink">
            <h3 className="card-title">Walk away safely</h3>
            <p className="card-text">
              Blackout turns every monitor black after the minutes you pick, so an OLED doesn’t burn in. Nothing stops,
              and it lights up once if an agent asks.
            </p>
            <div ref={barRef} className="blackout-bar" data-playing={playing ? '' : undefined} aria-hidden="true">
              <span>Screen on</span>
              <span />
              <span />
              <span />
              <i className="blackout-head" />
            </div>
          </article>

          <article className="card">
            <h3 className="card-title">Projects in one keystroke</h3>
            <p className="card-text">
              <Kbd>Ctrl+K</Kbd> opens a project as a deck with its layout, shell, start-up commands and encrypted
              environment variables.
            </p>
          </article>

          <article className="card">
            <h3 className="card-title">Your terminals on your phone</h3>
            <p className="card-text">
              Optional and off until you turn it on. Pair T3 Code over Wi-Fi or Tailscale and drive the very same
              sessions.
            </p>
          </article>

          <article className="card">
            <h3 className="card-title">Comes back after a restart</h3>
            <p className="card-text">
              Decks, panes and folders return. A pane that ran Claude offers to resume the conversation, never on its
              own.
            </p>
          </article>

          <article className="card bento-full bento-themes">
            <div className="card-body">
              <h3 className="card-title text-[1.75rem]">Make it yours</h3>
              <p className="card-text">
                {COUNTS.themes} themes, dark and light, each with its own {THEME_DETAILS.ansiColours}-colour terminal
                palette. {THEME_DETAILS.livePreview} Fonts, cursor, scrollback and copy and paste are yours to set too.
              </p>
            </div>
            <img
              src={themesShot}
              width={1600}
              height={1000}
              alt="Settings, Themes: a grid of theme cards"
              loading="lazy"
              decoding="async"
            />
          </article>
        </div>
      </div>
    </section>
  )
}
