import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A magenta italic annotation (Archivo italic, width 82, weight 500). Italic means annotation:
 * use it only for text that comments on the product (callouts, ratios, datum labels).
 * <b> inside it names the part: <Callout><b>The Notch</b> lights up when…</Callout>
 */
export function Callout({
  as: Tag = 'p',
  size = 'md',
  tone = 'magenta',
  marker,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType
  /** 14 / 15 / 16 px */
  size?: 'sm' | 'md' | 'lg'
  /** pencil = a neutral annotation (datum labels like "top of your screen") */
  tone?: 'magenta' | 'pencil'
  /** Optional lettered marker (A–E) shown before the text, for the phone key. */
  marker?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  [k: `data-${string}`]: string | number | undefined
  id?: string
}) {
  return (
    <Tag
      className={cn('callout', `callout-${size}`, tone === 'pencil' && 'callout-pencil', marker && 'flex gap-2.5', className)}
      style={style}
      {...rest}
    >
      {marker ? (
        <>
          <Marker letter={marker} />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Tag>
  )
}

/** The lettered magenta marker used on phones in place of leader lines. Decorative: pair it with a key. */
export function Marker({ letter, className, style }: { letter: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn('marker', className)} style={style} aria-hidden="true">
      {letter}
    </span>
  )
}
