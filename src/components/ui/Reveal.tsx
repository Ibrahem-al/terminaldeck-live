import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useInView } from '../../lib/useInView'
import { cn } from '../../lib/cn'

/**
 * Scroll-reveal wrapper. `delay` staggers siblings; the motion is purely CSS
 * (see `.reveal` in index.css) and respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  as: As = 'div',
  delay = 0,
  className
}: {
  children: ReactNode
  as?: ElementType
  delay?: number
  className?: string
}): React.JSX.Element {
  const { ref, inView } = useInView<HTMLElement>()
  const style: CSSProperties = delay ? { transitionDelay: `${delay}ms` } : {}
  return (
    <As ref={ref} style={style} className={cn('reveal', inView && 'is-in', className)}>
      {children}
    </As>
  )
}
