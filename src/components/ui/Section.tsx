import type { ElementType, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'paper' | 'paper-deep' | 'deep'
export type Pad = 'default' | 'tight' | 'none'

/**
 * The one container: max 1280 px of content, 32 px gutters (20 px on phones).
 * Use it for anything that must line up with the rest of the page.
 */
export function Container({
  as: Tag = 'div',
  className,
  children
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  return <Tag className={cn('wrap', className)}>{children}</Tag>
}

/**
 * A full-bleed band (a chapter of the page): paper, paper-deep (#E3E9EE) or deep (Deepwater, light text).
 * Section spacing is built in: clamp(96px, 12vw, 160px) top and bottom ("tight": 64-112 px).
 * Two bands of the same tone in a row collapse the space between them.
 * Children sit inside the container unless `bleed` is set.
 */
export function Band({
  as: Tag = 'div',
  id,
  tone = 'paper',
  pad = 'default',
  flushTop = false,
  flushBottom = false,
  bleed = false,
  className,
  innerClassName,
  labelledBy,
  label,
  children
}: {
  as?: ElementType
  id?: string
  tone?: Tone
  pad?: Pad
  flushTop?: boolean
  flushBottom?: boolean
  /** Don't wrap children in the container (they manage their own width). */
  bleed?: boolean
  className?: string
  innerClassName?: string
  labelledBy?: string
  label?: string
  children: ReactNode
}) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={cn(
        'band',
        `band-${tone}`,
        pad === 'tight' && 'band-tight',
        pad === 'none' && 'band-flush-top band-flush-bottom',
        flushTop && 'band-flush-top',
        flushBottom && 'band-flush-bottom',
        className
      )}
    >
      {bleed ? children : <div className={cn('wrap', innerClassName)}>{children}</div>}
    </Tag>
  )
}

/**
 * A page section: a <section> Band. `grid` wraps children in the 12-column grid.
 * Pass `labelledBy` (the id of your h2) or `label` for the landmark name.
 */
export function Section({
  id,
  labelledBy,
  label,
  tone = 'paper',
  pad = 'default',
  grid = false,
  flush = false,
  className,
  innerClassName,
  children
}: {
  id?: string
  labelledBy?: string
  label?: string
  tone?: Tone
  pad?: Pad
  /** Wrap children in the 12-column grid. */
  grid?: boolean
  /** Drop the top padding. */
  flush?: boolean
  /** Classes on the full-bleed <section> (the band). */
  className?: string
  /** Classes on the inner container. */
  innerClassName?: string
  children: ReactNode
}) {
  return (
    <Band
      as="section"
      id={id}
      tone={tone}
      pad={pad}
      flushTop={flush}
      labelledBy={labelledBy}
      label={label}
      className={className}
      innerClassName={innerClassName}
    >
      {grid ? <div className="grid-12">{children}</div> : children}
    </Band>
  )
}

/**
 * The standard section head: H2 in columns 1-7, supporting text in 8-12 (stacks below 1100 px).
 * `stack` puts the text under the title (title 1-10, text 1-7).
 * `titleId` is what you pass to <Section labelledBy>.
 */
export function SectionHead({
  titleId,
  title,
  children,
  stack = false,
  className
}: {
  titleId: string
  title: ReactNode
  children?: ReactNode
  stack?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid-12 section-head', stack && 'section-head-stack', className)}>
      <h2 id={titleId} className="section-title h2">
        {title}
      </h2>
      {children ? <div className="section-text">{children}</div> : null}
    </div>
  )
}
