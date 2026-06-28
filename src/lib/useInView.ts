import { useEffect, useRef, useState } from 'react'

/**
 * Reveal-on-scroll. Returns a ref + whether it has entered the viewport once.
 * Pair with the `.reveal` / `.is-in` classes in index.css.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string; once?: boolean } = {}
): { ref: React.RefObject<T>; inView: boolean } {
  const { threshold = 0.18, rootMargin = '0px 0px -8% 0px', once = true } = options
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) obs.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
