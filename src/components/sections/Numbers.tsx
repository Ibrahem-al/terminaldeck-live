import { MEASURES, SINGLE_FACTS, STACK } from '../../lib/facts'
import { useInView } from '../../lib/useInView'

const SHOWN = ['installer', 'js', 'echo', 'spin']

const SHORT: Record<string, string> = {
  installer: 'Installer download',
  js: 'JavaScript before first paint',
  echo: '50 keystroke echoes',
  spin: 'Six spinning panes, per 60 frames'
}

/** Four measured before/after pairs as tiles; each bar is the after/before ratio, to scale. */
export function Numbers() {
  const tiles = MEASURES.filter((m) => SHOWN.includes(m.id))
  // Each bar starts at the old length and shrinks to the new one when the row comes into view.
  const [ref, seen] = useInView<HTMLUListElement>(0.4)
  return (
    <section id="speed" aria-labelledby="speed-title" className="band band-paper-deep">
      <div className="wrap">
        <div className="sec-head">
          <h2 id="speed-title" className="h2">
            Small, fast, built on Rust
          </h2>
          <p className="sec-lede">
            Since v{STACK.since}, TerminalDeck is a {STACK.label} app on the WebView2 Windows already has. Every figure
            was measured on the app itself.
          </p>
        </div>
        <ul ref={ref} className="stats m-0 list-none p-0">
          {tiles.map((m, i) => (
            <li key={m.id} className="stat">
              <span className="stat-value tnum">{m.after.label}</span>
              <span className="stat-label">{SHORT[m.id] ?? m.label}</span>
              <span className="stat-from tnum">
                from {m.before.label}
                {m.ratio ? `, ${m.ratio}` : ''}
              </span>
              <span className="stat-bar-wrap" aria-hidden="true">
                <span className="stat-bar">
                  <span
                    style={{
                      width: seen ? `${Math.max(3, (m.after.value / m.before.value) * 100)}%` : '100%',
                      transitionDelay: `${0.25 + i * 0.12}s`
                    }}
                  />
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="stat-footnote">
          Also measured: a file tree of {SINGLE_FACTS.treeFiles.toLocaleString('en-GB')} files keeps 2 MB, down from 55
          MB. The Rust process behind your terminals uses {SINGLE_FACTS.backendMemory}. Idle file watching no longer
          wakes the CPU {SINGLE_FACTS.idleWakeups} per window.
        </p>
      </div>
    </section>
  )
}
