import { useEffect } from 'react'

/**
 * One global pointer listener that feeds the cursor position (relative to the
 * hovered `.spotlight` card) into its --mx/--my CSS vars, so the brass
 * border-glow tracks the cursor. rAF-throttled and written straight to the DOM
 * (never React state) so it stays smooth and never re-renders the tree.
 * Also mounts the top scroll-progress bar.
 */
export function Spotlight(): React.JSX.Element {
  useEffect(() => {
    let raf = 0
    let pending: { el: HTMLElement; x: number; y: number } | null = null

    const flush = (): void => {
      raf = 0
      if (!pending) return
      pending.el.style.setProperty('--mx', `${pending.x}px`)
      pending.el.style.setProperty('--my', `${pending.y}px`)
      pending = null
    }

    const onMove = (e: PointerEvent): void => {
      if (!(e.target instanceof Element)) return
      const target = e.target.closest<HTMLElement>('.spotlight')
      if (!target) return
      const r = target.getBoundingClientRect()
      pending = { el: target, x: e.clientX - r.left, y: e.clientY - r.top }
      if (!raf) raf = requestAnimationFrame(flush)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return <div className="scroll-progress" aria-hidden />
}
