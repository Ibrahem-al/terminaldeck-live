import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useReducedMotion } from '../../lib/useReducedMotion'

/**
 * Magenta leader lines, drafting convention:
 *   an ARROWHEAD where a leader meets an edge (tab top, screen top, icon top),
 *   a DOT where it lands on a surface (pane header, shell prompt).
 * Leaders live in one <LeaderLayer> SVG that shares its parent's coordinate space (viewBox),
 * positioned absolutely over a relatively positioned stage. They draw in, in order of `i`,
 * when the layer plays; reduced motion shows the finished drawing.
 *
 *   <div className="relative" style={{ aspectRatio: '1360 / 870' }}>
 *     <LeaderLayer viewBox="0 0 1360 870" trigger={alertShown}>
 *       <Leader d="M1010 80 H680 V100" end="arrow" i={0} />
 *       <Leader d="M0 455 H180" end="dot" i={3} casing />
 *     </LeaderLayer>
 *   </div>
 */

export type DrawState = 'waiting' | 'play' | 'done'

/**
 * The draw-in clock. `trigger`:
 *   'mount'  → plays after `delay` ms once mounted,
 *   'inview' → plays when the element first scrolls into view (after `delay`),
 *   boolean  → plays when it becomes true (after `delay`); use it to chain after another animation.
 * Returns 'done' immediately under reduced motion.
 * Put `data-leader-state={state}` on a wrapper and class `leader-follow` + style --i on callout
 * text to have it fade in with its leader.
 */
export function useDrawIn<T extends Element = SVGSVGElement>(
  trigger: 'mount' | 'inview' | boolean = 'inview',
  delay = 0
): { ref: React.RefObject<T>; state: DrawState } {
  const reduced = useReducedMotion()
  const ref = useRef<T>(null)
  const [state, setState] = useState<DrawState>('waiting')
  const [armed, setArmed] = useState(trigger === 'mount' || trigger === true)

  useEffect(() => {
    if (typeof trigger === 'boolean') setArmed(trigger)
  }, [trigger])

  useEffect(() => {
    if (trigger !== 'inview') return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setArmed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -15% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [trigger])

  useEffect(() => {
    if (!armed || state !== 'waiting') return
    const t = window.setTimeout(() => setState('play'), delay)
    return () => window.clearTimeout(t)
  }, [armed, delay, state])

  return { ref, state: reduced ? 'done' : state }
}

const LayerCtx = createContext<{ arrow: number }>({ arrow: 10 })

export function LeaderLayer({
  viewBox,
  trigger = 'inview',
  delay = 0,
  state: controlled,
  arrowSize = 10,
  className,
  style,
  children
}: {
  /** The stage's coordinate space, e.g. "0 0 1360 870". The SVG stretches to the stage box. */
  viewBox: string
  trigger?: 'mount' | 'inview' | boolean
  delay?: number
  /** Controlled state (e.g. from your own useDrawIn shared with callouts). Overrides trigger. */
  state?: DrawState
  /** Arrowhead length in viewBox units. */
  arrowSize?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const own = useDrawIn<SVGSVGElement>(controlled ? false : trigger, delay)
  const state = controlled ?? own.state
  return (
    <svg
      ref={own.ref}
      className={cn('leader-layer', className)}
      style={style}
      viewBox={viewBox}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      <LayerCtx.Provider value={{ arrow: arrowSize }}>{children}</LayerCtx.Provider>
    </svg>
  )
}

/**
 * One leader. `d` uses absolute or relative M/L/H/V commands only (straight drafting lines).
 * The last point is where it lands: the arrow's tip or the dot's centre.
 * `i` orders the draw-in (150 ms apart). `casing` adds a paper-coloured halo so the line reads
 * over busy product pixels.
 */
export function Leader({
  d,
  end = 'arrow',
  i = 0,
  casing = false,
  dotRadius = 3.5
}: {
  d: string
  end?: 'arrow' | 'dot' | 'none'
  i?: number
  casing?: boolean
  dotRadius?: number
}) {
  const { arrow } = useContext(LayerCtx)
  const pts = pathPoints(d)
  const style = { '--i': i } as CSSProperties
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2] ?? last
  let tip: ReactNode = null
  if (end === 'arrow' && last && prev) {
    const dx = last[0] - prev[0]
    const dy = last[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const bx = last[0] - ux * arrow
    const by = last[1] - uy * arrow
    const hw = arrow * 0.45
    const p = `M${f(last[0])} ${f(last[1])} L${f(bx - uy * hw)} ${f(by + ux * hw)} L${f(bx + uy * hw)} ${f(by - ux * hw)} Z`
    tip = <path className="leader-tip" d={p} style={style} />
  } else if (end === 'dot' && last) {
    tip = <circle className="leader-tip" cx={last[0]} cy={last[1]} r={dotRadius} style={style} />
  }
  return (
    <g>
      {casing ? <path className="leader-casing" d={d} pathLength={1} style={style} /> : null}
      <path className="leader-line" d={d} pathLength={1} style={style} />
      {tip}
    </g>
  )
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString()

/** Vertices of a path made of M/L/H/V commands (absolute or relative). */
export function pathPoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const re = /([MLHVmlhv])([^MLHVmlhv]*)/g
  let x = 0
  let y = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const cmd = m[1]
    const nums = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number)
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        for (let k = 0; k + 1 < nums.length; k += 2) {
          x = rel ? x + nums[k] : nums[k]
          y = rel ? y + nums[k + 1] : nums[k + 1]
          out.push([x, y])
        }
        break
      case 'H':
        for (const n of nums) {
          x = rel ? x + n : n
          out.push([x, y])
        }
        break
      case 'V':
        for (const n of nums) {
          y = rel ? y + n : n
          out.push([x, y])
        }
        break
    }
  }
  return out
}
