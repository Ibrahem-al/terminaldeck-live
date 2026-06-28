import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Reveal } from './Reveal'

/** A full-bleed section with a centered max-width content column. */
export function Section({
  id,
  children,
  className,
  containerClassName,
  grid = false
}: {
  id?: string
  children: ReactNode
  className?: string
  containerClassName?: string
  grid?: boolean
}): React.JSX.Element {
  return (
    <section id={id} className={cn('relative scroll-mt-20', className)}>
      {grid && <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-50" />}
      <div className={cn('relative mx-auto w-full max-w-[1180px] px-5 sm:px-8', containerClassName)}>
        {children}
      </div>
    </section>
  )
}

/**
 * A section header. Eyebrow ("kicker") is opt-in and used sparingly on purpose
 * — most headlines stand alone, per the taste discipline against templated rhythm.
 */
export function SectionHeading({
  kicker,
  title,
  sub,
  align = 'center',
  className
}: {
  kicker?: string
  title: ReactNode
  sub?: ReactNode
  align?: 'center' | 'left'
  className?: string
}): React.JSX.Element {
  const centered = align === 'center'
  return (
    <Reveal
      className={cn(
        'flex flex-col gap-4',
        centered ? 'items-center text-center' : 'items-start text-left',
        className
      )}
    >
      {kicker && (
        <span className="font-mono text-[11px] font-medium tracking-[0.22em] text-accent uppercase">
          {kicker}
        </span>
      )}
      <h2
        className={cn(
          'font-display text-balance text-[clamp(2rem,4.6vw,3.25rem)] leading-[1.02] font-semibold text-ink',
          centered && 'max-w-[18ch]'
        )}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={cn(
            'text-pretty font-ui text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-ink-2',
            centered ? 'max-w-[58ch]' : 'max-w-[54ch]'
          )}
        >
          {sub}
        </p>
      )}
    </Reveal>
  )
}
