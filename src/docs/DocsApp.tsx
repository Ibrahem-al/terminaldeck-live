/* The /docs user guide: one chapter at a time, routed by the hash (#the-notch, or any heading id).
   Links back to the site are relative ("../"), so they work at /docs and /docs/ alike. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Nav } from '../components/sections/Nav'
import { Plate } from '../components/ui/Plate'
import { Footer } from '../components/sections/Footer'
import { ISSUES_URL } from '../lib/links'
import { VERSION } from '../lib/facts'
import { CHAPTERS, locate, type Chapter } from './markdown'
import { Toc, TocBar } from './Toc'
import quad from '../assets/docs-01-workspace-quad.webp'
import notchOpen from '../assets/docs-34-notch-expanded.webp'
import drawer from '../assets/docs-09-messages-drawer.webp'
import sidebar from '../assets/docs-03-sidebar-tree.webp'
import themes from '../assets/docs-06-settings-themes.webp'

/** A real screenshot for the chapters that have one. Captions say only what the picture shows. */
const FIGURES: Record<string, { src: string; w: number; h: number; crop?: { w: number; h: number; pos: string }; alt: string; caption: string }> = {
  'decks-and-panes': {
    src: quad,
    w: 1600,
    h: 1000,
    alt: 'A TerminalDeck window with three deck tabs and a Quad deck of four terminal panes.',
    caption:
      'A Quad deck. Each pane header names what runs in it: Claude Code, Dev Server, cargo test · rust_app, Terminal 4.'
  },
  'the-notch': {
    src: notchOpen,
    w: 1000,
    h: 560,
    crop: { w: 760, h: 372, pos: 'center' }, // the 720 px pulldown; around it is empty desktop
    alt: 'The notch pulled down: a Claude Code permission question, a row of pane chips, and a mini terminal.',
    caption: 'The pulldown: the question, a chip for each pane, and a mini terminal you can answer in.'
  },
  'agents-working-together': {
    src: drawer,
    w: 1600,
    h: 1000,
    crop: { w: 820, h: 560, pos: 'right top' }, // the drawer, big enough to read
    alt: 'The Messages drawer beside a terminal pane, listing agent messages with their delivery status.',
    caption: 'The Messages drawer. Each message shows who sent it, who it went to, and whether it was delivered, queued or refused.'
  },
  'files-editor-projects': {
    src: sidebar,
    w: 1600,
    h: 1000,
    alt: 'The sidebar file tree open beside a Quad deck.',
    caption: 'The sidebar’s file tree beside a Quad deck.'
  },
  'themes-and-settings': {
    src: themes,
    w: 1600,
    h: 1000,
    alt: 'Settings open on Themes, showing the nine theme cards with Deepwater active.',
    caption: 'Settings → Themes. Hover a theme to preview it across the whole app; click to apply.'
  }
}

