import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A to-scale horizontal dimension, drafting style: extension lines at both ends, a line with
 * arrowheads, the value centred on the line. When the span is too short to hold its arrows and
 * value, the arrows move outside and point in, and the value sits to the right (automatic,
 * measured; force with `outside`).
 *
 * Scale: `value / of` is the fraction of the available width (draw each before/after pair on
 * its own scale: before at of=before → 100 %, after at of=before → its true share).
 *
 *   <div className="border-l border-pencil">                         // the shared datum
 *     <DimensionLine value={126} of={126} label="126 MB" />
 *     <DimensionLine value={6.5} of={126} label="6.5 MB" emphasis note="about 19× smaller" />
 *   </div>
 *
 * `note` is a magenta italic annotation (a ratio the brief states, never a computed one).
 */
export function DimensionLine({
  value,
  of,
  label,
  emphasis = false,
  note,
  outside,
  className,
  title
}: {
  value: number
  of: number
  label: ReactNode
  /** The "after" value: ink, 2 px line, bold label. Otherwise pencil ("before"). */
  emphasis?: boolean
  note?: ReactNode
  /** Force the outside-arrows layout (true) or the inside layout (false). Default: measured. */
  outside?: boolean
  className?: string
  /** Accessible description, e.g. "Installer size in v0.3.9: 6.5 MB". Defaults to the label text. */
  title?: string
}) {
  const pct = Math.max(0, Math.min(1, of > 0 ? value / of : 0)) * 100
  const spanRef = useRef<HTMLSpanElement>(null)
  const valRef = useRef<HTMLSpanElement>(null)
  const [auto, setAuto] = useState(pct < 12)

  useLayoutEffect(() => {
    if (outside !== undefined) return
    const span = spanRef.current
    const val = valRef.current
    if (!span || !val) return
    const measure = (): void => {
      // Arrowheads (2 × 10 px) + breathing room either side of the value.
      setAuto(span.getBoundingClientRect().width < val.getBoundingClientRect().width + 36)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(span)
    return () => ro.disconnect()
  }, [outside, label])

  const isOut = outside ?? auto
  return (
    <div
      className={cn('dim', emphasis && 'dim-after', isOut ? 'dim-out' : 'dim-in', className)}
      role="img"
      aria-label={title}
    >
      <span ref={spanRef} className="dim-span" style={{ '--w': `${pct}%` } as CSSProperties}>
        <span className="dim-ln" aria-hidden="true" />
        <span ref={valRef} className="dim-v" aria-hidden={title ? true : undefined}>
          {label}
          {note && isOut ? <em className="dim-note">{note}</em> : null}
        </span>
        {note && !isOut ? (
          <em className="dim-note dim-note-beside" aria-hidden={title ? true : undefined}>
            {note}
          </em>
        ) : null}
      </span>
    </div>
  )
}

/**
 * A vertical dimension beside a plate (e.g. the Notch crops: 13 px, 34 px). Place it inside a
 * `position: relative` wrapper around the plate; it sits just right of the wrapper and spans
 * `height` from the top (the datum). Arrows are outside (these are small dimensions).
 */
export function VerticalDimension({
  height,
  label,
  small = false,
  className,
  style
}: {
  /** CSS length, e.g. "13px" or "32.5%" of the wrapper. */
  height: string
  label: ReactNode
  /** Too short to hold its value between the extension lines: the value moves past the lower arrow. */
  small?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <span className={cn('vdim', small && 'vdim-small', className)} style={{ '--h': height, ...style } as CSSProperties} aria-hidden="true">
      <span className="vdim-ln" />
      <span className="vdim-v">{label}</span>
    </span>
  )
}
