import { BellRing, LayoutGrid, MessagesSquare } from 'lucide-react'
import { COUNTS } from '../../lib/facts'

/** The three reasons, before any detail: decks, the Notch, agents that talk. */
export function Pillars() {
  return (
    <section id="features" aria-labelledby="pillars-title" className="band band-paper band-flush-top">
      <div className="wrap">
        <div className="sec-head">
          <h2 id="pillars-title" className="h2">
            Built for running many agents at once
          </h2>
          <p className="sec-lede">
            A normal terminal assumes one person typing into one shell. TerminalDeck assumes several agents working
            while you watch.
          </p>
        </div>
        <div className="grid-3">
          <article className="pillar">
            <span className="icon-tile" aria-hidden="true">
              <LayoutGrid size={24} strokeWidth={2} />
            </span>
            <h3 className="pillar-title">Decks of real terminals</h3>
            <p className="pillar-text">
              Up to {COUNTS.panesPerDeckMax} real shells per tab. Split, swap, zoom or pin a pane without stopping what
              runs in it. Panes name themselves from what’s running.
            </p>
          </article>
          <article className="pillar">
            <span className="icon-tile" aria-hidden="true">
              <BellRing size={24} strokeWidth={2} />
            </span>
            <h3 className="pillar-title">The Notch</h3>
            <p className="pillar-text">
              A small pill at the top of your screen lights up when an agent asks a question or finishes. Answer it
              right there, from any window.
            </p>
          </article>
          <article className="pillar">
            <span className="icon-tile" aria-hidden="true">
              <MessagesSquare size={24} strokeWidth={2} />
            </span>
            <h3 className="pillar-title">Agents that talk</h3>
            <p className="pillar-text">
              Every <code>claude</code> or <code>codex</code> you start can see the other panes and message the agent
              next door, and you see every message.
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
