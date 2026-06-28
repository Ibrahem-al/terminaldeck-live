import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-lg font-ui font-semibold whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40'

const sizes: Record<Size, string> = {
  md: 'h-10 px-4 text-[13.5px]',
  lg: 'h-12 px-5 text-[14.5px]'
}

const variants: Record<Variant, string> = {
  // Brass primary — the locked accent. Subtle lift + warm glow + a metal sheen sweep.
  primary:
    'btn-sheen bg-accent text-ink-inverse shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset] hover:brightness-[1.06] hover:shadow-[0_8px_24px_-8px_var(--accent-soft)] hover:-translate-y-0.5',
  secondary:
    'border border-edge bg-raised/60 text-ink hover:border-accent/60 hover:bg-overlay hover:-translate-y-0.5',
  ghost: 'text-ink-2 hover:bg-raised hover:text-ink'
}

export function Button({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  newTab,
  type = 'button',
  'aria-label': ariaLabel
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  variant?: Variant
  size?: Size
  className?: string
  newTab?: boolean
  type?: 'button' | 'submit'
  'aria-label'?: string
}): React.JSX.Element {
  const cls = cn(base, sizes[size], variants[variant], className)
  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        className={cls}
        {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }
  return (
    <button type={type} onClick={onClick} aria-label={ariaLabel} className={cls}>
      {children}
    </button>
  )
}
