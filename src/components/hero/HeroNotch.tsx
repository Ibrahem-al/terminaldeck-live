import { useEffect, useState } from 'react'

export type NotchState = 'hidden' | 'working' | 'asking'

/**
 * The page's one orchestrated moment: a Notch hangs from the nav, glows while agents work,
 * drops into a real permission question, then settles back. Clicking it goes to the Notch section.
 * Under reduced motion it simply shows the working pill.
 */
export function useNotchSequence(): NotchState {
  const [state, setState] = useState<NotchState>('hidden')
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState('working')
      return
    }
    const t = [
      window.setTimeout(() => setState('working'), 350),
      window.setTimeout(() => setState('asking'), 1500),
      window.setTimeout(() => setState('working'), 5200)
    ]
    return () => t.forEach(window.clearTimeout)
  }, [])
  return state
}

export function HeroNotch({ state }: { state: NotchState }) {
  const asking = state === 'asking'
  return (
    <a
      href="#notch"
      className="pn"
      data-state={state}
      aria-label={asking ? 'Claude Code needs your permission to use Bash. See how the Notch works' : 'See how the Notch works'}
    >
      <span className="pn-row pn-working" aria-hidden={asking}>
        <span className="pn-dot" />
        <span className="tnum">3 working</span>
      </span>
      <span className="pn-row pn-asking" aria-hidden={!asking}>
        <span className="pn-q">?</span>
        <b>Claude Code</b>
        <span className="pn-muted">needs your permission to use Bash</span>
        <span className="pn-badge tnum">1</span>
      </span>
    </a>
  )
}
