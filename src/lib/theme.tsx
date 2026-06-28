import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { THEMES, themeById, cssTokens, type ThemeSpec } from '../styles/themes'

/**
 * Live theme engine — a faithful port of how the desktop app applies a theme.
 * Previewing (hover in the gallery) writes the token map to :root without
 * committing; committing persists the choice and triggers the cross-fade.
 */

interface ThemeCtx {
  /** The committed theme id. */
  themeId: string
  /** The theme currently painted on screen (preview overrides committed). */
  active: ThemeSpec
  commit: (id: string) => void
  preview: (id: string | null) => void
}

const Ctx = createContext<ThemeCtx | null>(null)
const STORAGE_KEY = 'terminaldeck.theme'

function applyTokens(t: ThemeSpec): void {
  const root = document.documentElement
  const tokens = cssTokens(t)
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v)
  root.style.colorScheme = t.kind
  root.setAttribute('data-theme', t.id)
  root.setAttribute('data-theme-kind', t.kind)
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'deepwater'
    return localStorage.getItem(STORAGE_KEY) ?? 'deepwater'
  })
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fadeTimer = useRef<number | null>(null)

  const active = useMemo(() => themeById(previewId ?? themeId), [previewId, themeId])

  // Paint whenever the resolved theme changes.
  useEffect(() => {
    applyTokens(active)
  }, [active])

  const commit = useCallback((id: string) => {
    const root = document.documentElement
    root.setAttribute('data-theme-fade', '')
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current)
    fadeTimer.current = window.setTimeout(() => root.removeAttribute('data-theme-fade'), 260)
    setPreviewId(null)
    setThemeId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* private mode — non-fatal */
    }
  }, [])

  const preview = useCallback((id: string | null) => setPreviewId(id), [])

  const value = useMemo<ThemeCtx>(
    () => ({ themeId, active, commit, preview }),
    [themeId, active, commit, preview]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export { THEMES }
export type { ThemeSpec }
