import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { THEMES, useTheme } from '../../lib/theme'
import { cn } from '../../lib/cn'

/**
 * A compact theme switcher for the nav. Hovering a row live-previews that
 * theme across the entire page (exactly like the app's gallery); clicking
 * commits it. The signature interactive control of the site.
 */
export function ThemeMenu({ align = 'right' }: { align?: 'right' | 'left' }): React.JSX.Element {
  const { themeId, active, commit, preview } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        preview(null)
      }
    }
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        preview(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, preview])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch theme"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-edge bg-raised/60 px-2.5 font-ui text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
      >
        <Palette size={14} className="text-accent" />
        <span className="hidden sm:inline">{active.name}</span>
        <span
          className="h-2.5 w-2.5 rounded-full ring-1 ring-edge"
          style={{ backgroundColor: active.accent }}
        />
      </button>

      {open && (
        <div
          className={cn(
            'modal-enter absolute z-50 mt-2 w-[244px] overflow-hidden rounded-xl border border-edge bg-overlay p-1.5 shadow-2xl',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          onMouseLeave={() => preview(null)}
        >
          <p className="px-2.5 pt-1.5 pb-1 font-ui text-[10px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
            Theme · {THEMES.length} originals
          </p>
          <div className="max-h-[60vh] overflow-y-auto">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onMouseEnter={() => preview(t.id)}
                onFocus={() => preview(t.id)}
                onClick={() => {
                  commit(t.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                  t.id === themeId ? 'bg-raised' : 'hover:bg-raised'
                )}
              >
                <span className="flex shrink-0 items-center gap-1 rounded-md border border-edge-2 p-1" style={{ background: t.bg[0] }}>
                  <span className="h-3 w-3 rounded-full" style={{ background: t.accent }} />
                  <span className="h-3 w-1.5 rounded-full" style={{ background: t.ink[0] }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-ui text-[12.5px] font-medium text-ink">
                    {t.name}
                  </span>
                  <span className="block truncate font-ui text-[10.5px] text-ink-3">{t.tagline}</span>
                </span>
                {t.id === themeId ? (
                  <Check size={13} className="shrink-0 text-accent" />
                ) : (
                  <span
                    className="shrink-0 rounded px-1 py-px font-ui text-[8.5px] font-semibold tracking-wider text-ink-3 uppercase"
                  >
                    {t.kind}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
