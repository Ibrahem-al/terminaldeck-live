import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A product object: Deepwater, 1 px #232b3a edge, radius 8, the directional navy shadow.
 * Nothing on paper gets a shadow; only Plates do.
 * `crop` = a screenshot crop hanging from a datum (no top edge, radius only on the bottom corners).
 */
export function Plate({
  as: Tag = 'div',
  crop = false,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType
  crop?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
  id?: string
  role?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}) {
  return (
    <Tag className={cn('plate', crop && 'plate-crop', className)} style={style} {...rest}>
      {children}
    </Tag>
  )
}
