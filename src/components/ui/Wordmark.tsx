import { cn } from '../../lib/cn'

/** The brass diamond + "TerminalDeck". The diamond is a product pixel (brass). */
export function Wordmark({ className, size = 19 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2 font-[650] tracking-[-0.01em]', className)}
      style={{ fontSize: size, fontStretch: '110%' }}
    >
      {/* A rotated square overhangs its layout box by (diagonal - side) / 2, plus the 1 px outline:
          inset it by that much so the diamond's visible left edge sits exactly on the container edge. */}
      <i
        aria-hidden="true"
        className="block flex-none rotate-45 bg-brass outline outline-1 outline-brass-edge"
        style={{
          width: Math.round(size * 0.58),
          height: Math.round(size * 0.58),
          marginInline: Math.round(size * 0.58 * 0.2071) + 1
        }}
      />
      TerminalDeck
    </span>
  )
}
