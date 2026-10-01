import { Check } from 'lucide-react'
import { NOTCH } from '../../lib/facts'
import alertPng from '../../assets/notch/33-notch-alert.png'
import expandedPng from '../../assets/notch/34-notch-expanded.png'

/** The Notch: what it does in three lines, and the real alert and pull-down beside it. */
export function Notch() {
  return (
    <section id="notch" aria-labelledby="notch-title" className="band band-paper">
      <div className="wrap split">
        <div className="split-text">
          <h2 id="notch-title" className="h2 h2-sm">
            Know the moment an agent needs you
          </h2>
          <p className="sec-lede">
            It sits {NOTCH.pillPx} px tall at the top edge of your screen while agents work. When one asks, it slides
            down with the agent’s own words. Click it and it opens that pane’s live terminal, so you answer without
            switching windows.
          </p>
          <ul className="checks">
            <li>
              <Check size={20} strokeWidth={2.4} aria-hidden="true" />
              Exact for Claude Code, after a one-click hook install in Settings
            </li>
            <li>
              <Check size={20} strokeWidth={2.4} aria-hidden="true" />
              Codex, Gemini CLI and others through the bell, OSC 9 and on-screen prompts
            </li>
            <li>
              <Check size={20} strokeWidth={2.4} aria-hidden="true" />A desktop notification when a long task finishes
            </li>
          </ul>
        </div>
        <div className="split-media">
          <div className="panel-deep">
            <img
              src={alertPng}
              width={700}
              height={120}
              alt="The Notch alert: Claude Code asks to allow Bash to run git push origin main, with a badge counting 2 waiting agents"
              loading="lazy"
              decoding="async"
              className="block h-auto w-full max-w-[520px]"
            />
            <img
              src={expandedPng}
              width={1000}
              height={560}
              alt="The Notch pulled down into a live mini terminal of the asking pane"
              loading="lazy"
              decoding="async"
              className="block h-auto w-full rounded-[10px]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
