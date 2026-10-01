import { RELEASES } from '../../lib/facts'
import { RELEASES_URL } from '../../lib/links'

const LATEST = RELEASES.slice(0, 4)
const plain = (s: string) => s.replace(/`/g, '')

/** One-line headlines; anything newer falls back to the release title or its first note. */
const HEADLINE: Record<string, string> = {
  '0.3.9': 'Agents message each other',
  '0.3.8': 'Phone access on T3 Code',
  '0.3.7': 'Clickable terminal links',
  '0.3.6': 'Settings as its own deck'
}
/** The first two sentences of the notes. */
const summary = (notes: string[]) =>
  plain(notes.join(' '))
    .split(/(?<=\.)\s/)
    .slice(0, 2)
    .join(' ')

/** The last few releases, one line each; the full notes live on GitHub. */
export function ReleaseLog() {
  const first = RELEASES[RELEASES.length - 1]
  const last = RELEASES[0]
  return (
    <section id="releases" aria-labelledby="releases-title" className="band band-paper">
      <div className="wrap split items-start">
        <div className="split-text min-[1024px]:sticky min-[1024px]:top-[calc(var(--nav-h)+40px)]">
          <h2 id="releases-title" className="h2 h2-sm">
            Shipping every week
          </h2>
          <p className="sec-lede">
            {RELEASES.length} releases since the move to Rust, from {first.dateLabel.replace(/ \d{4}$/, '')} to{' '}
            {last.dateLabel}.
          </p>
          <a className="textlink self-start" href={RELEASES_URL}>
            All releases on GitHub
          </a>
        </div>
        <ol className="rel-list split-media">
          {LATEST.map((r) => (
            <li key={r.version}>
              <div>
                <div className="rel-ver tnum">{r.version}</div>
                <time className="rel-date" dateTime={r.dateIso}>
                  {r.dateLabel}
                </time>
              </div>
              <div>
                <div className="rel-title">{HEADLINE[r.version] ?? r.title ?? plain(r.notes[0])}</div>
                <p className="rel-note">{summary(r.notes)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
