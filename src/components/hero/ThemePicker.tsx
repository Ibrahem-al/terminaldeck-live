import { useEffect, useId, useRef, useState } from 'react'
import { THEMES, useProductTheme } from '../../lib/productTheme'
import type { ThemeSpec } from '../../styles/themes'
import { cn } from '../../lib/cn'

/** A tiny product swatch: the theme's base, a raised strip and its accent. Product pixels. */
function Swatch({ t, size = 'md' }: { t: ThemeSpec; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('tp-swatch', size === 'sm' && 'tp-swatch-sm')} style={{ background: t.bg[0], borderColor: t.edge[0] }} aria-hidden="true">
      <span style={{ background: t.bg[2] }} />
      <i style={{ background: t.accent }} />
    </span>
  )
}

/**
 * Recolours the PRODUCT (the demo iframe), never the paper page.
 * A disclosure button naming the current theme, opening a radio group of the app's nine themes.
 * Arrow keys move between themes and preview each one (roving tabindex). Choosing one (click, Enter or
 * Space) closes it and returns focus to the button; so do Escape, a click outside and scrolling the page.
 */
export function ThemePicker({ onPick, disabled = false }: { onPick?: (id: string) => void; disabled?: boolean }) {
  const [theme, setTheme] = useProductTheme()
  const [open, setOpen] = useState(false)
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  /** Close, and bring focus back to the button if it was inside the panel. */
  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus || panel.current?.contains(document.activeElement)) btn.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return
    const current = panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    current?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(true)
    }
    const y0 = window.scrollY
    const onScroll = (): void => {
      if (Math.abs(window.scrollY - y0) > 24) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const pick = (tid: string): void => {
    setTheme(tid)
    onPick?.(tid)
  }

  const onRadioKey = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    const cols = 3
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % THEMES.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + THEMES.length) % THEMES.length
    else if (e.key === 'ArrowDown') next = (idx + cols) % THEMES.length
    else if (e.key === 'ArrowUp') next = (idx - cols + THEMES.length) % THEMES.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = THEMES.length - 1
    if (next < 0) return
    e.preventDefault()
    const el = panel.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]
    el?.focus()
    pick(THEMES[next].id)
  }

  return (
    <div className="tp">
      <button
        ref={btn}
        type="button"
        className="btn btn-secondary btn-sm tp-btn"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        title={disabled ? 'The live demo isn’t available right now' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Swatch t={theme} size="sm" />
        <span>
          {theme.name} <span className="tp-suffix">theme</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={cn('tp-chev', open && 'tp-chev-open')}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div ref={panel} id={id} className="tp-panel" hidden={!open}>
        <p className="tp-title">Recolour the app with any of its nine themes</p>
        <div role="radiogroup" aria-label="Product theme" className="tp-grid">
          {THEMES.map((t, idx) => {
            const on = t.id === theme.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className="tp-opt"
                onClick={() => {
                  pick(t.id)
                  close(true)
                }}
                onKeyDown={(e) => onRadioKey(e, idx)}
              >
                <Swatch t={t} />
                <span className="tp-name">{t.name}</span>
                <span className="tp-kind">{t.kind === 'light' ? 'Light' : 'Dark'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
