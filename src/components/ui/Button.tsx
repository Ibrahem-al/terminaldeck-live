import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { DOWNLOAD_URL } from '../../lib/links'
import { INSTALLER, VERSION } from '../../lib/facts'

/**
 * primary   = brass. ONLY for the Download action (brass is a product colour).
 * secondary = ink outline on paper, for every other action ("Play the tour", "Reset").
 * onplate   = translucent dark, for actions sitting on a product Plate (e.g. "Play the film").
 * No arrows on buttons. Sentence case labels.
 */
type Variant = 'primary' | 'secondary' | 'onplate'
type Size = 'lg' | 'md' | 'sm'
type Icon = 'download' | 'play' | 'pause' | 'reset' | 'none'

interface Common {
  variant?: Variant
  size?: Size
  icon?: Icon
  className?: string
  children: ReactNode
}

type AsLink = Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>
type AsButton = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>

export function Button(props: AsLink | AsButton) {
  const { variant = 'secondary', size = 'md', icon = 'none', className, children, ...rest } = props
  const cls = cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', className)
  const inner = (
    <>
      {icon !== 'none' ? <ButtonIcon icon={icon} size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} /> : null}
      <span>{children}</span>
    </>
  )
  if (typeof props.href === 'string') {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  )
}

/**
 * The one Download button. Label "Download for Windows"; `compact` drops "for Windows" below 640 px.
 * The accessible name always carries the version and size.
 */
export function DownloadButton({
  size = 'md',
  compact = false,
  className
}: {
  size?: Size
  compact?: boolean
  className?: string
}) {
  return (
    <Button
      href={DOWNLOAD_URL}
      variant="primary"
      size={size}
      icon={size === 'sm' ? 'none' : 'download'}
      className={className}
      aria-label={`Download TerminalDeck ${VERSION} for Windows, ${INSTALLER.sizeLabel}`}
    >
      Download
      <span className={compact ? 'max-[640px]:hidden' : undefined}> for Windows</span>
    </Button>
  )
}

function ButtonIcon({ icon, size }: { icon: Exclude<Icon, 'none'>; size: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true as const, focusable: false as const }
  switch (icon) {
    case 'download':
      return (
        <svg {...common}>
          <path
            d="M8 1.5v8.5M4.2 6.6 8 10.4l3.8-3.8M2 12.5v2h12v-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'play':
      return (
        <svg {...common}>
          <path d="M4 2.2v11.6L13.5 8z" fill="currentColor" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...common}>
          <path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" fill="currentColor" />
        </svg>
      )
    case 'reset':
      return (
        <svg {...common}>
          <path
            d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.5 1.8v3.1h3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}
