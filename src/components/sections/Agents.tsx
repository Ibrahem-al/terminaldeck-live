import { MESSAGING } from '../../lib/facts'
import { DOCS_PATH } from '../../lib/links'
import flightShot from '../../assets/features/agents-flight.webp'

/** Agents: the message flight on the left, the three rules that make it safe on the right. */
export function Agents() {
  return (
    <section id="agents" aria-labelledby="agents-title" className="band band-deep">
      <div className="wrap split split-rev">
        <div className="split-media">
          <img
            src={flightShot}
            width={1600}
            height={1000}
            alt="A message flying from the Codex pane to the Claude Code pane, with the Messages drawer logging it"
            loading="lazy"
            decoding="async"
            className="shot"
          />
        </div>
        <div className="split-text">
          <h2 id="agents-title" className="h2 h2-sm">
            Agents that work together
          </h2>
          <p className="sec-lede">
            Every <code>claude</code> or <code>codex</code> you start gets TerminalDeck’s tools: see the other panes,
            read what one is doing, type into an idle shell, and message the agent next door.
          </p>
          <dl className="facts">
            <div>
              <dt>Waits for a quiet moment</dt>
              <dd>A message is typed only when the receiving agent is idle with an empty input box.</dd>
            </div>
            <div>
              <dt>Never poses as you</dt>
              <dd>Each message names the sending agent and says it isn’t the user.</dd>
            </div>
            <div>
              <dt>Can’t loop</dt>
              <dd>
                Two agents that trade {MESSAGING.loopPair.messages} messages in {MESSAGING.loopPair.minutes} minutes
                are paused.
              </dd>
            </div>
          </dl>
          <a className="textlink self-start" href={`${DOCS_PATH}/#agents-working-together`}>
            How messaging works
          </a>
        </div>
      </div>
    </section>
  )
}
