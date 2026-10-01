/**
 * The product theme: which of the app's nine themes the PRODUCT is shown in.
 * The paper page never changes colour; only product surfaces follow this
 * (the demo iframe via demoClient.theme(id), stills that have a matching shot,
 * and any product-pixel element that reads the CSS tokens from productTokens()).
 * Persisted per visitor; the demo stores its own copy under its own origin path.
 */
import { useSyncExternalStore } from 'react'
import { THEMES, cssTokens, themeById, type ThemeSpec } from '../styles/themes'

const KEY = 'terminaldeck.site.productTheme'
const listeners = new Set<() => void>()

function read(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && THEMES.some((t) => t.id === v)) return v
  } catch {
    /* storage blocked */
  }
  return 'deepwater'
}

let current = typeof window === 'undefined' ? 'deepwater' : read()

export function getProductTheme(): string {
  return current
}

export function setProductTheme(id: string): void {
  if (!THEMES.some((t) => t.id === id) || id === current) return
  current = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** [themeSpec, setTheme]. */
export function useProductTheme(): [ThemeSpec, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, getProductTheme, () => 'deepwater')
  return [themeById(id), setProductTheme]
}

/** Inline-style object of the app's CSS tokens (--bg-base, --accent, --ansi-0…) for a product surface. */
export function productTokens(t: ThemeSpec): React.CSSProperties {
  return cssTokens(t) as React.CSSProperties
}

export { THEMES }
