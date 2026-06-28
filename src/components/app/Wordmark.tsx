import { cn } from '../../lib/cn'

/** The brass ❯_ mark + wordmark, matching the app icon and RemoteDeck brand. */
export function Wordmark({
  className,
  markOnly = false,
  size = 18
}: {
  className?: string
  markOnly?: boolean
  size?: number
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-2 font-ui font-semibold text-ink', className)}>
      <span
        aria-hidden
        className="inline-flex items-center font-mono font-bold text-accent"
        style={{ fontSize: size, letterSpacing: '-0.04em' }}
      >
        ❯_
      </span>
      {!markOnly && (
        <span className="tracking-[-0.01em]" style={{ fontSize: size }}>
          Terminal<span className="text-accent">Deck</span>
        </span>
      )}
    </span>
  )
}