function useRoute() {
  const [route, setRoute] = useState(() => locate(location.hash))
  useEffect(() => {
    const onHash = (): void => setRoute(locate(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

/** The h2 whose top has passed a line 30 % down the viewport. */
function useActiveHeading(chapter: Chapter, root: React.RefObject<HTMLElement>): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const els = chapter.headings
      .filter((h) => h.depth === 2)
      .map((h) => document.getElementById(h.id))
      .filter((e): e is HTMLElement => !!e)
    let raf = 0
    const measure = (): void => {
      raf = 0
      const line = window.innerHeight * 0.3
      let cur: string | null = null
      for (const el of els) if (el.getBoundingClientRect().top <= line) cur = el.id
      setActive(cur)
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [chapter, root])
  return active
}

export function DocsApp() {
  const { chapter, target } = useRoute()
  const articleRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastKey = useRef<string | null>(null)
  const activeHeading = useActiveHeading(chapter, articleRef)
  const idx = CHAPTERS.indexOf(chapter)
  const prev = idx > 0 ? CHAPTERS[idx - 1] : null
  const next = idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null
  const fig = FIGURES[chapter.id]

  // Focus moves to the chapter or heading on every navigation (screen readers need it), but the ring is
  // drawn only when the visitor got there by keyboard; after a click it would read as a selection.
  const lastInput = useRef<'key' | 'pointer'>('pointer')
  useEffect(() => {
    const onKey = (): void => void (lastInput.current = 'key')
    const onPointer = (): void => void (lastInput.current = 'pointer')
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [])
  const focusQuietly = useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (lastInput.current === 'key') delete el.dataset.quietFocus
    else el.dataset.quietFocus = ''
    el.addEventListener('blur', () => delete el.dataset.quietFocus, { once: true })
    el.focus({ preventScroll: true })
  }, [])

  const place = useCallback(
    (id: string | null, moveFocus: boolean) => {
      if (id) {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ block: 'start' })
          if (moveFocus) focusQuietly(el)
          return
        }
      }
      window.scrollTo({ top: 0 })
      if (moveFocus) focusQuietly(titleRef.current)
    },
    [focusQuietly]
  )

  // After a route change, the new chapter is in the DOM: go to the target (or the top).
  useLayoutEffect(() => {
    const key = `${chapter.id}#${target ?? ''}`
    if (lastKey.current === key) return // StrictMode re-run

    place(target, lastKey.current !== null)
    lastKey.current = key
    document.title = chapter.num ? `${chapter.title} · TerminalDeck docs` : 'TerminalDeck docs'
  }, [chapter, target, place])

  // Clicking a link to the hash we're already on doesn't fire hashchange: scroll anyway.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (a.getAttribute('href') === location.hash) {
        e.preventDefault()
        const r = locate(location.hash)
        place(r.target, true)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [place])

  // "/" focuses the search (the visible one: sidebar on desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const input = searchRef.current
      if (input && input.offsetParent !== null) {
        e.preventDefault()
        input.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Copy buttons on code plates.
  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const onClick = async (e: MouseEvent): Promise<void> => {
      const btn = (e.target as Element).closest('[data-copy]') as HTMLButtonElement | null
      if (!btn) return
      const code = btn.parentElement?.querySelector('code')?.textContent ?? ''
      try {
        await navigator.clipboard.writeText(code)
        btn.textContent = 'Copied'
      } catch {
        btn.textContent = 'Select and copy'
      }
      window.setTimeout(() => (btn.textContent = 'Copy'), 1600)
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <a className="skip-link" href="#docs-main" onClick={(e) => {
        e.preventDefault()
        titleRef.current?.focus()
      }}>
        Skip to the chapter
      </a>
      <Nav docs />

      <TocBar current={chapter} activeHeading={activeHeading} />

      <div className="wrap docs-layout">
        <aside className="docs-side" aria-label="Guide contents">
          <Toc current={chapter} activeHeading={activeHeading} searchRef={searchRef} />
        </aside>

        <main id="docs-main" className="docs-main" ref={articleRef}>
          <header className="docs-chead">
            <h1 ref={titleRef} tabIndex={-1} className="docs-title display">
              {chapter.num ? (
                <span className="docs-title-num tnum">
                  <span className="sr-only">Chapter </span>
                  {chapter.num}
                </span>
              ) : null}
              <span>{chapter.title}</span>
            </h1>
            {chapter.summary ? (
              <p className="docs-summary">{chapter.summary}.</p>
            ) : (
              <p className="docs-summary">
                For version {VERSION} on Windows 10 and 11. The guide has {CHAPTERS.length - 1} chapters, from the first launch to troubleshooting.
              </p>
            )}
          </header>

          {fig ? (
            <figure className="docs-fig">
              <Plate
                style={fig.crop ? { aspectRatio: `${fig.crop.w} / ${fig.crop.h}` } : undefined}
              >
                <img
                  src={fig.src}
                  width={fig.w}
                  height={fig.h}
                  alt={fig.alt}
                  loading="eager"
                  {...({ fetchpriority: "high" } as Record<string, string>)}
                  decoding="async"
                  className={fig.crop ? 'docs-fig-crop' : undefined}
                  style={
                    fig.crop
                      ? {
                          width: `${(fig.w / fig.crop.w) * 100}%`,
                          ...(fig.crop.pos.includes('right')
                            ? { right: 0 }
                            : fig.crop.pos.includes('center')
                              ? { left: '50%', transform: 'translateX(-50%)' }
                              : { left: 0 })
                        }
                      : undefined
                  }
                />
              </Plate>
              <figcaption className="caption">{fig.caption}</figcaption>
            </figure>
          ) : null}

          <article
            key={chapter.id}
            className="docs-prose"
            aria-labelledby={undefined}
            dangerouslySetInnerHTML={{ __html: chapter.html }}
          />

          <nav className="docs-pager" aria-label="Previous and next chapter">
            {prev ? (
              <a href={`#${prev.id}`} className="docs-pager-prev">
                <span className="docs-pager-label">Previous chapter</span>
                <span className="docs-pager-title">
                  {prev.num ? <span className="tnum docs-pager-num">{prev.num}</span> : null}
                  {prev.num ? prev.title : 'Overview'}
                </span>
              </a>
            ) : (
              <span />
            )}
            {next ? (
              <a href={`#${next.id}`} className="docs-pager-next">
                <span className="docs-pager-label">Next chapter</span>
                <span className="docs-pager-title">
                  <span className="tnum docs-pager-num">{next.num}</span>
                  {next.title}
                </span>
              </a>
            ) : null}
          </nav>

          <p className="small docs-report">
            Something here wrong or missing?{' '}
            <a className="textlink" href={ISSUES_URL} rel="noopener">
              Tell us on GitHub
            </a>
            .
          </p>
        </main>
      </div>
      <Footer docs />
    </>
  )
}
