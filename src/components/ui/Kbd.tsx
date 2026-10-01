import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A key or chord. Pass the chord as written in the app: <Kbd>Ctrl+Shift+X</Kbd>.
 * Keep it out of magenta callouts (it reads as a second style inside a comment).
 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('kbd', className)}>{children}</kbd>
}
