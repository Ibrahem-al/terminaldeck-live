import { useLayoutEffect, useRef, useState } from 'react'

/**
 * How large an element is drawn compared with its natural width (1 = actual size).
 * Captions use it so "at actual size" is only ever said when it's true.
 */
export function useRenderedScale<T extends HTMLElement>(naturalWidth: number) {
  const ref = useRef<T>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setScale(Math.min(1, el.getBoundingClientRect().width / naturalWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalWidth])
  return [ref, scale] as const
}

/** "at actual size" at 1:1, otherwise "shown at 64 % of actual size". */
export function sizeNote(scale: number): string {
  return scale >= 0.985 ? 'at actual size' : `shown at ${Math.round(scale * 100)} % of actual size`
}
