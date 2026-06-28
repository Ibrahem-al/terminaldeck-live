import { useEffect, useState } from 'react'
import { ArrowRight, Check, Download, Info } from 'lucide-react'
import type { ToastDetail, ToastKind } from '../../lib/toast'

interface ToastItem extends ToastDetail {
  id: number
}

const icons: Record<ToastKind, typeof Info> = {
  info: Info,
  download: Download,
  check: Check
}

let seq = 0

/** Bottom-center toast stack. Mount once at the app root. */
export function Toaster(): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event): void => {
      const detail = (e as CustomEvent<ToastDetail>).detail
      const id = ++seq
      setItems((cur) => [...cur, { id, ...detail }])
      window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3200)
    }
    window.addEventListener('td-toast', onToast)
    return () => window.removeEventListener('td-toast', onToast)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => {
        const Icon = icons[t.kind ?? 'info']
        const inner = (
          <>
            <Icon size={15} className="shrink-0 text-accent" />
            <span className="font-ui text-[13px] font-medium text-ink">{t.message}</span>
            {t.href && <ArrowRight size={14} className="shrink-0 text-ink-3" />}
          </>
        )
        const cls =
          'toast-enter pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-xl border border-edge bg-overlay/95 px-3.5 py-2.5 shadow-[0_18px_44px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md'
        return t.href ? (
          <a key={t.id} href={t.href} className={cls}>
            {inner}
          </a>
        ) : (
          <div key={t.id} className={cls}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
