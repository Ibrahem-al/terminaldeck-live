import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CHAPTERS, type Chapter } from './markdown'

/* ------------------------------------------------------------------ search index */

interface Hit {
  key: string
  href: string
  text: string
  /** where it lives: "3 The notch" or "3 The notch · Notch settings" */
  where: string
  kind: 'chapter' | 'heading' | 'row'
  detail?: string
}

const chapterLabel = (c: Chapter): string => (c.num ? `${c.num} ${c.title}` : c.title)

const INDEX: Hit[] = CHAPTERS.flatMap((c) => {
  const out: Hit[] = [{ key: c.id, href: `#${c.id}`, text: c.title, where: c.summary, kind: 'chapter' }]
  const headText = new Map(c.headings.map((h) => [h.id, h.text]))
  for (const h of c.headings) out.push({ key: h.id, href: `#${h.id}`, text: h.text, where: chapterLabel(c), kind: 'heading' })
  c.rows.forEach((r, i) =>
    out.push({
      key: `${c.id}-row-${i}`,
      href: `#${r.headingId}`,
      text: r.text,
      where: `${chapterLabel(c)} · ${headText.get(r.headingId) ?? c.title}`,
      kind: 'row',
      detail: r.detail
    })
  )
  return out
})

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ')

function search(q: string): Hit[] {
  const query = norm(q.trim())
  if (!query) return []
  const words = query.split(' ')
  const scored: { hit: Hit; score: number }[] = []
  for (const hit of INDEX) {
    const hay = norm(hit.text)
    const all = norm(`${hit.text} ${hit.detail ?? ''}`)
    if (!words.every((w) => all.includes(w))) continue
    let score = hit.kind === 'chapter' ? 0 : hit.kind === 'heading' ? 10 : 20
    if (hay.startsWith(query)) score -= 5
    else if (!hay.includes(query)) score += 8
    scored.push({ hit, score })
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.hit)
}

function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  const query = q.trim()
  if (!query) return text
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

/* ------------------------------------------------------------------ the side panel */

export function Toc({
  current,
  activeHeading,
  onNavigate,
  searchRef
}: {
  current: Chapter
  activeHeading: string | null
  onNavigate?: () => void
  searchRef?: React.RefObject<HTMLInputElement>
}) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => search(q), [q])
  const inputId = useId()
  const resultsId = useId()
  const shown = hits.slice(0, 40)

  const go = (href: string): void => {
    location.hash = href
    setQ('')
    onNavigate?.()
  }

  return (
    <div className="docs-toc">
      <a href="#overview" className="docs-toc-home" onClick={onNavigate}>
        User guide
      </a>
      <div className="docs-search" role="search">
        <label htmlFor={inputId} className="docs-search-label">
          Search the guide
        </label>
        <div className="docs-search-box">
          <input
            ref={searchRef}
            id={inputId}
            type="search"
            value={q}
            autoComplete="off"
            spellCheck={false}
            placeholder="Headings and keys"
            aria-controls={q ? resultsId : undefined}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[0]) {
                e.preventDefault()
                go(shown[0].href)
              } else if (e.key === 'Escape' && q) {
                e.preventDefault()
                e.stopPropagation()
                setQ('')
              }
            }}
          />
          {!q ? (
            <kbd className="kbd docs-search-hint" aria-hidden="true">
              /
            </kbd>
          ) : null}
        </div>
      </div>

      {q ? (
        <div id={resultsId} className="docs-results">
          <p className="docs-results-count" role="status">
            {hits.length === 0
              ? 'Nothing in the guide matches that.'
              : hits.length === 1
                ? '1 match'
                : `${hits.length} matches${hits.length > shown.length ? `, showing the first ${shown.length}` : ''}`}
          </p>
          <ul>
            {shown.map((h) => (
              <li key={h.key}>
                <a
                  href={h.href}
                  onClick={(e) => {
                    e.preventDefault()
                    go(h.href)
                  }}
                >
                  <span className="docs-result-text">
                    <Highlight text={h.text} q={q} />
                  </span>
                  {h.detail ? <span className="docs-result-detail">{h.detail}</span> : null}
                  <span className="docs-result-where">{h.where}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <nav aria-label="Chapters" className="docs-chapters">
          <ol>
            {CHAPTERS.map((c) => {
              const here = c.id === current.id
              const subs = here ? c.headings.filter((h) => h.depth === 2) : []
              return (
                <li key={c.id} className={here ? 'is-current' : undefined}>
                  <a href={`#${c.id}`} aria-current={here ? 'page' : undefined} onClick={onNavigate}>
                    <span className="docs-toc-num tnum" aria-hidden="true">
                      {c.num || ''}
                    </span>
                    <span>{c.num ? c.title : 'Overview'}</span>
                  </a>
                  {subs.length ? (
                    <ul aria-label={`In ${c.title}`}>
                      {subs.map((h) => (
                        <li key={h.id}>
                          <a
                            href={`#${h.id}`}
                            aria-current={activeHeading === h.id ? 'location' : undefined}
                            onClick={onNavigate}
                          >
                            {h.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </nav>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ phone: collapsible bar */

export function TocBar({
  current,
  activeHeading
}: {
  current: Chapter
  activeHeading: string | null
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onResize = (): void => {
      if (window.innerWidth > 900) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [current.id])

  return (
    <div className="docs-bar">
      <div className="wrap">
        <button
          ref={btnRef}
          type="button"
          className="docs-bar-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="docs-bar-label">Chapters</span>
          <span className="docs-bar-current">
            {current.num ? (
              <Fragment>
                <span className="tnum">{current.num}</span> {current.title}
              </Fragment>
            ) : (
              'Overview'
            )}
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="docs-bar-chev">
            <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div id={panelId} className="docs-bar-panel" hidden={!open}>
        <div className="wrap">
          <Toc
            current={current}
            activeHeading={activeHeading}
            searchRef={searchRef}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
